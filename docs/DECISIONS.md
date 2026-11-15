# Decisions taken without the owner

Newest last. Each entry: decision · reason · consequence. Contract rule R10 / AGENTS rule 12.

- **D1 (2026-11-15 01:43) — Watchdog session took the lock.** No `docs/LOCK.md` existed on `main`; the session is
  the only worker. Lock heartbeat refreshed every loop iteration.
- **D2 — Network fallback (contract §9.7).** The environment's network policy refuses every NASA/JPL/USGS/CSA/ASU
  host (preflight in WORKLOG; `CONNECT tunnel failed, response 403`). Per the owner's instruction not to wait for
  approvals, the session does not block on a network-access request; it builds from `reference/v1` artifacts and PyPI.
  The owner can add the Appendix A domains (cloud environment → Network access) so a later session can fetch the
  80 m / 20 m / 5 m LOLA products and SPICE kernels.
- **D3 — Ephemeris before 2026 from JPL DE421 via PyPI.** The `de421` package (2008.1, sha256 `a66faf7b…`) contains
  the DE421 Chebyshev series including lunar librations. The pipeline rebuilds apparent (`LT+S`) Sun/Earth vectors in
  MOON_ME from it. Measured against the SPICE DE440 oracle of v1 over 2026–2031 (3,000 random instants): max
  1.6e-5° (Earth and Sun). Runtime ephemeris = DE421 piece 2017-01-01 → 2026-01-01 + SPICE DE440 piece
  2026-01-01 → 2031-01-03 (v1 artifact, unchanged). The DE421–DE440 MOON_ME offset is therefore quantified as
  ≤ 1.6e-5° in direction (≈ 0.5 m at the lunar surface).
- **D4 — PA→ME composition order fixed by the oracle.** The DE421 PA→ME angles (67.92″, 78.56″, 0.30″ about axes
  3, 2, 1) are applied as the transpose of [a1]₃[a2]₂[a3]₁ (SPICE TKFRAME semantics). The other compositions disagree
  with the DE440 oracle by 0.029–0.058°, the chosen one by 1.6e-5°; recorded by `test_pa_to_me_convention`.
- **D5 — Golden-section refinement of each horizon maximum.** After the march, the maximum is refined between the
  neighbouring steps. On the same 240 m DEM the unrefined march reproduces the v1 algorithm exactly (O2b: 0.0000°);
  refinement raises horizons by up to 0.097° at ridge kinks, toward the exact maximum of the bilinear surface (V4 cone
  error 1.4e-8° with refinement). Production uses refinement.
- **D6 — One horizon implementation (TypeScript) for the browser and the build scripts.** v1 kept a Python (numba)
  and a TypeScript port "in step" by hand. Here the candidate grids and layers are built by Node scripts that import
  `web/src/core`, so the numbers shown live and precomputed come from the same code. Python stays for the ephemeris
  (ERFA/DE421) and its tests.
- **D7 — (superseded at 11:30 by O2 on the real 80 m product, see D15) O2 proper was blocked; curated south-pole sites keep the v1 masks.** The 80 m LOLA product is unreachable
  here. O2b validates the algorithm on the same DEM; the report `O2_240m` shows the 240 m vs 80 m-based horizons
  differ by up to 3.1° at 10 m, so curated sites use the validated v1 80 m masks and every 240 m result is labelled
  "LOLA 240 m — screening resolution".
- **D8 — three.js instead of CesiumJS for the globe.** One 3D engine serves the globe, Site 3D and Street View
  (lazy-loaded, ~127 KB gzip) instead of Cesium (~1.1 MB gzip plus static assets). The globe uses the same NASA Moon
  Trek WMTS layer (LRO WAC mosaic, zoom 2) on the 1737.4 km sphere with the true Sun direction.
- **D9 — Default landing date 2026-12-11 (the "next feasible window").** A 14-day window from 2026-12-01 has no
  feasible candidate in the default region: Earth is below the horizon almost everywhere (libration in latitude).
  `web/scripts/find-window.ts` scans 2-day steps; 2026-12-11 maximises feasible candidates (747 of 3,721) in the first
  lunation. Scan recorded in `data/validation/default_window_scan.txt`.
- **D10 — Candidate masks are uint8 at 0.1° above a per-candidate offset (contract §7.11).** Values more than 25.5°
  above a candidate's lowest horizon are clipped (2 % of samples at Malapert, 0 at Peak near Shackleton); this has no
  effect on visibility because the Sun and Earth never exceed ~12° elevation at 85–90°S.
- **D11 — Gzip artifacts are accepted inflated or not.** Some servers add `Content-Encoding: gzip` to `.gz` files, so
  the browser receives inflated bytes; loaders check the gzip magic number before inflating.
- **D12 — "Lunar limb" attribution uses the eye height above the reference sphere (z₀ + h).** A night is attributed to
  the limb only when the Sun's upper limb is below −acos(R/(R + z₀ + h)); on a 5 km massif that is about −4.4°, so a
  Sun at −1° hidden by the terrain is attributed to terrain. Unit test in `web/src/core/l4.test.ts`.
- **D13 — Pages deployment needs the owner.** CI builds and uploads the site on every push to `main`, but the deploy
  step returns 404 until GitHub Pages is enabled (Settings → Pages → Source: GitHub Actions). `configure-pages` now
  asks for enablement, which only works if the workflow token is allowed to; otherwise the owner must click it once.
- **D14 (11:15) — Network opened; real oracles run.** NASA/JPL hosts became reachable. V11 now runs against JPL
  Horizons (240 cached responses in `data/raw/horizons_dsn/`, 20 instants per query because longer TLIST URLs were
  refused with HTTP 502). V11b stays as an additional independent check.
- **D15 (11:30) — O2 run on LOLA 80 m.** With `codex/fetch_nasa_data.py` + `pipeline/scripts/export_dem_raw.py`,
  `web/scripts/o2.ts` recomputes the 26 curated masks from LOLA 80 m + 240 m (60°S): max 0.0010° vs v1 (= half the v1
  0.002° quantum); with the golden-section refinement up to 0.030°. The 80 m `_ERR` raster has a median of 0.29 m.
- **D16 (12:00) — Live terrain uses LOLA 80 m windows.** 48 × 48 km LOLA 80 m windows around the four hero regions
  (`pipeline/scripts/build_dem80_windows.py`, ~390 kB each, heights at 0.25 m) sit in front of the 240 m grid in the
  worker's cascade: live horizons, plane fits (baseline = 3 pixels of the finest grid: 240 m inside a window, 720 m
  elsewhere), the map probe and Site 3D use 80 m there. The confidence grade uses the finest grid actually used.
- **D17 — IM-1 mask recomputed on LOLA 80 m (v1 defect 1).** `web/scripts/recompute-im1.ts` replaces the v1 240 m-only
  mask; near-field share 6 % at 2 m, 0 % at 10 m.
- **D18 — Moon Trek south-polar tiles integrated.** Catalogue read through the Trek services (71 south-polar layers);
  LOLA 10 m and 30 m shaded relief, LRO WAC mosaic and the LOLA PSR layer are offered on the polar map (tile matrix from
  each WMTSCapabilities.xml; CORS `*`). The LOLA 10 m relief is the default basemap above the offline hillshade.
- **D19 — Challenge Resources tab not re-checked.** www.spaceappschallenge.org fails TLS verification from this
  environment (incomplete certificate chain, as in v1); certificate checks are not bypassed.
