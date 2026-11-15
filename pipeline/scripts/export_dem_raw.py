"""Export the LOLA GeoTIFFs (data/cache/dem/, from codex/fetch_nasa_data.py) to raw float32 grids readable by the
TypeScript core in Node build scripts: data/cache/dem/<name>.f32 + <name>.json (x0, y0 outer edges, px, nx, ny).
NaN = void. Also records each file's SHA-256 and the median of the 1-sigma error raster."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "data" / "cache" / "dem"


def sha(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def main() -> None:
    for name in ("LDEM_80S_80MPP_ADJ", "LDEM_80S_80MPP_ADJ_ERR", "LDEM_60S_240MPP_ADJ"):
        tif = D / f"{name}.TIF"
        out = D / f"{name}.f32"
        with rasterio.open(tif) as ds:
            z = ds.read(1).astype("<f4")
            t = ds.transform
            meta = {"name": name, "nx": ds.width, "ny": ds.height, "x0": t.c, "y0": t.f, "px": t.a,
                    "crs": ds.crs.to_string(), "source": f"https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/{name}.TIF",
                    "sha256_tif": sha(tif)}
        valid = np.isfinite(z)
        meta["valid_fraction"] = float(valid.mean())
        if name.endswith("_ERR"):
            meta["median"] = float(np.nanmedian(z))
            meta["p95"] = float(np.nanpercentile(z, 95))
        z.tofile(out)
        (D / f"{name}.json").write_text(json.dumps(meta, indent=1))
        print(name, meta["nx"], meta["ny"], meta["px"], meta["valid_fraction"], meta.get("median"))


if __name__ == "__main__":
    main()
