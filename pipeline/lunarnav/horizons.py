"""Minimal, polite JPL Horizons client (independent cross-check only; never called at runtime).

API documentation: https://ssd-api.jpl.nasa.gov/doc/horizons.html (read by reference/v1 on 2026-11-14; endpoint
https://ssd.jpl.nasa.gov/api/horizons.api). One request at a time, >= 1.5 s apart; every response is cached in
data/raw/horizons_dsn/ with its query so validation re-runs offline. Standard library only (urllib honours the
environment proxy and the system CA store).
"""
from __future__ import annotations

import hashlib
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "raw" / "horizons_dsn"
UA = {"User-Agent": "sightline-pipeline (NASA Space Apps 2026)"}
_last = 0.0


def query(params: dict[str, str]) -> str:
    global _last
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:24]
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{key}.txt"
    if f.exists():
        return f.read_text(encoding="utf-8")
    wait = 1.5 - (time.time() - _last)
    if wait > 0:
        time.sleep(wait)
    url = API + "?" + urllib.parse.urlencode({"format": "text", **params})
    last_err = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                text = r.read().decode("utf-8")
            _last = time.time()
            if "$$SOE" not in text:
                raise RuntimeError("Horizons returned no ephemeris:\n" + text[-1500:])
            f.write_text(text, encoding="utf-8")
            (CACHE / f"{key}.json").write_text(json.dumps(params, indent=1), encoding="utf-8")
            return text
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"Horizons query failed: {last_err}")


def moon_from_earth_site(lon_deg: float, lat_deg: float, alt_km: float, jd_utc: list[float]) -> list[dict]:
    """Apparent (airless) azimuth/elevation of the Moon's centre from a geodetic Earth site at UTC Julian dates."""
    params = {
        "COMMAND": "'301'", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'coord@399'", "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"'{lon_deg:.10f},{lat_deg:.10f},{alt_km:.6f}'",
        "TLIST": " ".join(f"'{jd:.8f}'" for jd in jd_utc), "TLIST_TYPE": "JD", "TIME_TYPE": "UT",
        "QUANTITIES": "'4'", "APPARENT": "AIRLESS", "ANG_FORMAT": "DEG", "CAL_FORMAT": "JD",
        "CSV_FORMAT": "YES", "EXTRA_PREC": "YES",
    }
    text = query(params)
    rows = []
    for line in text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines():
        c = [x.strip() for x in line.split(",")]
        rows.append({"jd": float(c[0]), "az": float(c[3]), "el": float(c[4])})
    return rows, text
