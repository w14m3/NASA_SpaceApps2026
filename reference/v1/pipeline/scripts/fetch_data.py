"""Acquire every external input (NAIF kernels, LOLA DEMs) and record hashes.

Usage:  python pipeline/scripts/fetch_data.py [--only kernels|dem]

Idempotent: existing files are kept and re-hashed. Writes data/sources.json,
the input half of the reproducibility manifest (rule 5.3 of the brief).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
PGDA = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp"

# (group, relative destination, url, required)
FILES = [
    ("kernels", "data/kernels/naif0012.tls", f"{NAIF}/lsk/naif0012.tls", True),
    ("kernels", "data/kernels/pck00011.tpc", f"{NAIF}/pck/pck00011.tpc", True),
    ("kernels", "data/kernels/moon_pa_de440_200625.bpc", f"{NAIF}/pck/moon_pa_de440_200625.bpc", True),
    ("kernels", "data/kernels/moon_de440_250416.tf", f"{NAIF}/fk/satellites/moon_de440_250416.tf", True),
    ("kernels", "data/kernels/earth_1962_260806_2126_combined.bpc", f"{NAIF}/pck/earth_1962_260806_2126_combined.bpc", True),
    ("kernels", "data/kernels/de440s.bsp", f"{NAIF}/spk/planets/de440s.bsp", True),
    ("kernels", "data/kernels/earthstns_itrf93_260814.bsp", f"{NAIF}/spk/stations/earthstns_itrf93_260814.bsp", False),
    ("kernels", "data/kernels/earth_topo_260814.tf", f"{NAIF}/fk/stations/earth_topo_260814.tf", False),
    ("dem", "data/dem/LDEM_80S_80MPP_ADJ.TIF", f"{PGDA}/LDEM_80S_80MPP_ADJ.TIF", True),
    ("dem", "data/dem/LDEM_80S_80MPP_ADJ_ERR.TIF", f"{PGDA}/LDEM_80S_80MPP_ADJ_ERR.TIF", True),
    ("dem", "data/dem/LDEM_80S_80MPP_ADJ_HILL.TIF", f"{PGDA}/LDEM_80S_80MPP_ADJ_HILL.TIF", True),
    ("dem", "data/dem/LDEM_60S_240MPP_ADJ.TIF", f"{PGDA}/LDEM_60S_240MPP_ADJ.TIF", True),
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path, tries: int = 5) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, tries + 1):
        try:
            with requests.get(url, stream=True, timeout=120,
                              headers={"User-Agent": "lunar-navigator-pipeline"}) as r:
                r.raise_for_status()
                with tmp.open("wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            tmp.replace(dest)
            return
        except Exception as exc:  # noqa: BLE001 - retry on anything network-shaped
            print(f"  attempt {attempt}/{tries} failed: {exc}", flush=True)
            time.sleep(5 * attempt)
    raise RuntimeError(f"could not download {url}")


def main() -> int:
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    out_path = ROOT / "data" / "sources.json"
    records = json.loads(out_path.read_text()) if out_path.exists() else {}
    failed_required = False
    for group, rel, url, required in FILES:
        if only and group != only:
            continue
        dest = ROOT / rel
        if not dest.exists():
            print(f"GET {url}", flush=True)
            try:
                download(url, dest)
            except RuntimeError as exc:
                print(f"  {'ERROR' if required else 'optional, skipped'}: {exc}", flush=True)
                failed_required |= required
                continue
            fetched = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        else:
            fetched = records.get(rel, {}).get("fetched_utc", "pre-existing")
        records[rel] = {
            "url": url,
            "bytes": dest.stat().st_size,
            "sha256": sha256(dest),
            "fetched_utc": fetched,
        }
        print(f"ok  {rel}  {records[rel]['bytes']} B", flush=True)
        out_path.write_text(json.dumps(records, indent=2, sort_keys=True) + "\n")
    return 1 if failed_required else 0


if __name__ == "__main__":
    raise SystemExit(main())
