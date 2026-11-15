"""UTC <-> TT/TDB with ERFA (SOFA). Leap seconds come from ERFA's built-in table (erfa.dat)."""
from __future__ import annotations

import numpy as np
import erfa

UNIX_EPOCH_JD = 2440587.5


def unix_ms_to_utc_jd(ms: np.ndarray):
    """Split UTC Julian date (jd1, jd2) from Unix milliseconds (UTC, no leap seconds inside the span)."""
    ms = np.asarray(ms, dtype=float)
    days = ms / 86_400_000.0
    whole = np.floor(days)
    return UNIX_EPOCH_JD + whole, days - whole


def utc_to_tt(jd1, jd2):
    t1, t2 = erfa.utctai(jd1, jd2)
    return erfa.taitt(t1, t2)


def tt_to_tdb(tt1, tt2):
    # TDB-TT at the geocentre (periodic terms only, |dt| < 2 ms); site-dependent terms are microseconds.
    dt = erfa.dtdb(tt1, tt2, 0.0, 0.0, 0.0, 0.0)
    return tt1, tt2 + dt / 86400.0


def unix_ms_to_tdb_jd(ms: np.ndarray) -> np.ndarray:
    jd1, jd2 = unix_ms_to_utc_jd(ms)
    tt1, tt2 = utc_to_tt(jd1, jd2)
    a, b = tt_to_tdb(tt1, tt2)
    return a + b


def tai_minus_utc(ms: np.ndarray) -> np.ndarray:
    jd1, jd2 = unix_ms_to_utc_jd(ms)
    t1, t2 = erfa.utctai(jd1, jd2)
    return ((t1 - jd1) + (t2 - jd2)) * 86400.0
