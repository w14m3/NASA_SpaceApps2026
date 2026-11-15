"""Re-encode the reference/v1 240 m south-polar DEM (80-90 S) as a compact runtime artifact.

Input : reference/v1/web/public/data/dem240.bin (int16, 0.5 m per count, 2533 x 2533, NODATA -32768), built by v1
        from LDEM_60S_240MPP_ADJ.TIF (LOLA PGDA product 90, Barker et al. 2023).
Output: web/public/data/dem/dem240_80S.i16d.gz  (row-wise int16 deltas, gzip level 9) + dem240_80S.json
The decoding is exact (wrap-around int16 arithmetic); verified here and by the vitest V1 round trip.
"""
from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
V1 = ROOT / "reference" / "v1" / "web" / "public" / "data"
OUT = ROOT / "web" / "public" / "data" / "dem"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    meta = json.loads((V1 / "dem240.json").read_text())
    n = meta["n"]
    z = np.fromfile(V1 / "dem240.bin", dtype="<i2").reshape(n, n)
    d = np.empty_like(z)
    d[:, 0] = z[:, 0]
    d[:, 1:] = (z[:, 1:].astype(np.int32) - z[:, :-1].astype(np.int32)).astype(np.int16)  # wraps mod 2^16
    back = np.cumsum(d.astype(np.int64), axis=1).astype(np.int16)
    assert np.array_equal(back, z)
    blob = gzip.compress(d.astype("<i2").tobytes(), compresslevel=9, mtime=0)
    f = OUT / "dem240_80S.i16d.gz"
    f.write_bytes(blob)
    valid = z != -32768
    out = {
        "name": "LOLA 240 m",
        "label": "LOLA 240 m (PGDA product 90, 80–90°S)",
        "file": f.name,
        "encoding": "gzip of int16 little-endian row-wise deltas (first column absolute); NODATA -32768",
        "nx": n, "ny": n, "x0": meta["x0"], "y0": meta["y0"], "px": meta["px"], "scale": meta["scale"],
        "err": meta["err"], "err_definition": meta["err_definition"],
        "source": "LDEM_60S_240MPP_ADJ.TIF (LOLA, NASA GSFC PGDA product 90; Barker et al. 2023, PSJ 4, 183, "
                  "doi:10.3847/PSJ/acf3e1), cropped to the 80°S cap and quantised to 0.5 m by reference/v1",
        "crs": "south polar stereographic, sphere R = 1737.4 km, true scale at the pole, lon0 = 0 (IAU 30135)",
        "frame_note": "LOLA heights are in MOON_ME of DE421; the DE421-DE440 ME difference is < 1 m at the surface",
        "valid_fraction": float(valid.mean()),
        "z_range_m": [float(z[valid].min() * meta["scale"]), float(z[valid].max() * meta["scale"])],
        "sha256_decoded_int16": hashlib.sha256(z.astype("<i2").tobytes()).hexdigest(),
        "sha256_file": hashlib.sha256(blob).hexdigest(),
    }
    (OUT / "dem240_80S.json").write_text(json.dumps(out, indent=1))
    print(f"{f.name}: {len(blob)/1e6:.2f} MB (raw {z.nbytes/1e6:.2f} MB)", out["z_range_m"], out["valid_fraction"])


if __name__ == "__main__":
    main()
