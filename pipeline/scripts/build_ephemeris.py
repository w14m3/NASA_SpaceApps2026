"""Build the runtime ephemeris artifacts in web/public/data/ephem/ and the validation record V19.

Pieces (UTC ms independent variable; TAI-UTC asserted constant at 37 s over 2017-01-01 .. 2031-01-03):
  sun_earth_de421_2017_2026.bin  Sun, Earth seen from the Moon centre, MOON_ME, LT+S, from DE421 (this pipeline)
  sun_earth_de440_2026_2031.bin  same quantities from SPICE DE440 (reference/v1 artifact, copied byte for byte)
  moon_cirs_2017_2031.bin        apparent geocentric Moon in CIRS (DE421 + ERFA IAU 2006/2000A)
  ut1.json                       daily UT1-UTC from IERS finals2000A (astropy-iers-data)
Layout of every .bin: float64 little-endian [body][segment][axis xyz][coef 0..degree].
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import shutil
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lunarnav import cheby, ephem  # noqa: E402
from lunarnav.de421 import provenance  # noqa: E402
from lunarnav.timescales import tai_minus_utc  # noqa: E402
from lunarnav.v1ephem import V1, V1Ephem  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "data" / "ephem"
VAL = ROOT / "data" / "validation"
MS = lambda s: dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000.0  # noqa: E731
START = MS("2017-01-01T00:00:00Z")
SPLIT = MS("2026-01-01T00:00:00Z")
END = MS("2031-01-03T00:00:00Z")
SEG_S = 4 * 86400.0
DEG = 15


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def fit_and_check(fn, start, n_seg, name, rng, n_check=4000):
    coef = cheby.fit_segments(fn, start, SEG_S, n_seg, DEG)
    t = rng.uniform(start, start + n_seg * SEG_S * 1000.0, n_check)
    exact = fn(t)
    approx = cheby.evaluate(coef, start, SEG_S, t)
    err = cheby.angle_deg(exact, approx)
    print(f"{name}: fit max {err.max():.2e} deg, rms {np.sqrt((err**2).mean()):.2e} deg")
    return coef, {"max_deg": float(err.max()), "rms_deg": float(np.sqrt((err**2).mean())), "n_check": n_check}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    VAL.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(20261115)
    dtai = tai_minus_utc(np.linspace(START, END, 2000))
    assert np.allclose(dtai, 37.0), "a leap second falls inside the span: split the fit"

    # --- DE421 piece 2017 -> 2026 (+1 segment overlap)
    n421 = int(np.ceil((SPLIT - START) / (SEG_S * 1000))) + 1
    coefs, errs = [], {}
    for body in ("sun", "earth"):
        c, e = fit_and_check(lambda t, b=body: ephem.moon_me(b, t), START, n421, f"DE421 {body}", rng)
        coefs.append(c)
        errs[body.upper()] = e
    f421 = OUT / "sun_earth_de421_2017_2026.bin"
    np.stack(coefs).astype("<f8").tofile(f421)

    # --- DE440 piece: the v1 SPICE artifact, unchanged
    f440 = OUT / "sun_earth_de440_2026_2031.bin"
    shutil.copyfile(V1 / "ephem.bin", f440)
    v1 = V1Ephem()

    # --- Moon in CIRS 2017 -> 2031
    nm = int(np.ceil((END - START) / (SEG_S * 1000)))
    cm, em = fit_and_check(ephem.moon_cirs, START, nm, "Moon CIRS", rng)
    fm = OUT / "moon_cirs_2017_2031.bin"
    cm[None].astype("<f8").tofile(fm)

    # --- UT1-UTC daily table
    mjd, dut, flag, src = ephem.load_ut1_table()
    m0 = 57754.0  # 2017-01-01
    m1 = 62869.0  # 2031-01-03
    sel = (mjd >= m0) & (mjd <= m1)
    last_obs = float(mjd[sel & (flag == "I")].max())
    ut1 = {
        "source": f"IERS {src} (Bulletin A incl. predictions) from PyPI astropy-iers-data",
        "mjd0": float(mjd[sel][0]),
        "dut1_s": [round(float(x), 7) for x in dut[sel]],
        "last_observed_mjd": last_obs,
        "last_predicted_mjd": float(mjd[sel].max()),
        "beyond": "the last predicted value is held; |UT1-UTC| < 0.9 s so the Earth-rotation error stays < 0.004 deg",
    }
    (OUT / "ut1.json").write_text(json.dumps(ut1))

    # --- V19: DE421 pipeline vs SPICE DE440 over the overlap 2026-2031 (topocentric-equivalent angle)
    t = rng.uniform(v1.start_ms, v1.end_ms - 1e6, 5000)
    v19 = {}
    for body in ("SUN", "EARTH"):
        d = cheby.angle_deg(ephem.moon_me(body.lower(), t), v1.position(body, t))
        v19[body] = {"max_deg": float(d.max()), "rms_deg": float(np.sqrt((d**2).mean()))}
    worst = max(v["max_deg"] for v in v19.values()) + max(e["max_deg"] for e in errs.values())
    rec = {
        "id": "V19",
        "test": "Runtime ephemeris 2017-2031 vs SPICE: DE421 rebuild vs SPICE DE440 (v1) over 2026-2031, 5000 random "
                "instants, plus the Chebyshev fit error of the DE421 piece; the 2026-2031 piece is SPICE itself",
        "criterion": "<= 0.001 deg",
        "measured": {"de421_vs_spice_de440": v19, "fit_de421": errs, "fit_de440_v1": v1.meta["max_error_deg"]},
        "summary": f"max {worst:.1e} deg (DE421 vs DE440 + fit)",
        "status": "pass" if worst <= 1e-3 else "fail",
        "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
    (VAL / "V19.json").write_text(json.dumps(rec, indent=1))

    manifest = {
        "frame": "MOON_ME",
        "abcorr": "LT+S",
        "observer": "Moon centre (site parallax applied at runtime)",
        "time": "UTC Unix ms; TAI-UTC = 37 s constant over the span (asserted at build)",
        "layout": "float64 little-endian [body][segment][axis xyz][coef 0..degree]",
        "pieces": [
            {"id": "de421", "file": f421.name, "start_ms": START, "valid_until_ms": SPLIT, "seg_s": SEG_S,
             "degree": DEG, "n_seg": n421, "bodies": ["SUN", "EARTH"],
             "source": "JPL DE421 (PyPI de421 2008.1) rebuilt with LT+S and DE421 PA->ME rotation",
             "provenance": provenance(), "fit_error_deg": errs, "vs_spice_de440_deg": v19, "sha256": sha(f421)},
            {"id": "de440", "file": f440.name, "start_ms": v1.start_ms, "valid_until_ms": v1.end_ms,
             "seg_s": v1.meta["seg_seconds"], "degree": v1.meta["degree"], "n_seg": v1.meta["n_segments"],
             "bodies": v1.meta["targets"], "source": "SPICE DE440 via reference/v1 build (kernels and SHA-256 in "
             "reference/v1/web/public/data/manifest.json)", "kernels": v1.meta["kernels"],
             "fit_error_deg": v1.meta["max_error_deg"], "sha256": sha(f440)},
        ],
        "moon_cirs": {"file": fm.name, "start_ms": START, "valid_until_ms": END, "seg_s": SEG_S, "degree": DEG,
                      "n_seg": nm, "source": "DE421 apparent geocentric Moon (LT+S) rotated GCRS->CIRS with ERFA "
                      "c2i06a (IAU 2006/2000A)", "fit_error_deg": em, "sha256": sha(fm)},
        "ut1": "ut1.json",
        "built_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(json.dumps(rec["summary"]))


if __name__ == "__main__":
    main()
