#!/usr/bin/env bash
# Codex environment setup script. Runs with internet access before the agent phase.
# Installs dependencies for the reference app and the new product, then downloads NASA data into data/cache/.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "== tool versions"; python3 --version; node --version; npm --version; df -h . | tail -1

echo "== python dependencies"
python3 -m pip install --upgrade pip >/dev/null 2>&1 || true
if [ -f pipeline/requirements.txt ]; then
  python3 -m pip install -r pipeline/requirements.txt
else
  python3 -m pip install spiceypy numpy scipy numba rasterio pyproj pillow requests pytest
fi

echo "== node dependencies"
( cd reference/v1/web && npm ci --no-audit --no-fund ) || echo "reference web install failed"
if [ -f web/package-lock.json ]; then ( cd web && npm ci --no-audit --no-fund ); fi
if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; fi
npx --yes playwright install --with-deps chromium || echo "playwright browser install failed (e2e will report it)"

echo "== NASA data"
bash codex/fetch_nasa_data.sh || echo "some NASA downloads failed; the agent retries if internet is enabled"
echo "== setup done"
