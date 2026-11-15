"""Turn the cached JPL Horizons responses of reference/v1 into a compact test fixture (offline V2/V3 re-runs),
and copy the v1 SPICE az/el oracle. Inputs are read-only; outputs go to web/src/core/__fixtures__/."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "reference" / "v1" / "data" / "raw" / "horizons"
OUT = ROOT / "web" / "src" / "core" / "__fixtures__"


def parse(txt: str):
    body = txt.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    for line in body.strip().splitlines():
        f = [x.strip() for x in line.split(",")]
        yield float(f[0]), float(f[3]), float(f[4])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for q in sorted(SRC.glob("*.json")):
        p = json.loads(q.read_text())
        body = {"'10'": "SUN", "'399'": "EARTH"}[p["COMMAND"]]
        lon, lat, alt = (float(x) for x in p["SITE_COORD"].strip("'").split(","))
        for jd, az, el in parse(q.with_suffix(".txt").read_text()):
            rows.append({"body": body, "lon": lon, "lat": lat, "alt_km": alt, "jd_ut": jd, "az": az, "el": el,
                         "file": q.stem})
    meta = {"source": "JPL Horizons API responses cached by reference/v1 on 2026-11-14 (DE441, MEAN_ME, "
                      "sphere 1737.4 km, AIRLESS, apparent az/el)", "n": len(rows)}
    (OUT / "horizons_azel.json").write_text(json.dumps({"meta": meta, "rows": rows}))
    shutil.copyfile(ROOT / "reference/v1/web/src/core/__fixtures__/azel.json", OUT / "v1_spice_azel.json")
    print(meta)


if __name__ == "__main__":
    main()
