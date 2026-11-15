"""V4 (synthetic terrain with known answer) and V5 (azimuth wrap, DEM edge)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from lunarnav import horizon as Hz

R = Hz.R_M
RESULTS = Path(__file__).resolve().parents[2] / "data" / "validation"
RESULTS.mkdir(parents=True, exist_ok=True)


def _grid(half_m: float, px: float, zfun) -> Hz.Grid:
    n = int(2 * half_m / px)
    xs = -half_m + (np.arange(n) + 0.5) * px
    ys = half_m - (np.arange(n) + 0.5) * px
    X, Y = np.meshgrid(xs, ys)
    lon, lat = Hz.xy_to_lonlat(X, Y)
    return Hz.Grid(z=zfun(lon, lat).astype(np.float32), x0=-half_m, y0=half_m, px=px)


def _arc_from_pole(lat_deg):
    return R * np.radians(lat_deg + 90.0)


def test_v4_smooth_sphere_dip():
    g = _grid(40_000, 80.0, lambda lon, lat: np.zeros_like(lon))
    worst = 0.0
    for h in (2.0, 10.0, 30.0, 100.0):
        m = Hz.horizon_mask(g, None, 37.0, -89.9, h, n_az=360, s_max=30_000)
        expected = -np.degrees(np.arccos(R / (R + h)))
        worst = max(worst, float(np.max(np.abs(m["mask"] - expected))))
    (RESULTS / "V4_sphere.json").write_text(json.dumps({"tolerance_deg": 1e-4, "max_err_deg": worst}))
    assert worst <= 1e-4


def test_v4_gaussian_ring_analytic():
    """Axisymmetric ring wall around the pole; observer at the pole.
    Reference: the same elevation formula evaluated on the exact profile every metre."""
    H, s1, w, h = 2000.0, 50_000.0, 10_000.0, 5.0
    prof = lambda s: H * np.exp(-((s - s1) / w) ** 2)
    g = _grid(90_000, 80.0, lambda lon, lat: prof(_arc_from_pole(lat)))
    m = Hz.horizon_mask(g, None, 0.0, -90.0, h, n_az=720, s_max=85_000)
    s = np.arange(1.0, 85_000.0, 1.0)
    th = s / R
    rho, rho0 = R + prof(s), R + prof(0.0) + h
    expected = float(np.degrees(np.max(np.arctan2(rho * np.cos(th) - rho0, rho * np.sin(th)))))
    err = float(np.max(np.abs(m["mask"] - expected)))
    (RESULTS / "V4_ring.json").write_text(json.dumps(
        {"tolerance_deg": 1e-4, "expected_deg": expected, "max_err_deg": err}))
    assert err <= 1e-4, (expected, err)


def test_v5_azimuth_wrap_and_offset_site():
    """A ridge defined in map coordinates, seen from an off-pole site on the 180 deg
    meridian: the mask is continuous across azimuth 359.75 -> 0 and matches a
    brute-force evaluation that uses the exact terrain function (no raster)."""
    zfun = lambda lon, lat: 1500.0 * np.exp(-((_arc_from_pole(lat) - 30_000.0) / 8_000.0) ** 2)
    g = _grid(70_000, 80.0, zfun)
    lon0, lat0, h = 180.0, -89.8, 3.0
    m = Hz.horizon_mask(g, None, lon0, lat0, h, n_az=1440, s_max=60_000)
    mask = m["mask"]
    assert abs(mask[0] - mask[-1]) < 0.02          # no seam at north
    assert np.max(np.abs(np.diff(np.r_[mask, mask[0]]))) < 0.05

    # brute force with the exact function along 8 azimuths
    lon, lat = np.radians(lon0), np.radians(lat0)
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.cross(up, east)
    z0 = float(zfun(np.array(lon0), np.array(lat0)))
    worst = 0.0
    for i in range(0, 1440, 180):
        a = 2 * np.pi * i / 1440
        s = np.arange(5.0, 60_000.0, 5.0)
        p = np.outer(np.cos(s / R), up) + np.outer(np.sin(s / R), north * np.cos(a) + east * np.sin(a))
        plat = np.degrees(np.arcsin(p[:, 2]))
        rho, rho0 = R + zfun(None, plat), R + z0 + h
        eps = np.degrees(np.max(np.arctan2(rho * np.cos(s / R) - rho0, rho * np.sin(s / R))))
        worst = max(worst, abs(eps - mask[i]))
    (RESULTS / "V5.json").write_text(json.dumps(
        {"seam_deg": float(abs(mask[0] - mask[-1])), "max_err_vs_exact_deg": worst,
         "tolerance_deg": 1e-3}))
    assert worst <= 1e-3, worst


def test_v5_edge_of_dem_is_flagged_not_fatal():
    g = _grid(20_000, 80.0, lambda lon, lat: np.zeros_like(lon))
    lon, lat = Hz.xy_to_lonlat(19_000.0, 0.0)
    m = Hz.horizon_mask(g, None, float(lon), float(lat), 2.0, n_az=360, s_max=30_000)
    assert np.all(np.isfinite(m["mask"]))
    assert m["void_frac"].max() > 0.5          # rays leaving the DEM report voids
    assert m["void_frac"].min() < 0.5


def test_projection_round_trip():
    rng = np.random.default_rng(0)
    lon = rng.uniform(-180, 180, 1000)
    lat = rng.uniform(-90, -60, 1000)
    x, y = Hz.lonlat_to_xy(lon, lat)
    lon2, lat2 = Hz.xy_to_lonlat(x, y)
    d = np.hypot((lon2 - lon + 180) % 360 - 180, lat2 - lat)
    assert np.max(np.radians(d) * R) < 1e-3     # < 1 mm
