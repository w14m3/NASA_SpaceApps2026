"""Apparent Sun/Earth vectors seen from the Moon (MOON_ME) and the geocentric Moon (CIRS), from DE421.

Conventions (contract 7.1): MOON_ME, km, UTC in / TDB inside, aberration 'LT+S' (converged light time + stellar
aberration), observer = Moon centre. The site parallax is applied at runtime (vector from the site).
"""
from __future__ import annotations

import warnings
from functools import lru_cache
from pathlib import Path

import erfa
import numpy as np

from .de421 import DE421, pa_to_me_matrix
from .timescales import unix_ms_to_tdb_jd, unix_ms_to_utc_jd, utc_to_tt

warnings.filterwarnings("ignore", category=erfa.ErfaWarning)


@lru_cache(maxsize=1)
def de421() -> DE421:
    return DE421.load()


def moon_me(target: str, unix_ms: np.ndarray) -> np.ndarray:
    """Apparent position of 'sun' or 'earth' seen from the Moon's centre, MOON_ME (DE421 realisation), km."""
    eph = de421()
    jd = unix_ms_to_tdb_jd(unix_ms)
    p = eph.apparent(target, "moon", jd)
    r_pa = eph.icrf_to_pa(jd)
    pa = np.einsum("nij,nj->ni", r_pa, p)
    return pa @ pa_to_me_matrix().T


def moon_cirs(unix_ms: np.ndarray) -> np.ndarray:
    """Apparent geocentric Moon (LT+S for the geocentre) rotated GCRS -> CIRS (IAU 2006/2000A, ERFA c2i06a), km.

    At runtime: ITRS ~= R3(ERA(UT1)) . CIRS (polar motion < 0.5", ignored and documented)."""
    eph = de421()
    jd = unix_ms_to_tdb_jd(unix_ms)
    p = eph.apparent("moon", "earth", jd)
    j1, j2 = unix_ms_to_utc_jd(unix_ms)
    tt1, tt2 = utc_to_tt(j1, j2)
    m = erfa.c2i06a(tt1, tt2)
    return np.einsum("nij,nj->ni", m, p)


def load_ut1_table(path: Path | None = None):
    """Daily UT1-UTC (s) from IERS finals2000A.all (Bulletin A, incl. predictions) bundled in astropy-iers-data."""
    if path is None:
        import astropy_iers_data
        path = Path(astropy_iers_data.__file__).parent / "data" / "finals2000A.all"
    mjd, dut, flag = [], [], []
    for line in path.read_text().splitlines():
        s = line[58:68].strip()
        if len(line) < 68 or not s:
            continue
        mjd.append(float(line[7:15]))
        dut.append(float(s))
        flag.append(line[57])
    return np.array(mjd), np.array(dut), np.array(flag), path.name
