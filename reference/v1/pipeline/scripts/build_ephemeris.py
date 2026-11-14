"""Build the browser ephemeris (Chebyshev) and the SPICE parity fixture for vitest.

Outputs: web/public/data/ephem.bin, ephem.json; web/src/core/__fixtures__/azel.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import spiceypy as sp

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lunarnav import cheby, ephem as E  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "data"
EPOCH = "2026-01-01T00:00:00"
N_SEG = 457            # 457 * 4 d = 1828 d  ->  2031-01-03


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    model = cheby.fit(EPOCH, N_SEG)
    err = cheby.max_error(model, n=4000)
    worst = max(e["max_deg_from_surface"] for e in err.values())
    assert worst < 0.001, err
    model["coeffs"].astype("<f8").tofile(OUT / "ephem.bin")
    epoch_unix_ms = int(round((np.datetime64(EPOCH) - np.datetime64("1970-01-01T00:00:00"))
                              / np.timedelta64(1, "ms")))
    meta = {
        "epoch_utc": EPOCH + "Z", "epoch_unix_ms": epoch_unix_ms,
        "seg_seconds": model["seg_seconds"], "degree": model["degree"],
        "n_segments": N_SEG, "targets": model["targets"],
        "frame": E.FRAME, "abcorr": E.ABCORR, "observer": "MOON (centre)",
        "kernels": E.load_kernels(), "max_error_deg": err,
        "layout": "float64 little-endian [target][segment][axis xyz][coef 0..degree]",
    }
    (OUT / "ephem.json").write_text(json.dumps(meta, indent=1) + "\n")
    print("ephemeris:", (OUT / "ephem.bin").stat().st_size, "bytes; max error from surface",
          f"{worst:.2e} deg")

    # parity fixture: rigorous SPICE topocentric az/el for random sites and times
    rng = np.random.default_rng(42)
    rows = []
    et_a, et_b = sp.str2et("2026-01-02"), sp.str2et("2030-12-30")
    for _ in range(300):
        lon, lat = float(rng.uniform(-180, 180)), float(rng.uniform(-90, 90))
        if rng.random() < 0.5:
            lat = float(rng.uniform(-90, -80))
        z0, h = float(rng.uniform(-4000, 6000)), float(rng.uniform(0, 30))
        et = float(rng.uniform(et_a, et_b))
        unix_ms = epoch_unix_ms + (et - model["et0"] - (sp.deltet(et, "ET") - model["delta0"])) * 1000.0
        row = {"lon": lon, "lat": lat, "z0": z0, "h": h, "unix_ms": unix_ms}
        for tgt in ("SUN", "EARTH"):
            az, el, rg = E.azel(tgt, et, lon, lat, E.R_MOON_KM + (z0 + h) / 1000.0)
            row[tgt] = {"az": az, "el": el, "range": rg}
        rows.append(row)
    fx = ROOT / "web" / "src" / "core" / "__fixtures__"
    fx.mkdir(parents=True, exist_ok=True)
    (fx / "azel.json").write_text(json.dumps(rows) + "\n")
    print("fixture rows:", len(rows))


if __name__ == "__main__":
    main()
