# Reference audit — `reference/v1/`

Read in full on 2026-11-15 (session session_01E6ZbLzKgBjZSm5dfrvnAnd) before any new code was written: `HANDOFF.md`,
`README.md`, `docs/*`, `pipeline/**`, `web/src/**`, `data/sites_research.json`, `data/validation/*`, and the external
review `docs/challenge/ANALYSIS_v1.md`. `reference/` is never edited.

## 1. Architecture of v1

| Layer | Files | Role |
|---|---|---|
| Fetch | `pipeline/scripts/fetch_data.py` | NAIF kernels + LOLA DEMs (80 m, 80 m `_ERR`, 240 m 60°S, hillshade) with SHA-256 in `data/sources.json` |
| Ephemeris | `pipeline/lunarnav/ephem.py`, `cheby.py`, `scripts/build_ephemeris.py` | SPICE `spkpos(target, et, "MOON_ME", "LT+S", "MOON")`; Chebyshev degree 15 on 4-day segments, 2026-01-01 → 2031-01-03; independent variable = UTC seconds (asserts constant TAI−UTC) |
| Horizon | `pipeline/lunarnav/horizon.py` (numba) | Great-circle march per azimuth, 1440 azimuths, 300 km, bilinear, step 1 % of distance capped at ½ px, 80 m then 240 m grid; nominal / lower / upper masks and horizon distance in one pass |
| Site data | `pipeline/scripts/build_site_data.py` | `sites.json`, masks (int16 base64, 0.002° per count) at 2 m and 10 m, `dem240.bin` (int16, 0.5 m per count, 2533², 80–90°S), hillshade JPEG, manifest |
| Validation | `pipeline/scripts/build_validation.py`, `pipeline/tests/*`, `lunarnav/horizons.py` | V1–V6, V8–V10, V13, B1, B2 recorded in `data/validation/*.json`; JPL Horizons responses cached in `data/raw/horizons/` |
| Browser core | `web/src/core/{ephem,geom,horizon,visibility,analysis}.ts` | Clenshaw evaluation; topocentric az/el; 240 m in-browser mask; disk fraction (200 strips); events (10/30 min scan + bisection to 1 s, grazing probe); metrics, heuristic scores, incident energy per panel kind |
| UI | `web/src/App.tsx`, `state.ts`, `components/*` | Reducer + URL sync; Cesium globe (imagery only); canvas polar map; sky plot; timeline; workbench; Trust page |

Data flow: kernels/DEMs → pipeline → static artifacts in `web/public/data/` → browser core → UI. The browser never
calls SPICE or Horizons.

## 2. Algorithms (as implemented, verified by reading the code)

- **Topocentric geometry**: r_s = (R + z₀ + h)·û; up/east/north frame; az = atan2(d̂·east, d̂·north),
  el = asin(d̂·up); Earth and Sun directions from the site vector (parallax up to 0.26° for Earth).
- **Horizon**: ε(s) = atan2(ρ cos θ − ρ₀, ρ sin θ), mask = max ε. Step `min(½ px, max(0.5 m, 0.01·s))` starting at
  s = 2 m. Uncertainty: terrain shifted by ±δ(s), δ = (σ_terrain + σ_site)·min(1, s / 2 px) (pipeline) — the browser
  port uses δ = 2·err·min(1, s/2px) with err = 2.7 m (measured 240 m vs 80 m RMS).
- **Disk fraction**: 200 vertical strips, azimuth offsets divided by cos(el) (floored at 0.05), linear interpolation
  of the mask in azimuth; fast exits when the disk is ≥ 0.5° clear of the local mask range.
- **Events**: g(t) = fraction − threshold (Sun 1 %, Earth 50 %); scan 10 min (30 min beyond 120 days); bisection to
  1 s; grazing probe (20 sub-steps) when |g| < 0.2 and moving towards zero.
