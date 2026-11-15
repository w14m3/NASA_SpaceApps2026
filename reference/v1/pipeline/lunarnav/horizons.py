"""Minimal, polite JPL Horizons client used only as an independent cross-check.

API: https://ssd-api.jpl.nasa.gov/doc/horizons.html  (read 2026-11-14)
Observer on the lunar surface: CENTER='coord@301', COORD_TYPE='GEODETIC',
SITE_COORD='E-lon(deg),lat(deg),alt(km)'.  Responses are cached on disk so a
re-run of the validation never re-queries the service.
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import requests

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
CACHE = Path(__file__).resolve().parents[2] / "data" / "raw" / "horizons"
_last_call = 0.0


def query(params: dict[str, str]) -> str:
    """Return the raw text result; one request at a time, >= 1.5 s apart."""
    global _last_call
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:24]
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{key}.txt"
    if f.exists():
        return f.read_text(encoding="utf-8")
    wait = 1.5 - (time.time() - _last_call)
    if wait > 0:
        time.sleep(wait)
    for attempt in range(4):
        r = requests.get(API, params={"format": "text", **params}, timeout=120)
        _last_call = time.time()
        if r.status_code == 200 and "$$SOE" in r.text:
            f.write_text(r.text, encoding="utf-8")
            (CACHE / f"{key}.json").write_text(json.dumps(params, indent=1))
            return r.text
        if r.status_code == 200:
            raise RuntimeError("Horizons returned no ephemeris:\n" + r.text[-1500:])
        time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"Horizons HTTP {r.status_code}")


def observer_table(target: str, lon_deg: float, lat_deg: float, alt_km: float,
                   jd_utc: list[float]) -> list[dict[str, float]]:
    """Apparent az/el, range and angular diameter of target (10 = Sun, 399 = Earth)
    from a lunar surface site at the given UTC Julian dates."""
    params = {
        "COMMAND": f"'{target}'",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"'{lon_deg:.6f},{lat_deg:.6f},{alt_km:.4f}'",
        "TLIST": " ".join(f"'{jd:.8f}'" for jd in jd_utc),
        "TLIST_TYPE": "JD",
        "TIME_TYPE": "UT",
        "QUANTITIES": "'4,13,20'",
        "APPARENT": "AIRLESS",
        "ANG_FORMAT": "DEG",
        "CAL_FORMAT": "JD",
        "CSV_FORMAT": "YES",
        "EXTRA_PREC": "YES",
    }
    text = query(params)
    body = text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    rows = []
    for line in body:
        c = [x.strip() for x in line.split(",")]
        # JD, solar-presence, lunar-presence, az, el, ang-diam("), delta(au), deldot
        rows.append({
            "jd": float(c[0]), "az": float(c[3]), "el": float(c[4]),
            "angdiam_arcsec": float(c[5]), "range_au": float(c[6]),
        })
    return rows
