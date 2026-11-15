"""One entry point for the whole build (works on Windows, macOS, Linux; no make needed).

  python build.py fetch      download NAIF kernels and LOLA DEMs (idempotent, hashes recorded)
  python build.py data       ephemeris, horizon masks, browser DEM, hillshade, manifest
  python build.py test       pytest (pipeline) + vitest (browser core)
  python build.py web        build the static site into web/dist
  python build.py validate   collect recorded test output into the Trust page and docs/VALIDATION.md
  python build.py all        everything above, in order
  python build.py serve      serve web/dist at http://localhost:4173
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PY = sys.executable
NPM = shutil.which("npm") or "npm"
NPX = shutil.which("npx") or "npx"


def run(cmd: list[str], cwd: Path = ROOT) -> None:
    print("\n$", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run(cmd, cwd=cwd, check=True)


def fetch() -> None:
    run([PY, "pipeline/scripts/fetch_data.py"])


def data() -> None:
    run([PY, "pipeline/scripts/build_ephemeris.py"])
    run([PY, "pipeline/scripts/build_site_data.py"])


def test() -> None:
    run([PY, "-m", "pytest", "-q"], cwd=ROOT / "pipeline")
    run([NPX, "vitest", "run"], cwd=ROOT / "web")


def validate() -> None:
    run([PY, "pipeline/scripts/build_validation.py"])


def web() -> None:
    if not (ROOT / "web" / "node_modules").exists():
        run([NPM, "ci"], cwd=ROOT / "web")
    run([NPM, "run", "build"], cwd=ROOT / "web")


def serve() -> None:
    run([NPX, "vite", "preview", "--port", "4173", "--strictPort"], cwd=ROOT / "web")


STEPS = {"fetch": fetch, "data": data, "test": test, "validate": validate, "web": web, "serve": serve}

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    if target == "all":
        for step in (fetch, data, test, validate, web):
            step()
    elif target in STEPS:
        STEPS[target]()
    else:
        raise SystemExit(__doc__)
