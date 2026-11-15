"""SPICE (NAIF) ephemeris: apparent Sun and Earth vectors seen from the Moon's centre in MOON_ME (DE440), contract §7.3
primary engine. Kernels from codex/fetch_nasa_data.py in data/cache/kernels/ (hashes in data/cache/SHA256SUMS)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
K = ROOT / "data" / "cache" / "kernels"
KERNELS = ["naif0012.tls", "pck00011.tpc", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf", "de440s.bsp"]


def available() -> bool:
    return all((K / k).exists() for k in KERNELS)


@lru_cache(maxsize=1)
def _load():
    import spiceypy as sp
    for k in KERNELS:
        sp.furnsh(str(K / k))
    return sp


def moon_me(target: str, unix_ms: np.ndarray) -> np.ndarray:
    """spkpos(target, et, 'MOON_ME', 'LT+S', 'MOON') at UTC Unix milliseconds, km."""
    sp = _load()
    ms = np.atleast_1d(unix_ms)
    out = np.empty((len(ms), 3))
    for i, m in enumerate(ms):
        # UTC (whole second as ISO string, converted with the leap-second kernel) + fractional second -> ET
        sec = m / 1000.0
        whole = float(np.floor(sec))
        et = sp.str2et(_iso(whole)) + (sec - whole)
        p, _ = sp.spkpos(target.upper(), et, "MOON_ME", "LT+S", "MOON")
        out[i] = p
    return out


def _iso(sec: float) -> str:
    import datetime as dt
    return dt.datetime.fromtimestamp(sec, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
