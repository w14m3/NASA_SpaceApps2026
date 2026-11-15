"""Terrain horizon mask from a south-polar-stereographic DEM (brief section 8.4).

For azimuth a, march along the great circle leaving the site; at arc length s
(central angle th = s/R) the terrain radius is rho = R + z and the observer
radius rho0 = R + z0 + h.  Elevation of that terrain point seen by the observer:

    eps(s) = atan2(rho*cos(th) - rho0, rho*sin(th)),   mask(a) = max_s eps(s)

Lunar-limb curvature is included automatically (smooth sphere gives the dip
-acos(R/rho0)).  Three masks are tracked in one pass: nominal, and upper/lower
bounds obtained by shifting terrain by +/- the 1-sigma height error relative to
the ground under the observer (ramped in over two pixels, because errors of
neighbouring DEM cells are correlated).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numba import njit

R_M = 1_737_400.0


@dataclass
class Grid:
    """North-up raster in south polar stereographic metres (true scale at the pole)."""
    z: np.ndarray           # float32 [row, col], NaN = void
    x0: float               # x of the outer edge of column 0
    y0: float               # y of the outer edge of row 0 (top)
    px: float               # pixel size, m
    err: np.ndarray | None = None   # 1-sigma height error, same shape (optional)
    err_const: float = 0.0          # used when err is None


@njit(cache=True, fastmath=False)
def _bilinear(z, x0, y0, px, x, y):
    """Bilinear sample at map coordinates; NaN outside or next to a void."""
    c = (x - x0) / px - 0.5
    r = (y0 - y) / px - 0.5
    c0 = int(np.floor(c))
    r0 = int(np.floor(r))
    if c0 < 0 or r0 < 0 or c0 + 1 >= z.shape[1] or r0 + 1 >= z.shape[0]:
        return np.nan
    fc = c - c0
    fr = r - r0
    return ((z[r0, c0] * (1 - fc) + z[r0, c0 + 1] * fc) * (1 - fr)
            + (z[r0 + 1, c0] * (1 - fc) + z[r0 + 1, c0 + 1] * fc) * fr)


@njit(cache=True)
def _xy(p0, p1, p2):
    """South polar stereographic x, y (m) of a unit vector (lon0 = 0, sphere R_M)."""
    k = 2.0 * R_M / (1.0 - p2)
    return k * p1, k * p0


@njit(cache=True)
def _march(lon_deg, lat_deg, h, z0, e0, n_az, s_max, az_step_rad,
           zf, xf, yf, pf, ef, ef_const, has_ef,
           zc, xc, yc, pc, ec_const, has_c, step_scale):
    lon = np.radians(lon_deg)
    lat = np.radians(lat_deg)
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([up[1] * east[2] - up[2] * east[1],
                      up[2] * east[0] - up[0] * east[2],
                      up[0] * east[1] - up[1] * east[0]])
    rho0 = R_M + z0 + h
    out = np.empty((5, n_az))
    for i in range(n_az):
        a = 2.0 * np.pi * i / n_az
        ca, sa = np.cos(a), np.sin(a)
        d0 = north[0] * ca + east[0] * sa
        d1 = north[1] * ca + east[1] * sa
        d2 = north[2] * ca + east[2] * sa
        best = -np.pi / 2
        best_hi = -np.pi / 2
        best_lo = -np.pi / 2
        best_s = 0.0
        void_frac = 0.0
        n_steps = 0
        n_void = 0
        s = 2.0 * step_scale
        while s <= s_max:
            th = s / R_M
            ct, st = np.cos(th), np.sin(th)
            x, y = _xy(up[0] * ct + d0 * st, up[1] * ct + d1 * st, up[2] * ct + d2 * st)
            z = _bilinear(zf, xf, yf, pf, x, y)
            err = ef_const
            step_px = pf
            if np.isnan(z):
                if has_c:
                    z = _bilinear(zc, xc, yc, pc, x, y)
                    err = ec_const
                    step_px = pc
            elif has_ef:
                e = _bilinear(ef, xf, yf, pf, x, y)
                if not np.isnan(e):
                    err = e
            n_steps += 1
            if np.isnan(z):
                n_void += 1
            else:
                rho = R_M + z
                eps = np.arctan2(rho * ct - rho0, rho * st)
                if eps > best:
                    best = eps
                    best_s = s
                # Height error of terrain *relative to the ground under the observer*.  Errors
                # of neighbouring DEM cells are correlated, so the relative error ramps up
                # from 0 at the observer to (err + e0) beyond two pixels (ASSUMPTION).
                d = (err + e0) * min(1.0, s / (2.0 * step_px))
                eh = np.arctan2((rho + d) * ct - rho0, (rho + d) * st)
                if eh > best_hi:
                    best_hi = eh
                el = np.arctan2((rho - d) * ct - rho0, (rho - d) * st)
                if el > best_lo:
                    best_lo = el
            # radial step: 1 % of the distance in the near field (the bilinear surface has
            # kinks at pixel edges that set the horizon of a low mast), capped at half a pixel
            s += min(step_px * 0.5, max(0.5, 0.01 * s)) * step_scale
        if n_steps > 0:
            void_frac = n_void / n_steps
        out[0, i] = np.degrees(best)
        out[1, i] = np.degrees(best_lo)
        out[2, i] = np.degrees(best_hi)
        out[3, i] = best_s
        out[4, i] = void_frac
    return out


def site_height(fine: Grid, coarse: Grid | None, lon_deg: float, lat_deg: float) -> tuple[float, float]:
    """(terrain height z0, 1-sigma error) at the site, metres."""
    lon, lat = np.radians(lon_deg), np.radians(lat_deg)
    x, y = _xy(np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat))
    z = _bilinear(fine.z, fine.x0, fine.y0, fine.px, x, y)
    if not np.isnan(z):
        e = fine.err_const if fine.err is None else _bilinear(fine.err, fine.x0, fine.y0, fine.px, x, y)
        return float(z), float(e if not np.isnan(e) else fine.err_const)
    if coarse is not None:
        z = _bilinear(coarse.z, coarse.x0, coarse.y0, coarse.px, x, y)
        if not np.isnan(z):
            return float(z), coarse.err_const
    raise ValueError("site is outside DEM coverage")


def horizon_mask(fine: Grid, coarse: Grid | None, lon_deg: float, lat_deg: float,
                 h: float, n_az: int = 1440, s_max: float = 300_000.0,
                 step_scale: float = 1.0) -> dict[str, np.ndarray | float]:
    """Mask for an observer h metres above the terrain at the site.

    Returns degrees: mask, lo, hi (per azimuth, index i -> azimuth 360*i/n_az,
    clockwise from north), dist_m of the horizon-defining point, void fraction.
    """
    z0, e0 = site_height(fine, coarse, lon_deg, lat_deg)
    dummy = np.zeros((2, 2), dtype=np.float32)
    has_ef = fine.err is not None
    has_c = coarse is not None
    out = _march(lon_deg, lat_deg, h, z0, e0, n_az, s_max, 2 * np.pi / n_az,
                 fine.z, fine.x0, fine.y0, fine.px,
                 fine.err if has_ef else dummy, fine.err_const, has_ef,
                 coarse.z if has_c else dummy, coarse.x0 if has_c else 0.0,
                 coarse.y0 if has_c else 0.0, coarse.px if has_c else 1.0,
                 coarse.err_const if has_c else 0.0, has_c, step_scale)
    return {"z0": z0, "z0_err": e0, "mask": out[0], "lo": out[1], "hi": out[2],
            "dist_m": out[3], "void_frac": out[4]}


def lonlat_to_xy(lon_deg, lat_deg):
    lon, lat = np.radians(lon_deg), np.radians(lat_deg)
    k = 2.0 * R_M * np.cos(lat) / (1.0 - np.sin(lat))
    return k * np.sin(lon), k * np.cos(lon)


def xy_to_lonlat(x, y):
    r = np.hypot(x, y)
    lat = 2.0 * np.arctan(r / (2.0 * R_M)) - np.pi / 2
    return np.degrees(np.arctan2(x, y)), np.degrees(lat)
