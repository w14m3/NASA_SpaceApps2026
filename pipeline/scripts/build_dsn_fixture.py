"""Independent cross-check data for ground-station geometry (V11b), because JPL Horizons is unreachable here.

astropy computes the topocentric Moon elevation at DSS-14/43/63 with its own chain (ERFA apco/atioq, IERS-A Earth
orientation incl. polar motion, built-in ERFA Moon theory - independent of DE421) at 240 seeded instants 2026-2030.
Output: web/src/core/__fixtures__/dsn_moon_astropy.json, compared by the vitest V11b test with the runtime chain.
"""
from __future__ import annotations

import json
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")
from astropy import units as u  # noqa: E402
from astropy.coordinates import AltAz, EarthLocation, get_body, solar_system_ephemeris  # noqa: E402
from astropy.time import Time  # noqa: E402
from astropy.utils import iers  # noqa: E402

iers.conf.auto_download = False
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "src" / "core" / "__fixtures__" / "dsn_moon_astropy.json"
STATIONS = json.loads((ROOT / "reference/v1/data/sites_research.json").read_text())["dsn"]


def main() -> None:
    rng = np.random.default_rng(11)
    ms = np.sort(rng.uniform(1767225600000, 1924992000000, 240))  # 2026-01-01 .. 2031-01-01
    t = Time(ms / 1000.0, format="unix", scale="utc")
    rows = []
    with solar_system_ephemeris.set("builtin"):
        moon = get_body("moon", t)
        for st in STATIONS:
            loc = EarthLocation.from_geodetic(st["lon_east"] * u.deg, st["lat"] * u.deg, st["height_m"] * u.m,
                                              ellipsoid="WGS84")
            aa = moon.transform_to(AltAz(obstime=t, location=loc, pressure=0 * u.hPa))
            for i in range(len(t)):
                rows.append({"station": st["id"], "unix_ms": float(ms[i]), "el": float(aa.alt.deg[i]),
                             "az": float(aa.az.deg[i])})
    import astropy
    OUT.write_text(json.dumps({"meta": {"generator": f"astropy {astropy.__version__}, builtin ephemeris (ERFA), "
                                                     "IERS-A from astropy-iers-data, no refraction", "n": len(rows)},
                               "rows": rows}))
    print(len(rows), "rows ->", OUT)


if __name__ == "__main__":
    main()
