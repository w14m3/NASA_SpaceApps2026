"""V2 (SPICE vs Horizons), V3 (Apollo 11) and the Chebyshev runtime error bound."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import spiceypy as sp

from lunarnav import cheby, ephem as E, horizons as H

RESULTS = Path(__file__).resolve().parents[2] / "data" / "validation"
RESULTS.mkdir(parents=True, exist_ok=True)


def _record(name: str, payload: dict) -> None:
    (RESULTS / f"{name}.json").write_text(json.dumps(payload, indent=2) + "\n")


@pytest.mark.network
def test_v2_spice_vs_horizons_1000_pairs():
    """>= 1,000 random (site, time) pairs, Sun and Earth, tolerance 0.005 deg."""
    E.load_kernels()
    rng = np.random.default_rng(20261114)
    n_sites, n_times = 20, 50
    jd0, jd1 = 2461041.5, 2462867.5        # 2026-01-01 .. 2031-01-01 UTC
    stats = {}
    for code, name in (("10", "SUN"), ("399", "EARTH")):
        sep, d_el, d_az = [], [], []
        site_rng = np.random.default_rng(7)   # same sites for both bodies
        for _ in range(n_sites):
            lon = float(site_rng.uniform(-180, 180))
            # half the sites near the south pole (the product's focus), half anywhere
            lat = float(site_rng.uniform(-90, -80) if site_rng.random() < 0.5
                        else np.degrees(np.arcsin(site_rng.uniform(-1, 1))))
            alt = float(site_rng.uniform(-4, 6))
            jds = sorted(float(x) for x in rng.uniform(jd0, jd1, n_times))
            for row in H.observer_table(code, lon, lat, alt, jds):
                et = sp.str2et(f"JD {row['jd']:.8f} UTC")
                az, el, _ = E.azel(name, et, lon, lat, E.R_MOON_KM + alt)
                daz = (az - row["az"] + 180) % 360 - 180
                d_el.append(el - row["el"])
                d_az.append(daz * np.cos(np.radians(el)))
                sep.append(np.hypot(d_el[-1], d_az[-1]))
        stats[name] = {"pairs": len(sep), "max_deg": float(np.max(sep)),
                       "rms_deg": float(np.sqrt(np.mean(np.square(sep)))),
                       "max_abs_d_el_deg": float(np.max(np.abs(d_el))),
                       "max_abs_d_az_cos_el_deg": float(np.max(np.abs(d_az)))}
    _record("V2", {"tolerance_deg": 0.005, "stats": stats,
                   "note": "Horizons az/el are printed to 1e-6 deg; SPICE uses DE440s + "
                           "moon_pa_de440 (MOON_ME), Horizons DE441 + MEAN_ME."})
    print(json.dumps(stats, indent=1))
    assert stats["SUN"]["pairs"] + stats["EARTH"]["pairs"] >= 1000
    for s in stats.values():
        assert s["max_deg"] <= 0.005


@pytest.mark.network
def test_v3_apollo11_sun_elevation():
    """Apollo 11 touchdown: 1969-07-20 20:17:40 UTC at 0.67416 N, 23.47314 E.

    Site coordinates: LRO-era values in the ME frame (Wagner et al. 2017, Icarus 283,
    as tabulated by NASA NSSDCA).  Published mission source: the landing was planned
    for a Sun elevation of roughly 10 deg; Apollo 11 Mission Report gives ~10.8 deg.
    """
    E.load_kernels()
    lon, lat = 23.47314, 0.67416
    et = sp.str2et("1969-07-20T20:17:40")
    jd = float(sp.et2utc(et, "J", 8).split()[1])
    az, el, _ = E.azel("SUN", et, lon, lat, E.R_MOON_KM - 1.93)
    h = H.observer_table("10", lon, lat, -1.93, [jd])[0]
    _record("V3", {"tolerance_deg": 0.2, "spice_el_deg": el, "spice_az_deg": az,
                   "horizons_el_deg": h["el"], "horizons_az_deg": h["az"],
                   "published_el_deg": 10.8,
                   "published_source": "planned landing Sun elevation, NASA SP-4029 Apollo by the Numbers"})
    print(f"Apollo 11 Sun: SPICE el {el:.4f} az {az:.4f}; Horizons el {h['el']:.4f} az {h['az']:.4f}")
    assert abs(el - h["el"]) <= 0.2
    assert abs(el - 10.8) <= 0.2


def test_runtime_vector_vs_rigorous():
    """Browser shortcut (Moon-centre vector minus site) vs rigorous spkcpo."""
    E.load_kernels()
    rng = np.random.default_rng(3)
    worst = 0.0
    for _ in range(500):
        lon, lat = rng.uniform(-180, 180), rng.uniform(-90, 90)
        et = rng.uniform(sp.str2et("2026-01-01"), sp.str2et("2031-01-01"))
        for tgt in ("SUN", "EARTH"):
            a = E.azel(tgt, et, lon, lat, E.R_MOON_KM)
            b = E.azel(tgt, et, lon, lat, E.R_MOON_KM, rigorous=False)
            worst = max(worst, abs(a[1] - b[1]), abs((a[0] - b[0] + 180) % 360 - 180) * np.cos(np.radians(a[1])))
    _record("runtime_shortcut", {"max_deg": worst, "tolerance_deg": 0.001})
    assert worst < 0.001


def test_chebyshev_error_bound():
    """Fit of one year is accurate to < 0.001 deg seen from the surface."""
    model = cheby.fit("2026-11-01T00:00:00", 92)
    err = cheby.max_error(model, n=1500)
    _record("chebyshev_sample", {"tolerance_deg": 0.001, "errors": err})
    print(err)
    for e in err.values():
        assert e["max_deg_from_surface"] < 0.001
