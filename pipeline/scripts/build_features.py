"""IAU-named lunar features south of 79.5°S from the USGS Gazetteer of Planetary Nomenclature for the search box.

Input : data/cache/usgs_gazetteer_moon.html — the Gazetteer search-results page for target Moon (all features),
        https://planetarynames.wr.usgs.gov/SearchResults?Target=16_Moon (fetched 2026-11-15 through the session proxy).
Output: web/public/data/features.json. For the Moon the Gazetteer's "planetographic" coordinates equal planetocentric
        ones (spherical body), east-positive -180..180."""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "cache" / "usgs_gazetteer_moon.html"
OUT = ROOT / "web" / "public" / "data" / "features.json"


def cells(row: str) -> list[str]:
    return [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", c))).strip()
            for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]


def main() -> None:
    s = SRC.read_text(encoding="utf-8", errors="replace")
    rows = [cells(r) for r in re.findall(r"<tr[^>]*>(.*?)</tr>", s, re.S)]
    head = next(r for r in rows if "Center Latitude" in r and "Feature Name" in r)
    ix = {k: head.index(k) for k in head}
    feats = []
    for r in rows:
        if len(r) != len(head) or r[0] == "Feature ID":
            continue
        try:
            lat = float(r[ix["Center Latitude"]])
            lon = float(r[ix["Center Longitude"]])
        except ValueError:
            continue
        if lat > -79.5:
            continue
        rec = {"id": int(r[ix["Feature ID"]]), "name": r[ix["Clean Feature Name"]], "lat": lat, "lon": lon,
               "diameter_km": float(r[ix["Diameter"]]) if r[ix["Diameter"]] else None}
        for k, key in (("Feature Type", "type"), ("Approval Status", "status")):
            if k in ix:
                rec[key] = r[ix[k]]
        feats.append(rec)
    feats.sort(key=lambda f: (-(f["diameter_km"] or 0), f["name"]))
    OUT.write_text(json.dumps({
        "source": "USGS Gazetteer of Planetary Nomenclature (IAU WGPSN), https://planetarynames.wr.usgs.gov/",
        "fetched": "2026-11-15", "sha256_source_page": hashlib.sha256(SRC.read_bytes()).hexdigest(),
        "columns": head, "n": len(feats), "features": feats,
        "built_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}, indent=1))
    print(len(feats), "features south of 79.5°S; e.g.", [f["name"] for f in feats[:12]])


if __name__ == "__main__":
    main()
