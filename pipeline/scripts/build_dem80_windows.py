"""LOLA 80 m windows (48 x 48 km) around the hero regions for live horizons and plane fits in the browser.

Input : data/cache/dem/LDEM_80S_80MPP_ADJ.f32 (+ _ERR) from export_dem_raw.py (PGDA product 90).
Output: web/public/data/dem/dem80_<region>.i16d.gz (row-wise int16 deltas of heights at 0.25 m per count, gzip)
        + dem80_<region>.json; web/public/data/dem/index.json lists every runtime grid, finest first.
Region centres are read from web/src/core/regions.ts (single source of truth)."""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "cache" / "dem"
OUT = ROOT / "web" / "public" / "data" / "dem"
R = 1_737_400.0
HALF_M = 24_000.0
SCALE = 0.25


def regions():
    src = (ROOT / "web/src/core/regions.ts").read_text()
    for m in re.finditer(r"\{ id: '([^']+)', name: '([^']+)', anchor: '[^']+', lon: (-?[\d.]+), lat: (-?[\d.]+)", src):
        yield m.group(1), m.group(2), float(m.group(3)), float(m.group(4))


def xy(lon, lat):
    k = 2 * R * math.cos(math.radians(lat)) / (1 - math.sin(math.radians(lat)))
    return k * math.sin(math.radians(lon)), k * math.cos(math.radians(lon))


def main() -> None:
    meta = json.loads((CACHE / "LDEM_80S_80MPP_ADJ.json").read_text())
    z = np.fromfile(CACHE / "LDEM_80S_80MPP_ADJ.f32", dtype="<f4").reshape(meta["ny"], meta["nx"])
    err = np.fromfile(CACHE / "LDEM_80S_80MPP_ADJ_ERR.f32", dtype="<f4").reshape(meta["ny"], meta["nx"])
    px = meta["px"]
    index = []
    for rid, name, lon, lat in regions():
        cx, cy = xy(lon, lat)
        c0 = int(round((cx - HALF_M - meta["x0"]) / px))
        r0 = int(round((meta["y0"] - (cy + HALF_M)) / px))
        n = int(round(2 * HALF_M / px))
        w = z[r0:r0 + n, c0:c0 + n]
        e = err[r0:r0 + n, c0:c0 + n]
        q = np.where(np.isfinite(w), np.round(w / SCALE), -32768).astype(np.int32)
        assert q[q != -32768].min() > -32768 and q.max() < 32767, "heights exceed int16 at 0.25 m"
        q = q.astype(np.int16)
        d = np.empty_like(q)
        d[:, 0] = q[:, 0]
        d[:, 1:] = (q[:, 1:].astype(np.int32) - q[:, :-1].astype(np.int32)).astype(np.int16)
        assert np.array_equal(np.cumsum(d.astype(np.int64), axis=1).astype(np.int16), q)
        blob = gzip.compress(d.astype("<i2").tobytes(), compresslevel=9, mtime=0)
        f = OUT / f"dem80_{rid}.i16d.gz"
        f.write_bytes(blob)
        info = {
            "name": f"LOLA 80 m · {name}", "label": "LOLA 80 m (PGDA product 90)", "file": f.name,
            "encoding": "gzip of int16 little-endian row-wise deltas (first column absolute); NODATA -32768",
            "nx": n, "ny": n, "x0": meta["x0"] + c0 * px, "y0": meta["y0"] - r0 * px, "px": px, "scale": SCALE,
            "err": float(np.nanmedian(e)), "err_definition": "median of the LOLA 80 m _ERR raster (1-sigma) in the window",
            "source": meta["source"], "sha256_source_tif": meta["sha256_tif"],
            "sha256_file": hashlib.sha256(blob).hexdigest(), "bytes": len(blob),
        }
        (OUT / f"dem80_{rid}.json").write_text(json.dumps(info, indent=1))
        index.append(f"dem80_{rid}")
        print(rid, n, f"{len(blob)/1e3:.0f} kB", "err", round(info["err"], 3))
    index.append("dem240_80S")
    (OUT / "index.json").write_text(json.dumps({"grids_finest_first": index}, indent=1))


if __name__ == "__main__":
    main()
