"""Evaluator for the reference/v1 SPICE DE440 Chebyshev ephemeris (oracle; read-only data)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
V1 = ROOT / "reference" / "v1" / "web" / "public" / "data"


class V1Ephem:
    def __init__(self, folder: Path = V1, json_name="ephem.json", bin_name="ephem.bin"):
        self.meta = json.loads((folder / json_name).read_text())
        m = self.meta
        self.n1 = m["degree"] + 1
        self.c = np.fromfile(folder / bin_name, dtype="<f8").reshape(len(m["targets"]), m["n_segments"], 3, self.n1)
        self.start_ms = m["epoch_unix_ms"]
        self.end_ms = self.start_ms + m["n_segments"] * m["seg_seconds"] * 1000

    def position(self, body: str, unix_ms: np.ndarray) -> np.ndarray:
        m = self.meta
        t = (np.atleast_1d(unix_ms) - m["epoch_unix_ms"]) / 1000.0
        s = np.clip(np.floor(t / m["seg_seconds"]).astype(int), 0, m["n_segments"] - 1)
        x = (t - (s + 0.5) * m["seg_seconds"]) / (m["seg_seconds"] / 2)
        c = self.c[m["targets"].index(body), s]  # (n, 3, n1)
        T = np.empty((self.n1, len(t)))
        T[0], T[1] = 1, x
        for j in range(2, self.n1):
            T[j] = 2 * x * T[j - 1] - T[j - 2]
        return np.einsum("nak,kn->na", c, T)
