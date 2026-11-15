"""V11 data: Moon azimuth/elevation from DSS-14, DSS-43 and DSS-63 from JPL Horizons at 80 seeded instants per
station (240 total, 2026-2030). Writes web/src/core/__fixtures__/dsn_moon_horizons.json (compared by vitest V11)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lunarnav.horizons import moon_from_earth_site  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "src" / "core" / "__fixtures__" / "dsn_moon_horizons.json"
STATIONS = json.loads((ROOT / "reference/v1/data/sites_research.json").read_text())["dsn"]


def main() -> None:
    rng = np.random.default_rng(1111)
    rows = []
    header = ""
    for st in STATIONS:
        ms = np.sort(rng.uniform(1767225600000, 1924992000000, 80))
        jd = list(ms / 86_400_000 + 2440587.5)
        res = []
        for k in range(0, len(jd), 20):  # long TLISTs are refused by the gateway (HTTP 502): 20 instants per query
            part, text = moon_from_earth_site(st["lon_east"], st["lat"], st["height_m"] / 1000, jd[k:k + 20])
            res += part
            header = header or text.split("$$SOE")[0][:1600]
        for m, r in zip(ms, res):
            rows.append({"station": st["id"], "unix_ms": float(m), "jd": r["jd"], "az": r["az"], "el": r["el"]})
        print(st["id"], len(res), "rows")
    OUT.write_text(json.dumps({"meta": {"source": "JPL Horizons API (ssd.jpl.nasa.gov/api/horizons.api), Moon (301) "
                                                  "from geodetic DSN sites, apparent AIRLESS az/el, queried 2026-11-15",
                                        "header_sample": header, "n": len(rows)}, "rows": rows}))
    print(len(rows), "rows ->", OUT)


if __name__ == "__main__":
    main()
