"""Ephemeris pipeline tests (DE421 rebuild vs the SPICE DE440 oracle; Apollo 11 V3; timescales)."""
import datetime as dt
import json

import numpy as np
import pytest

from conftest import ROOT, needs_de421
from lunarnav import cheby
from lunarnav.timescales import tai_minus_utc, unix_ms_to_tdb_jd

pytestmark = pytest.mark.data


def ms(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000.0


def test_tai_utc_constant_2017_2031():
    t = np.linspace(ms("2017-01-01T00:00:00Z"), ms("2031-01-03T00:00:00Z"), 500)
    assert np.allclose(tai_minus_utc(t), 37.0)


def test_tdb_minus_utc_is_69_seconds_in_2027():
    jd = unix_ms_to_tdb_jd(np.array([ms("2027-06-01T00:00:00Z")]))[0]
    utc_jd = ms("2027-06-01T00:00:00Z") / 86_400_000 + 2440587.5
    assert abs((jd - utc_jd) * 86400 - 69.184) < 0.002


@needs_de421
def test_pa_to_me_convention():
    """D4: the TKFRAME transpose composition matches SPICE DE440 MOON_ME; the alternatives do not."""
    from lunarnav import ephem
    from lunarnav.v1ephem import V1Ephem
    v1 = V1Ephem()
    t = np.random.default_rng(3).uniform(v1.start_ms, v1.end_ms - 1e6, 400)
    d = cheby.angle_deg(ephem.moon_me("earth", t), v1.position("EARTH", t))
    assert d.max() < 1e-4


@needs_de421
def test_v3_apollo11_sun_elevation():
    """V3: Sun elevation at the Apollo 11 LM at touchdown vs cached JPL Horizons and NASA SP-4029 (planned 10.8 deg)."""
    from lunarnav import ephem
    site = {"lon": 23.47314, "lat": 0.67416}  # NSSDCA (LRO-derived), reference/v1 sites.json
    t = np.array([ms("1969-07-20T20:17:40Z")])
    p = ephem.moon_me("sun", t)[0]
    lo, la = np.radians(site["lon"]), np.radians(site["lat"])
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    # Horizons query used altitude -1.93 km on the 1737.4 km sphere
    pos = up * (1737.4 - 1.93)
    d = p - pos
    el = np.degrees(np.arcsin(d @ up / np.linalg.norm(d)))
    txt = (ROOT / "reference/v1/data/raw/horizons/362d36ed92f2cd0c6a7cb052.txt").read_text()
    row = txt.split("$$SOE")[1].split("$$EOE")[0].strip().split(",")
    el_h = float(row[4])
    published = 10.8
    rec = {
        "id": "V3", "test": "Apollo 11 touchdown 1969-07-20 20:17:40 UTC: Sun elevation from the DE421 pipeline vs the "
        "cached JPL Horizons response (DE441) and the planned value in NASA SP-4029 'Apollo by the Numbers' (10.8°, "
        "a planning value for the launch window, not a measurement at touchdown)",
        "criterion": "<= 0.2 deg vs Horizons and vs the published value",
        "measured": {"pipeline_deg": float(el), "horizons_deg": el_h, "published_deg": published},
        "summary": f"pipeline {el:.3f}°, Horizons {el_h:.3f}°, published (planned) {published}°",
        "status": "pass" if abs(el - el_h) <= 0.2 and abs(el - published) <= 0.2 else "fail",
        "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "generator": "pytest",
    }
    (ROOT / "data/validation/V3.json").write_text(json.dumps(rec, indent=1))
    assert abs(el - el_h) <= 0.2
    assert abs(el - published) <= 0.2


@needs_de421
def test_cheby_roundtrip():
    from lunarnav import ephem
    start = ms("2020-01-01T00:00:00Z")
    c = cheby.fit_segments(lambda t: ephem.moon_me("earth", t), start, 4 * 86400.0, 3, 15)
    t = np.linspace(start, start + 11 * 86400e3, 200)
    assert cheby.angle_deg(cheby.evaluate(c, start, 4 * 86400.0, t), ephem.moon_me("earth", t)).max() < 1e-6
