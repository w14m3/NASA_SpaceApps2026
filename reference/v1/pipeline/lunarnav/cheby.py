"""Chebyshev compression of the Moon-centred, body-fixed Sun and Earth vectors.

The browser evaluates these polynomials instead of SPICE.  The independent
variable is *UTC* seconds since `epoch_utc` (identical to a Unix-time
difference because the leap-second kernel has no leap second inside the span),
so the browser needs no leap-second table.
"""
from __future__ import annotations

import numpy as np
import spiceypy as sp
from numpy.polynomial import chebyshev as C

from . import ephem as E

SEG_SECONDS = 4 * 86400.0
DEGREE = 15


def fit(epoch_utc: str, n_segments: int, targets=("SUN", "EARTH")) -> dict:
    E.load_kernels()
    et0 = sp.str2et(epoch_utc)
    # check the UTC<->ET offset is constant across the span (no leap second)
    et1 = sp.str2et(epoch_utc) + n_segments * SEG_SECONDS
    d0 = sp.deltet(et0, "ET")
    d1 = sp.deltet(et1, "ET")
    assert abs(d0 - d1) < 0.01, "leap second inside span; split the fit"
    nodes = np.cos(np.pi * (np.arange(DEGREE + 1) + 0.5) / (DEGREE + 1))  # Chebyshev nodes
    coeffs = np.zeros((len(targets), n_segments, 3, DEGREE + 1))
    for s in range(n_segments):
        t_mid = (s + 0.5) * SEG_SECONDS
        utc_sec = t_mid + nodes * SEG_SECONDS / 2
        for ti, tgt in enumerate(targets):
            # ET of a UTC-seconds offset: add to et0 (valid: constant TAI-UTC), periodic
            # TDB-TT term differences (< 2 ms) are handled by re-deriving via deltet
            pos = np.array([E.center_vector(tgt, _et(et0, d0, u)) for u in utc_sec])
            for k in range(3):
                coeffs[ti, s, k] = C.chebfit(nodes, pos[:, k], DEGREE)
    return {"epoch_utc": epoch_utc, "seg_seconds": SEG_SECONDS, "degree": DEGREE,
            "n_segments": n_segments, "targets": list(targets), "coeffs": coeffs,
            "et0": et0, "delta0": d0}


def _et(et0: float, d0: float, utc_sec: float) -> float:
    """ET for a UTC offset from the epoch, exact to the ms-level periodic term."""
    approx = et0 + utc_sec
    return approx + (sp.deltet(approx, "ET") - d0)


def evaluate(model: dict, target: str, utc_sec: float) -> np.ndarray:
    ti = model["targets"].index(target)
    seg = model["seg_seconds"]
    s = min(max(int(utc_sec // seg), 0), model["n_segments"] - 1)
    x = (utc_sec - (s + 0.5) * seg) / (seg / 2)
    return np.array([C.chebval(x, model["coeffs"][ti, s, k]) for k in range(3)])


def max_error(model: dict, n: int = 4000, seed: int = 1) -> dict[str, dict[str, float]]:
    """Angular error (deg) of the fit versus SPICE at random times, per target,
    for the Moon-centre direction and for the worst-case surface site (pole)."""
    rng = np.random.default_rng(seed)
    span = model["n_segments"] * model["seg_seconds"]
    out = {}
    site = E.site_vector(0.0, -90.0, E.R_MOON_KM)
    for tgt in model["targets"]:
        errs, errs_site = [], []
        for u in rng.uniform(0, span, n):
            truth = E.center_vector(tgt, _et(model["et0"], model["delta0"], u))
            got = evaluate(model, tgt, u)
            errs.append(_ang(truth, got))
            errs_site.append(_ang(truth - site, got - site))
        out[tgt] = {"max_deg": float(np.max(errs)), "rms_deg": float(np.sqrt(np.mean(np.square(errs)))),
                    "max_deg_from_surface": float(np.max(errs_site))}
    return out


def _ang(a: np.ndarray, b: np.ndarray) -> float:
    c = np.cross(a, b)
    return float(np.degrees(np.arctan2(np.linalg.norm(c), a @ b)))
