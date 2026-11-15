"""Sun and Earth geometry for a site on the Moon (SPICE, MOON_ME frame).

Conventions (brief section 8.1):
  * input/display time UTC, internal time TDB seconds past J2000 (ET)
  * body-fixed frame MOON_ME (Mean Earth / Polar Axis, DE440 realisation)
  * longitude east-positive, planetocentric latitude, sphere R = 1737.4 km
  * azimuth clockwise from local north, elevation above the local horizontal
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import spiceypy as sp

R_MOON_KM = 1737.4          # LOLA reference sphere
R_SUN_KM = 695_700.0        # IAU 2015 nominal solar radius
R_EARTH_KM = 6378.1366      # equatorial radius (IERS 2010); polar flattening ignored
AU_KM = 149_597_870.7
FRAME = "MOON_ME"
ABCORR = "LT+S"

KERNEL_DIR = Path(__file__).resolve().parents[2] / "data" / "kernels"
KERNELS = [
    "naif0012.tls",
    "pck00011.tpc",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf",
    "de440s.bsp",
]
OPTIONAL_KERNELS = [
    "earth_1962_260806_2126_combined.bpc",
    "earthstns_itrf93_260814.bsp",
    "earth_topo_260814.tf",
]
_loaded = False


def load_kernels() -> list[str]:
    global _loaded
    names = list(KERNELS) + [k for k in OPTIONAL_KERNELS if (KERNEL_DIR / k).exists()]
    if not _loaded:
        for k in names:
            sp.furnsh(str(KERNEL_DIR / k))
        _loaded = True
    return names


def utc2et(utc: str) -> float:
    load_kernels()
    return sp.str2et(utc)


def et2utc(et: float, prec: int = 0) -> str:
    return sp.et2utc(et, "ISOC", prec) + "Z"


def site_vector(lon_deg: float, lat_deg: float, radius_km: float) -> np.ndarray:
    """Body-fixed position of a point at the given planetocentric lon/lat and radius."""
    lon, lat = np.radians(lon_deg), np.radians(lat_deg)
    return radius_km * np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])


def local_frame(lon_deg: float, lat_deg: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(east, north, up) unit vectors on the reference sphere."""
    lon, lat = np.radians(lon_deg), np.radians(lat_deg)
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.cross(up, east)
    return east, north, up


def center_vector(target: str, et: float) -> np.ndarray:
    """Apparent position of target seen from the Moon's centre, MOON_ME, km."""
    load_kernels()
    pos, _ = sp.spkpos(target, et, FRAME, ABCORR, "MOON")
    return np.asarray(pos)


def topo_vector(target: str, et: float, site_km: np.ndarray) -> np.ndarray:
    """Apparent position of target seen from a surface point (rigorous), MOON_ME, km."""
    load_kernels()
    state, _ = sp.spkcpo(target, et, FRAME, "OBSERVER", ABCORR, site_km, "MOON", FRAME)
    return np.asarray(state[:3])


def azel_from_vector(d: np.ndarray, lon_deg: float, lat_deg: float) -> tuple[float, float, float]:
    """(azimuth deg, elevation deg, range km) of direction vector d at the site."""
    east, north, up = local_frame(lon_deg, lat_deg)
    rng = float(np.linalg.norm(d))
    u = d / rng
    el = np.degrees(np.arcsin(np.clip(u @ up, -1.0, 1.0)))
    az = np.degrees(np.arctan2(u @ east, u @ north)) % 360.0
    return float(az), float(el), rng


def azel(target: str, et: float, lon_deg: float, lat_deg: float, radius_km: float,
         rigorous: bool = True) -> tuple[float, float, float]:
    """Topocentric az/el/range. rigorous=False reproduces the browser runtime
    (Moon-centre apparent vector minus the site vector)."""
    site = site_vector(lon_deg, lat_deg, radius_km)
    d = topo_vector(target, et, site) if rigorous else center_vector(target, et) - site
    return azel_from_vector(d, lon_deg, lat_deg)


def angular_radius_deg(body_radius_km: float, range_km: float) -> float:
    return float(np.degrees(np.arcsin(body_radius_km / range_km)))
