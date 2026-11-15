"""Chebyshev interpolation on fixed segments (independent variable: UTC Unix milliseconds)."""
from __future__ import annotations

import numpy as np


def nodes(degree: int) -> np.ndarray:
    """Chebyshev points of the first kind on [-1, 1], degree+1 of them."""
    k = np.arange(degree + 1)
    return np.cos(np.pi * (k + 0.5) / (degree + 1))


def fit_segments(fn, start_ms: float, seg_s: float, n_seg: int, degree: int) -> np.ndarray:
    """Coefficients [n_seg, 3, degree+1] interpolating fn(unix_ms[N]) -> [N, 3] at Chebyshev nodes."""
    x = nodes(degree)
    mids = start_ms + (np.arange(n_seg) + 0.5) * seg_s * 1000.0
    t = (mids[:, None] + x[None, :] * seg_s * 500.0).ravel()
    vals = fn(t).reshape(n_seg, degree + 1, 3)
    # T_j(x_k) matrix; discrete orthogonality gives coefficients directly
    T = np.cos(np.outer(np.arange(degree + 1), np.arccos(x)))  # [j, k]
    coef = np.einsum("jk,sko->soj", T, vals) * (2.0 / (degree + 1))
    coef[:, :, 0] *= 0.5
    return coef


def evaluate(coef: np.ndarray, start_ms: float, seg_s: float, unix_ms: np.ndarray) -> np.ndarray:
    t = (np.atleast_1d(unix_ms) - start_ms) / 1000.0
    n_seg, _, n1 = coef.shape
    s = np.clip(np.floor(t / seg_s).astype(int), 0, n_seg - 1)
    x = (t - (s + 0.5) * seg_s) / (seg_s / 2)
    T = np.empty((n1, len(t)))
    T[0], T[1] = 1.0, x
    for j in range(2, n1):
        T[j] = 2 * x * T[j - 1] - T[j - 2]
    return np.einsum("nak,kn->na", coef[s], T)


def angle_deg(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Angle between row vectors, degrees (robust atan2 form)."""
    return np.degrees(np.arctan2(np.linalg.norm(np.cross(a, b), axis=1), np.sum(a * b, axis=1)))
