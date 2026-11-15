"""Curated sites for the app: reference/v1 researched list (source URL + quote per site) with short display names,
groups and the availability of precomputed 80 m-based horizon masks (copied unchanged from reference/v1)."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V1 = ROOT / "reference" / "v1"
OUT = ROOT / "web" / "public" / "data"

SHORT = {  # display names, from reference/v1 pipeline/scripts/build_site_data.py SHORT
    "apollo11": "Apollo 11", "apollo12": "Apollo 12", "apollo14": "Apollo 14", "apollo15": "Apollo 15",
    "apollo16": "Apollo 16", "apollo17": "Apollo 17", "im1_odysseus": "IM-1 Odysseus", "im2_athena": "IM-2 Athena",
    "blue_ghost_m1": "Blue Ghost M1", "chandrayaan3_vikram": "Chandrayaan-3 Vikram", "slim": "SLIM",
    "change3": "Chang'e 3", "change4": "Chang'e 4", "change5": "Chang'e 5", "change6": "Chang'e 6", "luna9": "Luna 9",
    "poi_site001_connecting_ridge": "Connecting Ridge (site 001)", "poi_site004_shackleton_rim": "Shackleton rim (site 004)",
    "poi_bussey2010_A_shackleton_rim": "Shackleton rim (Bussey A)", "poi_bussey2010_B_connecting_ridge": "Connecting Ridge (Bussey B)",
    "poi_bussey2010_C_degerlache_rim": "de Gerlache rim (Bussey C)", "poi_bussey2010_D_peak_near_shackleton": "Peak near Shackleton (Bussey D)",
    "poi_bussey2010_M1_malapert": "Malapert massif (Bussey M1)", "poi_bussey2010_M2_malapert": "Malapert massif (Bussey M2)",
    "poi_lpsc2024_connecting_ridge_candidate": "Connecting Ridge (Gracy & Lee)",
    "poi_lpsc2024_peak_near_shackleton_candidate": "Peak near Shackleton (Gracy & Lee)",
}
GROUP = {"poi": "southPole", "clps": "clps", "apollo": "apollo", "international": "international"}


def main() -> None:
    sites = json.loads((V1 / "web/public/data/sites.json").read_text())
    (OUT / "masks").mkdir(parents=True, exist_ok=True)
    out = []
    for s in sites:
        mfile = V1 / "web/public/data/masks" / f"{s['id']}.json"
        has = mfile.exists()
        # IM-1 is recomputed on LOLA 80 m by web/scripts/recompute-im1.ts (v1 defect 1); keep that file if present
        if has and not (s["id"] == "im1_odysseus" and (OUT / "masks" / mfile.name).exists()
                        and "Sightline" in json.loads((OUT / "masks" / mfile.name).read_text()).get("label", "")):
            shutil.copyfile(mfile, OUT / "masks" / mfile.name)
        group = GROUP[s["category"]]
        if s["lat"] < -60 and s["category"] in ("clps", "international"):
            group = "southPole" if s["category"] == "clps" else group
        out.append({
            "id": s["id"], "name": SHORT[s["id"]], "description": s["description"], "group": group,
            "category": s["category"], "lat": s["lat"], "lon": s["lon"], "status": s["status"],
            "source_title": s["source_title"], "source_url": s["source_url"], "notes": s["notes"],
            "landing_utc": s.get("landing_utc"), "z0": s.get("z0"), "mask": bool(has),
            "mask_heights": [2, 10] if has else [],
        })
    meta = {"source": "reference/v1/data/sites_research.json (researched 2026-11-14; each site has its source URL and quote)",
            "conventions": "planetocentric latitude, east-positive longitude (-180..180), MOON_ME", "n": len(out)}
    (OUT / "sites.json").write_text(json.dumps({"meta": meta, "sites": out}, indent=1))
    shutil.copyfile(V1 / "web/public/data/hillshade_80S.jpg", OUT / "hillshade_80S.jpg")
    print(len(out), "sites;", sum(o["mask"] for o in out), "with 80 m-based masks")


if __name__ == "__main__":
    main()
