"""JPL DE421 (Folkner, Williams & Boggs 2009) read from the PyPI package `de421` (Chebyshev arrays as .npy).

Why DE421: the build environment cannot reach naif.jpl.nasa.gov (SPICE kernels) or ssd.jpl.nasa.gov (Horizons),
see docs/DECISIONS.md D3. The `de421` package (Brandon Rhodes, 2008.1, MIT packaging of the JPL file) is reachable
through PyPI and contains positions *and the lunar physical librations*, which is all we need to rebuild:

* the apparent Sun and Earth vectors seen from the Moon's centre in MOON_ME (SPICE `LT+S` semantics), and
* the apparent geocentric Moon vector (for Earth-station geometry).

Layout (verified against jplephem 1.2, the loader written for these files): for each body an array
[n_sets, n_axes, n_coef] of Chebyshev coefficients on equal sub-intervals of [jalpha, jomega] (TDB Julian days).
Units: km and km/day for positions, radians for libration angles. 'moon' is geocentric; 'earthmoon' and 'sun' are
solar-system-barycentric. Frame: ICRF (treated as J2000 by SPICE).
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .constants import C_KM_S

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "cache" / "de421"
C_KM_DAY = C_KM_S * 86400.0

# MOON_PA(DE421) -> MOON_ME(DE421) constant rotation, arcseconds about axes (3, 2, 1), as published with DE421
# (Williams, Boggs & Folkner 2008, JPL IOM 335-JW,DB,WF-20080314-001; reproduced in NAIF moon_080317.tf).
# The composition order/sign is fixed by test_pa_to_me_convention against the SPICE DE440 oracle (DECISIONS D4).
PA_TO_ME_ARCSEC = (67.92, 78.56, 0.30)


def _rot(axis: int, ang: np.ndarray) -> np.ndarray:
    """Frame rotation matrices [ang]_axis (rotate coordinate axes by +ang), vectorised: shape (..., 3, 3)."""
    c, s = np.cos(ang), np.sin(ang)
    o, z = np.ones_like(ang), np.zeros_like(ang)
    if axis == 1:
        m = [[o, z, z], [z, c, s], [z, -s, c]]
    elif axis == 2:
        m = [[c, z, -s], [z, o, z], [s, z, c]]
    else:
        m = [[c, s, z], [-s, c, z], [z, z, o]]
    return np.moveaxis(np.array(m), (0, 1), (-2, -1))


def pa_to_me_matrix() -> np.ndarray:
    """Matrix taking MOON_PA vectors to MOON_ME vectors (SPICE TKFRAME 'ANGLES' semantics)."""
    a = np.radians(np.array(PA_TO_ME_ARCSEC) / 3600.0)
    # TKFRAME: M(ME->PA) = [a1]_3 [a2]_2 [a3]_1 ; PA->ME is its transpose.
    m_me_to_pa = _rot(3, a[0]) @ _rot(2, a[1]) @ _rot(1, a[2])
    return m_me_to_pa.T


@dataclass
class DE421:
    path: Path
    jalpha: float
    jomega: float
    emrat: float
    au_km: float
    sets: dict

    @classmethod
    def load(cls, path: Path = CACHE) -> "DE421":
        pkg = path / "de421"
        if not (pkg / "constants.npy").exists():
            raise FileNotFoundError(f"DE421 not found in {path}; run python pipeline/scripts/fetch_de421.py")
        const = {k.decode(): v for k, v in np.load(pkg / "constants.npy")}
        sets = {n: np.load(pkg / f"jpl-{n}.npy") for n in ("moon", "earthmoon", "sun", "librations")}
        return cls(pkg, float(const["jalpha"]), float(const["jomega"]), float(const["EMRAT"]), float(const["AU"]), sets)

    # -- raw Chebyshev evaluation -------------------------------------------------------------------
    def _eval(self, name: str, jd: np.ndarray, deriv: bool = False):
        c = self.sets[name]
        n_sets, _, n_coef = c.shape
        span = (self.jomega - self.jalpha) / n_sets
        jd = np.atleast_1d(np.asarray(jd, dtype=float))
        idx, off = np.divmod(jd - self.jalpha, span)
        idx = idx.astype(int)
        if (idx < 0).any() or (idx > n_sets).any():
            raise ValueError("date outside DE421 coverage")
        last = idx == n_sets
        idx[last] -= 1
        off[last] += span
        x = 2.0 * off / span - 1.0
        T = np.empty((n_coef, len(jd)))
        T[0], T[1] = 1.0, x
        for i in range(2, n_coef):
            T[i] = 2 * x * T[i - 1] - T[i - 2]
        coef = c[idx]  # (n, axes, coef)
        pos = np.einsum("nac,cn->na", coef, T)
        if not deriv:
            return pos
        dT = np.empty_like(T)
        dT[0], dT[1] = 0.0, 1.0
        if n_coef > 2:
            dT[2] = 4 * x
        for i in range(3, n_coef):
            dT[i] = 2 * x * dT[i - 1] - dT[i - 2] + 2 * T[i - 1]
        dT *= 2.0 / span
        vel = np.einsum("nac,cn->na", coef, dT)
        return pos, vel

    # -- barycentric states (km, km/day) -------------------------------------------------------------
    def state(self, body: str, jd: np.ndarray):
        """Barycentric (SSB) position and velocity of 'sun', 'earth' or 'moon' at TDB Julian dates."""
        if body == "sun":
            return self._eval("sun", jd, True)
        emb, embv = self._eval("earthmoon", jd, True)
        mg, mgv = self._eval("moon", jd, True)
        if body == "earth":
            return emb - mg / (1.0 + self.emrat), embv - mgv / (1.0 + self.emrat)
        if body == "moon":
            k = self.emrat / (1.0 + self.emrat)
            return emb + mg * k, embv + mgv * k
        raise KeyError(body)

    def icrf_to_pa(self, jd: np.ndarray) -> np.ndarray:
        """Rotation ICRF -> MOON_PA from the DE421 Euler angles (phi, theta, psi): R3(psi) R1(theta) R3(phi)."""
        lib = self._eval("librations", jd)
        phi, theta, psi = lib[:, 0], lib[:, 1], lib[:, 2]
        return _rot(3, psi) @ _rot(1, theta) @ _rot(3, phi)

    # -- apparent vectors ----------------------------------------------------------------------------
    def apparent(self, target: str, observer: str, jd: np.ndarray, iterations: int = 4) -> np.ndarray:
        """Apparent position of target seen from observer centre (ICRF km), SPICE 'LT+S' semantics:
        converged Newtonian light time, then stellar aberration for the observer's barycentric velocity."""
        jd = np.atleast_1d(np.asarray(jd, dtype=float))
        po, vo = self.state(observer, jd)
        lt = np.zeros_like(jd)
        for _ in range(iterations):
            pt, _ = self.state(target, jd - lt)
            rel = pt - po
            lt = np.linalg.norm(rel, axis=1) / C_KM_DAY
        pt, _ = self.state(target, jd - lt)
        rel = pt - po
        return stellar_aberration(rel, vo / 86400.0)


def stellar_aberration(p: np.ndarray, v_km_s: np.ndarray) -> np.ndarray:
    """SPICE STELAB: rotate p toward the observer velocity by asin(|u x v/c|) (first order in v/c)."""
    r = np.linalg.norm(p, axis=1, keepdims=True)
    u = p / r
    h = np.cross(u, v_km_s / C_KM_S)
    sinphi = np.linalg.norm(h, axis=1, keepdims=True)
    phi = np.arcsin(np.clip(sinphi, 0, 1))
    with np.errstate(invalid="ignore", divide="ignore"):
        k = np.where(sinphi > 0, h / sinphi, 0.0)
    # Rodrigues rotation of u about k by phi
    c, s = np.cos(phi), np.sin(phi)
    u2 = u * c + np.cross(k, u) * s + k * np.sum(k * u, axis=1, keepdims=True) * (1 - c)
    return u2 * r


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def provenance() -> dict:
    p = CACHE / "provenance.json"
    return json.loads(p.read_text()) if p.exists() else {}
