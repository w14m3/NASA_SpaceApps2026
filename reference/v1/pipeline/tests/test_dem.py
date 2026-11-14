"""V1 (coordinate round trips on the real DEM grid) and V6 (mask convergence on real terrain)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest
import rasterio
from pyproj import CRS, Transformer

from lunarnav import ephem as E, horizon as Hz

ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "data" / "validation"
DEM = ROOT / "data" / "dem" / "LDEM_80S_80MPP_ADJ.TIF"
pytestmark = pytest.mark.skipif(not DEM.exists(), reason="LOLA DEM not downloaded")

sys.path.insert(0, str(ROOT / "pipeline" / "scripts"))


@pytest.fixture(scope="module")
def grids():
    import build_site_data as B
    return B.load_grids()


def test_v1_round_trips():
    """lat/lon <-> Cartesian <-> DEM pixel <-> map coordinate, <= 1 m and <= 0.5 px."""
    rng = np.random.default_rng(11)
    lon = rng.uniform(-180, 180, 5000)
    lat = rng.uniform(-90, -80, 5000)
    with rasterio.open(DEM) as ds:
        tr = Transformer.from_crs(CRS.from_proj4("+proj=longlat +R=1737400 +no_defs"), ds.crs, always_xy=True)
        xp, yp = tr.transform(lon, lat)                 # independent projection (PROJ)
        x, y = Hz.lonlat_to_xy(lon, lat)                # our closed form
        proj_err = float(np.max(np.hypot(x - xp, y - yp)))
        rows, cols = rasterio.transform.rowcol(ds.transform, xp, yp, op=lambda v: v)
        c = (x - ds.transform.c) / ds.transform.a       # our pixel index (edge-referenced)
        r = (ds.transform.f - y) / ds.transform.a
        px_err = float(np.max(np.hypot(np.asarray(cols) - c, np.asarray(rows) - r)))
    lon2, lat2 = Hz.xy_to_lonlat(x, y)
    # Cartesian round trip on the sphere
    p = np.array([E.site_vector(a, b, E.R_MOON_KM) for a, b in zip(lon, lat)])
    lat3 = np.degrees(np.arcsin(p[:, 2] / E.R_MOON_KM))
    lon3 = np.degrees(np.arctan2(p[:, 1], p[:, 0]))
    ground = lambda dlon, dlat: np.max(np.hypot(np.radians((dlon + 180) % 360 - 180) * np.cos(np.radians(lat)),
                                                np.radians(dlat)) * Hz.R_M)
    inv_err = float(ground(lon2 - lon, lat2 - lat))
    cart_err = float(ground(lon3 - lon, lat3 - lat))
    (RESULTS / "V1.json").write_text(json.dumps(
        {"tolerance": "<= 1 m and <= 0.5 px", "projection_vs_proj_m": proj_err, "pixel_err_px": px_err,
         "inverse_round_trip_m": inv_err, "cartesian_round_trip_m": cart_err}))
    assert max(proj_err, inv_err, cart_err) <= 1.0 and px_err <= 0.5


def test_v6_convergence(grids):
    """Halve the azimuth spacing and ray step, double s_max: mask changes <= 0.02 deg."""
    fine, coarse = grids
    out = {}
    worst = 0.0
    for name, lon, lat in (("connecting_ridge_001", -137.31, -89.45), ("shackleton_rim_004", -155.73, -89.78),
                           ("im2_athena", 29.1957, -84.7906)):
        a = Hz.horizon_mask(fine, coarse, lon, lat, 2.0, n_az=1440, s_max=300_000)
        b = Hz.horizon_mask(fine, coarse, lon, lat, 2.0, n_az=2880, s_max=600_000, step_scale=0.5)
        d = float(np.max(np.abs(a["mask"] - b["mask"][::2])))
        # the 99.9th percentile separates isolated cliff-edge samples from systematic error
        d999 = float(np.quantile(np.abs(a["mask"] - b["mask"][::2]), 0.999))
        out[name] = {"max_change_deg": d, "p99.9_change_deg": d999,
                     "max_void_frac_600km": float(b["void_frac"].max())}
        worst = max(worst, d)
    (RESULTS / "V6.json").write_text(json.dumps(
        {"tolerance_deg": 0.02, "coarse_dem_present": coarse is not None, "sites": out, "worst_deg": worst}, indent=1))
    print(json.dumps(out, indent=1))
    assert worst <= 0.02
