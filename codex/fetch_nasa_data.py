#!/usr/bin/env python3
"""Resumable download of the NASA inputs into data/cache/ (git-ignored), with a SHA-256 manifest.

Cross-platform (Windows, macOS, Linux), standard library only. Idempotent: complete files are kept, partial
downloads resume with HTTP Range requests. Usage:  python codex/fetch_nasa_data.py
Sources are documented in docs/RESOURCES.md.
"""
from __future__ import annotations

import hashlib
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache"
NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
PGDA = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp"
UA = {"User-Agent": "sightline-pipeline (NASA Space Apps 2026)"}


def fetch(url: str, dest: Path, tries: int = 6) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    if dest.exists() and dest.stat().st_size > 0 and not part.exists():
        print(f"ok    {dest.name}")
        return True
    print(f"GET   {url}")
    for attempt in range(1, tries + 1):
        have = part.stat().st_size if part.exists() else 0
        headers = dict(UA)
        if have:
            headers["Range"] = f"bytes={have}-"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
                mode = "ab" if have and r.status == 206 else "wb"
                with open(part, mode) as f:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk:
                            break
                        f.write(chunk)
            part.replace(dest)
            print(f"done  {dest.name} ({dest.stat().st_size:,} B)")
            return True
        except urllib.error.HTTPError as e:
            if e.code == 416 and have:  # range beyond end: the partial file is already complete
                part.replace(dest)
                print(f"done  {dest.name}")
                return True
            if e.code == 404:
                print(f"FAIL  404 {url}", file=sys.stderr)
                return False
            print(f"retry {attempt}/{tries} {dest.name}: HTTP {e.code}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 - network errors of any kind: retry
            print(f"retry {attempt}/{tries} {dest.name}: {e}", file=sys.stderr)
        time.sleep(5 * attempt)
    print(f"FAIL  {url}", file=sys.stderr)
    return False


def latest(dir_url: str, pattern: str) -> str | None:
    """Newest file name matching pattern in a NAIF directory listing (names embed their issue date)."""
    try:
        with urllib.request.urlopen(urllib.request.Request(dir_url + "/", headers=UA), timeout=60) as r:
            names = sorted(set(re.findall(pattern, r.read().decode("utf-8", "replace"))))
        return names[-1] if names else None
    except Exception as e:  # noqa: BLE001
        print(f"FAIL  listing {dir_url}: {e}", file=sys.stderr)
        return None


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    k, d = CACHE / "kernels", CACHE / "dem"
    jobs = [
        (f"{NAIF}/lsk/naif0012.tls", k / "naif0012.tls"),
        (f"{NAIF}/pck/pck00011.tpc", k / "pck00011.tpc"),
        (f"{NAIF}/pck/moon_pa_de440_200625.bpc", k / "moon_pa_de440_200625.bpc"),
        (f"{NAIF}/fk/satellites/moon_de440_250416.tf", k / "moon_de440_250416.tf"),
        (f"{NAIF}/spk/planets/de440s.bsp", k / "de440s.bsp"),
    ]
    # Earth orientation and DSN station kernels are re-issued with new dates: take the newest listed file.
    for sub, pat in (("pck", r"earth_\d{4}_\d{6}_\d{4}_combined\.bpc"),
                     ("spk/stations", r"earthstns_itrf93_\d{6}\.bsp"),
                     ("fk/stations", r"earth_topo_\d{6}\.tf")):
        name = latest(f"{NAIF}/{sub}", pat)
        if name:
            jobs.append((f"{NAIF}/{sub}/{name}", k / name))
    # LOLA south-pole DEMs (PGDA product 90). 20 m and 5 m products are read as windows by the pipeline.
    for name in ("LDEM_80S_80MPP_ADJ.TIF", "LDEM_80S_80MPP_ADJ_ERR.TIF", "LDEM_60S_240MPP_ADJ.TIF"):
        jobs.append((f"{PGDA}/{name}", d / name))

    failed = [url for url, dest in jobs if not fetch(url, dest)]
    files = sorted(p for p in CACHE.rglob("*") if p.is_file() and not p.name.endswith(".part") and p.name != "SHA256SUMS")
    (CACHE / "SHA256SUMS").write_text(
        "".join(f"{sha256(p)}  {p.relative_to(CACHE).as_posix()}\n" for p in files), encoding="utf-8")
    print(f"manifest: {CACHE / 'SHA256SUMS'} ({len(files)} files); failed: {len(failed)}")
    for url in failed:
        print(f"  failed: {url}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
