"""Build every static artifact the web app needs from the DEMs and the researched site list.

Outputs under web/public/data/:
  sites.json            curated sites (with DEM height and available mask heights)
  masks/<id>.json       horizon masks (nominal, lower, upper, distance) per instrument height
  dem240.bin/.json      240 m south-polar DEM (80S-90S) for in-browser custom-site masks
  hillshade_80S.jpg     shaded relief for the 2D polar map
  manifest.json         reproducibility manifest
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lunarnav import ephem as E, horizon as Hz  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEM = ROOT / "data" / "dem"
OUT = ROOT / "web" / "public" / "data"
HEIGHTS = [2, 10]
SHORT = {
    "apollo11": "Apollo 11", "apollo12": "Apollo 12", "apollo14": "Apollo 14", "apollo15": "Apollo 15",
    "apollo16": "Apollo 16", "apollo17": "Apollo 17",
    "im1_odysseus": "IM-1 Odysseus", "im2_athena": "IM-2 Athena", "blue_ghost_m1": "Blue Ghost M1",
    "chandrayaan3_vikram": "Chandrayaan-3", "slim": "SLIM", "change3": "Chang'e 3", "change4": "Chang'e 4",
    "change5": "Chang'e 5", "change6": "Chang'e 6", "luna9": "Luna 9",
    "poi_site001_connecting_ridge": "Connecting Ridge (site 001)",
    "poi_site004_shackleton_rim": "Shackleton rim (site 004)",
    "poi_bussey2010_A_shackleton_rim": "Shackleton rim (Bussey A)",
    "poi_bussey2010_B_connecting_ridge": "Connecting Ridge (Bussey B)",
    "poi_bussey2010_C_degerlache_rim": "de Gerlache rim (Bussey C)",
    "poi_bussey2010_D_peak_near_shackleton": "Peak near Shackleton (Bussey D)",
    "poi_bussey2010_M1_malapert": "Malapert massif (Bussey M1)",
    "poi_bussey2010_M2_malapert": "Malapert massif (Bussey M2)",
    "poi_lpsc2024_connecting_ridge_candidate": "Connecting Ridge (Gracy & Lee)",
    "poi_lpsc2024_peak_near_shackleton_candidate": "Peak near Shackleton (Gracy & Lee)",
}
N_AZ = 1440
S_MAX = 300_000.0
SCALE_DEG = 0.002           # int16 counts -> degrees
# ASSUMPTION: 1-sigma height error of the 240 m product = RMS difference between the 240 m and 80 m
# surfaces measured inside the 80S cap (2.7 m, see dem240.json), rounded up and applied out to 60S.
COARSE_ERR_M = 3.0


def load_grid(name: str, err_name: str | None = None, err_const: float = 0.0) -> Hz.Grid | None:
    p = DEM / name
    if not p.exists():
        return None
    with rasterio.open(p) as ds:
        z = ds.read(1).astype(np.float32)
        t = ds.transform
        assert abs(t.a + t.e) < 1e-9 and t.b == 0 and t.d == 0, "expected square north-up pixels"
        g = Hz.Grid(z=z, x0=t.c, y0=t.f, px=t.a, err_const=err_const)
    if err_name and (DEM / err_name).exists():
        with rasterio.open(DEM / err_name) as ds:
            g.err = ds.read(1).astype(np.float32)
        g.err_const = float(np.nanmedian(g.err))
    return g


def b64_i16(a: np.ndarray, scale: float) -> str:
    q = np.clip(np.round(a / scale), -32767, 32767).astype("<i2")
    return base64.b64encode(q.tobytes()).decode("ascii")


def load_grids():
    fine = load_grid("LDEM_80S_80MPP_ADJ.TIF", "LDEM_80S_80MPP_ADJ_ERR.TIF")
    coarse = load_grid("LDEM_60S_240MPP_ADJ.TIF", err_const=COARSE_ERR_M)
    if fine is None:
        raise SystemExit("LDEM_80S_80MPP_ADJ.TIF missing; run pipeline/scripts/fetch_data.py")
    return fine, coarse


def build_sites(fine: Hz.Grid, coarse: Hz.Grid | None) -> list[dict]:
    research = json.loads((ROOT / "data" / "sites_research.json").read_text(encoding="utf-8"))
    (OUT / "masks").mkdir(parents=True, exist_ok=True)
    sites = []
    for s in research["sites"]:
        if s.get("lat") is None or s.get("lon") is None:
            continue
        lon = ((float(s["lon"]) + 180.0) % 360.0) - 180.0
        lat = float(s["lat"])
        site = {
            "id": s["id"], "name": SHORT.get(s["id"], s["name"]), "description": s["name"],
            "category": s["category"], "lat": lat, "lon": lon,
            "status": s["status"], "source_title": s.get("source_title"),
            "source_url": s.get("source_url"), "notes": s.get("notes"),
            "landing_utc": s.get("landing_utc"), "z0": None,
        }
        try:
            z0, _ = Hz.site_height(fine, coarse, lon, lat)
        except ValueError:
            sites.append(site)
            continue
        in_fine = lat <= -80.5
        dem_label = ("LOLA 80 m DEM horizon (precomputed, 0.25° azimuth steps)" if in_fine else
                     "LOLA 240 m DEM horizon (precomputed; site lies outside the 80 m product)")
        payload = {"id": s["id"], "n_az": N_AZ, "scale_deg": SCALE_DEG, "s_max_km": S_MAX / 1000,
                   "label": dem_label, "z0": z0, "heights": {}}
        max_void = 0.0
        for h in HEIGHTS:
            m = Hz.horizon_mask(fine, coarse, lon, lat, float(h), n_az=N_AZ, s_max=S_MAX)
            payload["z0_err"] = m["z0_err"]
            max_void = max(max_void, float(m["void_frac"].max()))
            payload["heights"][str(h)] = {
                "mid": b64_i16(m["mask"], SCALE_DEG), "lo": b64_i16(m["lo"], SCALE_DEG),
                "hi": b64_i16(m["hi"], SCALE_DEG), "dist": b64_i16(m["dist_m"] / 1000.0, 0.01),
            }
        payload["max_void_frac"] = max_void
        if max_void > 0.3:
            payload["note"] = ("Part of the horizon search left DEM coverage; terrain beyond the "
                               "data edge is not included.")
        (OUT / "masks" / f"{s['id']}.json").write_text(json.dumps(payload) + "\n")
        site["z0"] = z0
        site["mask_heights"] = HEIGHTS
        sites.append(site)
        print(f"mask {s['id']:<44} z0 {z0:8.1f} m  mask[{m['mask'].min():6.2f},{m['mask'].max():6.2f}] deg"
              f"  band {np.mean(m['hi'] - m['lo']):.3f} deg  void {max_void:.2f}", flush=True)
    (OUT / "sites.json").write_text(json.dumps(sites, indent=1) + "\n", encoding="utf-8")
    return sites


def build_browser_dem(fine: Hz.Grid, coarse: Hz.Grid | None) -> dict:
    """240 m grid of the 80S cap. Source: the 60S 240 m product if present, else block-mean of 80 m."""
    half = 304_000.0
    if coarse is not None:
        c0 = int(round((-half - coarse.x0) / coarse.px))
        r0 = int(round((coarse.y0 - half) / coarse.px))
        n = int(round(2 * half / coarse.px))
        z = coarse.z[r0:r0 + n, c0:c0 + n]
        x0, y0, px = coarse.x0 + c0 * coarse.px, coarse.y0 - r0 * coarse.px, coarse.px
        src = "LDEM_60S_240MPP_ADJ.TIF (cropped to the 80S cap)"
    else:
        k = 3
        n = fine.z.shape[0] // k
        z = fine.z[:n * k, :n * k].reshape(n, k, n, k).mean(axis=(1, 3))
        x0, y0, px = fine.x0, fine.y0, fine.px * k
        src = "LDEM_80S_80MPP_ADJ.TIF (3x3 block mean)"
    q = np.where(np.isnan(z), -32768, np.clip(np.round(z / 0.5), -32767, 32767)).astype("<i2")
    q.tofile(OUT / "dem240.bin")
    # representativity error: RMS difference between the 240 m surface and the 80 m DEM
    g240 = Hz.Grid(z=z.astype(np.float32), x0=x0, y0=y0, px=px)
    rng = np.random.default_rng(5)
    xs = rng.uniform(-half * 0.95, half * 0.95, 200_000)
    ys = rng.uniform(-half * 0.95, half * 0.95, 200_000)
    d = np.array([Hz._bilinear(g240.z, x0, y0, px, x, y) - Hz._bilinear(fine.z, fine.x0, fine.y0, fine.px, x, y)
                  for x, y in zip(xs, ys)])
    rms = float(np.sqrt(np.nanmean(d ** 2)))
    meta = {"n": int(q.shape[0]), "x0": x0, "y0": y0, "px": px, "scale": 0.5, "err": round(rms, 1),
            "source": src,
            "err_definition": "RMS height difference vs the 80 m DEM at 200k random points (measured)"}
    (OUT / "dem240.json").write_text(json.dumps(meta, indent=1) + "\n")
    print("browser DEM", meta, flush=True)
    return meta


def build_hillshade(fine: Hz.Grid) -> None:
    k = 4
    n = fine.z.shape[0] // k
    z = np.nan_to_num(fine.z[:n * k, :n * k].reshape(n, k, n, k).mean(axis=(1, 3)))
    gy, gx = np.gradient(z, fine.px * k)
    az, alt = np.radians(315.0), np.radians(35.0)
    slope = np.pi / 2 - np.arctan(np.hypot(gx, gy) * 2.0)      # 2x vertical exaggeration
    aspect = np.arctan2(gy, -gx)
    shade = np.sin(alt) * np.sin(slope) + np.cos(alt) * np.cos(slope) * np.cos(az - np.pi / 2 - aspect)
    img = np.clip(40 + 200 * (shade - shade.min()) / (shade.max() - shade.min()), 0, 255).astype(np.uint8)
    Image.fromarray(img, "L").save(OUT / "hillshade_80S.jpg", quality=82)
    print("hillshade", img.shape, flush=True)


def git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                                       stderr=subprocess.DEVNULL).decode().strip()
    except Exception:  # noqa: BLE001
        return "uncommitted"


def build_manifest(dem_meta: dict) -> None:
    src = json.loads((ROOT / "data" / "sources.json").read_text())
    eph = json.loads((OUT / "ephem.json").read_text())
    span_end = dt.datetime.fromisoformat(eph["epoch_utc"].replace("Z", "+00:00")) + dt.timedelta(
        seconds=eph["n_segments"] * eph["seg_seconds"])
    manifest = {
        "built_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "git_commit": git_commit(),
        "kernels": [k for k in E.KERNELS],
        "kernel_hashes": {Path(k).name: v["sha256"] for k, v in src.items() if "kernels" in k},
        "dem_products": [{"file": Path(k).name, "sha256": v["sha256"], "url": v["url"]}
                         for k, v in src.items() if "/dem/" in k],
        "ephemeris_span": [eph["epoch_utc"], span_end.isoformat().replace("+00:00", "Z")],
        "mask": {"n_az": N_AZ, "s_max_km": S_MAX / 1000, "heights_m": HEIGHTS,
                 "ray_step": "half a pixel", "coarse_err_assumption_m": COARSE_ERR_M},
        "browser_dem": dem_meta,
        "validation": {},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fine, coarse = load_grids()
    print("fine DEM", fine.z.shape, "err raster" if fine.err is not None else "NO err raster",
          "| coarse", None if coarse is None else coarse.z.shape, flush=True)
    build_sites(fine, coarse)
    dem_meta = build_browser_dem(fine, coarse)
    build_hillshade(fine)
    build_manifest(dem_meta)
    build_provenance()



def build_provenance() -> None:
    """docs/DATA_PROVENANCE.md from data/sources.json (hashes of exactly what was downloaded)."""
    src = json.loads((ROOT / "data" / "sources.json").read_text())
    lines = [
        "# Data provenance", "",
        "Generated by `pipeline/scripts/build_site_data.py` from `data/sources.json`. Every input is fetched by",
        "`pipeline/scripts/fetch_data.py`; nothing is edited by hand.", "",
        "| File | Source URL | Bytes | SHA-256 | Fetched (UTC) |", "|---|---|---|---|---|",
    ]
    for rel, v in sorted(src.items()):
        lines.append(f"| `{Path(rel).name}` | {v['url']} | {v['bytes']:,} | `{v['sha256'][:20]}…` | {v['fetched_utc']} |")
    lines += [
        "", "## Products and licences", "",
        "- **LOLA south-pole DEMs** — NASA GSFC Planetary Geodesy Data Archive, product 90, Barker et al. 2023,",
        "  Planet. Sci. J. 4, 183, doi:10.3847/PSJ/acf3e1 (data doi:10.60903/gsfcpgda-lola-spole). South polar",
        "  stereographic, sphere 1737.4 km, MOON_ME frame, heights in metres. NASA data, public domain; cite the paper.",
        "- **SPICE kernels** — NASA/JPL NAIF generic kernels. Public; follow NAIF's rules of use (credit NAIF).",
        "- **LRO WAC global mosaic** — NASA/GSFC/Arizona State University, streamed from NASA Moon Trek at runtime",
        "  (not redistributed).",
        "- **JPL Horizons** responses used for validation are cached in `data/raw/horizons/` with their query parameters.",
        "- **Site coordinates** — `data/sites_research.json`: each entry has its source URL and the quoted text.",
        "", "## Processing parameters", "",
        f"- Horizon masks: {N_AZ} azimuths, search radius {S_MAX / 1000:.0f} km, instrument heights {HEIGHTS} m,",
        "  step 1 % of distance capped at half a pixel, bilinear sampling.",
        f"- Outside the 80 m product a height error of ±{COARSE_ERR_M:.0f} m is assumed (measured 240 m vs 80 m RMS in the 80°S cap, rounded up).",
        "- Browser DEM: 240 m, int16 at 0.5 m per count, 80°S–90°S.",
        "- Hillshade: 4×4 block mean of the 80 m DEM, light from azimuth 315°, altitude 35°, 2× vertical exaggeration.",
    ]
    (ROOT / "docs" / "DATA_PROVENANCE.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
