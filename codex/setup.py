#!/usr/bin/env python3
"""One-command setup for Codex on the owner's PC (Windows, macOS, Linux).

Installs Python and Node dependencies for the reference app and the new product, the Playwright browser, then
downloads the NASA inputs into data/cache/.  Usage (from the repository root):  python codex/setup.py
Re-run it any time: every step is idempotent.
"""
from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
WIN = os.name == "nt"


def run(cmd: list[str], cwd: Path = ROOT) -> bool:
    print("\n$", " ".join(cmd), f"   (in {cwd.relative_to(ROOT) if cwd != ROOT else '.'})", flush=True)
    # npm/npx are .cmd files on Windows: run them through the shell there
    r = subprocess.run(" ".join(cmd) if WIN else cmd, cwd=cwd, shell=WIN)
    if r.returncode != 0:
        print(f"!! step failed (exit {r.returncode}); continuing", flush=True)
    return r.returncode == 0


def main() -> int:
    print("Python", sys.version.split()[0], "|", platform.platform())
    for tool in ("node", "npm", "git"):
        print(f"{tool:5}", shutil.which(tool) or "NOT FOUND — install it first")
    if sys.version_info < (3, 11):
        print("!! Python 3.11 or newer is required")

    run([PY, "-m", "pip", "install", "--upgrade", "pip"])
    req = ROOT / "pipeline" / "requirements.txt"
    if req.exists():
        run([PY, "-m", "pip", "install", "-r", str(req)])
    else:
        run([PY, "-m", "pip", "install", "spiceypy", "numpy", "scipy", "numba", "rasterio", "pyproj",
             "pillow", "requests", "pytest"])

    for d in (ROOT / "reference" / "v1" / "web", ROOT / "web", ROOT):
        if (d / "package-lock.json").exists():
            run(["npm", "ci", "--no-audit", "--no-fund"], cwd=d)
    run(["npx", "--yes", "playwright", "install", "chromium"] + ([] if WIN or sys.platform == "darwin" else ["--with-deps"]))

    ok = run([PY, str(ROOT / "codex" / "fetch_nasa_data.py")])
    print("\nSetup finished." if ok else "\nSetup finished with download failures: re-run this script to resume.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
