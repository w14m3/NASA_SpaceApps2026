import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
ROOT = Path(__file__).resolve().parents[2]
HAS_DE421 = (ROOT / "data" / "cache" / "de421" / "de421" / "constants.npy").exists()
needs_de421 = pytest.mark.skipif(not HAS_DE421, reason="run python pipeline/scripts/fetch_de421.py first")
