"""Fetch JPL DE421 from PyPI (package `de421` 2008.1) into data/cache/de421 and record provenance.

Idempotent. Uses `pip download` (PyPI is reachable where NASA hosts are not). Cross-platform.
"""
from __future__ import annotations

import datetime as dt
import json
import subprocess
import sys
import tarfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lunarnav.de421 import CACHE, sha256  # noqa: E402

PKG = "de421==2008.1"


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    if (CACHE / "de421" / "constants.npy").exists() and (CACHE / "provenance.json").exists():
        print("DE421 already present:", CACHE)
        return
    subprocess.run([sys.executable, "-m", "pip", "download", PKG, "--no-deps", "--no-binary", ":all:",
                    "-d", str(CACHE)], check=True)
    tgz = next(CACHE.glob("de421-*.tar.gz"))
    with tarfile.open(tgz) as tf:
        for m in tf.getmembers():
            if m.name.endswith(".npy"):
                m.name = "de421/" + Path(m.name).name
                tf.extract(m, CACHE, filter="data")
    prov = {
        "product": "JPL DE421 planetary and lunar ephemeris (Folkner, Williams & Boggs 2009, IPN PR 42-178)",
        "package": PKG,
        "index_url": "https://pypi.org/project/de421/2008.1/",
        "file": tgz.name,
        "sha256": sha256(tgz),
        "bytes": tgz.stat().st_size,
        "fetched_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
    (CACHE / "provenance.json").write_text(json.dumps(prov, indent=1))
    print(json.dumps(prov, indent=1))


if __name__ == "__main__":
    main()