- **Energy**: incident only, trapezoid on 901 samples (the cause of the 0.74 % error over 365 days found by the
  external review).
- **Scores**: Power = 100·(0.6·L + 0.4·(1 − min(1, D/354.4 h))); Link idem with Earth; Combined = √(P·L).

## 3. What becomes an oracle (golden fixtures in the new test suites)

| Oracle | File | New test |
|---|---|---|
| 300 rigorous SPICE topocentric az/el rows (Sun, Earth), DE440 MOON_ME | `web/src/core/__fixtures__/azel.json` | **O1** (≤ 0.001°) |
| Validated horizon masks, 13 south-pole sites × {2, 10} m, 1440 azimuths, from 80 m + 240 m LOLA | `web/public/data/masks/*.json` | **O2** (reported; see §6 for why the full-resolution comparison is not possible here) |
| v1 browser horizon algorithm on the 240 m DEM | `web/src/core/horizon.ts` + `dem240.bin` | **O2b**: new cascade vs v1 algorithm on the same DEM (≤ 0.05°) |
| SPICE DE440 Chebyshev ephemeris 2026–2031 (error 3e-9°) | `web/public/data/ephem.bin|json` | **V19**: new 2017–2031 ephemeris vs SPICE over the overlap |
| Cached JPL Horizons responses (2,000 random site/time pairs + Apollo 11) | `data/raw/horizons/*` | **V2**, **V3** re-run offline against the new pipeline |
| Recorded results V1–V10, B1, B2 | `data/validation/*.json` | Comparison values in VALIDATION.md |

## 4. What is reused as data (not code)

- `sites.json` / `data/sites_research.json`: 26 researched sites with source URL and quote each, DSN coordinates
  (DSS-14, DSS-43, DSS-63, from NAIF `earth_topo_260814.tf` comments). Statuses (verified/unverified) are kept.
- Horizon masks of the 13 south-pole sites (computed from the 80 m product, which this environment cannot download).
- `dem240.bin` (240 m, 80–90°S) — terrain for custom sites, candidate grids, hazards at a 240 m baseline, 3D view.
- `hillshade_80S.jpg` — fallback basemap of the polar map.
- `ephem.bin` — SPICE DE440 Sun/Earth ephemeris 2026–2031, used as oracle and as the preferred runtime segment.

## 5. Rejected and why

| Item | Reason |
|---|---|
| v1 UI code (App, components, state) | "From zero" rule: new layout, new state model, new components |
| Trapezoid energy integral on 901 samples | 0.74 % error over 365 days; replaced by event-aware adaptive integration (V10) |
| `in_fine = lat <= -80.5` | Labels IM-1 (80.13°S) wrongly; coverage is tested on the grid, not by latitude |
| "N× a flat panel" headline | Strawman baseline; new headline is vs the best fixed vertical panel at 2 m |
| Default mast 2 m | Near-field terrain dominates (Malapert M1: 173-day night at 2 m); new default 10 m with confidence grade |
| Main-thread analysis | 2 s freeze at 365 d × 4 sites; new heavy work runs in Web Workers |
| Documentation saying "half-pixel steps" / "terrain 80–90°S" | Did not match the code; new docs describe the 1 % rule and the actual coverage |

## 6. Constraints found in this environment (2026-11-15)

The session's network policy refuses every NASA/JPL/USGS/CSA host (preflight in WORKLOG). Consequences:
- No SPICE kernels, no LOLA 80 m / 20 m / 5 m products, no Horizons calls, no Moon Trek tiles from the build
  machine (end users' browsers still load Moon Trek tiles at runtime).
- Fallback (contract §9.7): reuse `reference/v1` artifacts above, plus JPL **DE421** from the PyPI package `de421`
  (Brandon Rhodes, MIT packaging of the JPL file, includes lunar librations) for dates outside 2026–2031 and for the
  Earth-station geometry, cross-checked against the SPICE DE440 oracle and the cached Horizons responses.
