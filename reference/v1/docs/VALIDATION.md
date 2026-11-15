# Validation results

Generated 2026-11-14T18:39:52+00:00 by `pipeline/scripts/build_validation.py` from the test output recorded in `data/validation/`. Statuses are never hand-typed: a check with no recorded output is `not run`.

| ID | Test | Pass criterion | Status | Measured |
|---|---|---|---|---|
| V1 | Round trip lat/lon ↔ Cartesian ↔ DEM pixel ↔ map coordinate (5,000 points, checked against PROJ) | ≤ 1 m and ≤ 0.5 px | pass | max 1.0e-06 m, 3.1e-12 px |
| V2 | SPICE vs JPL Horizons: Sun and Earth az/el from lunar surface sites (1000 + 1000 random site/time pairs, 2026–2031) | ≤ 0.005° | pass | Sun max 6.1e-07° (RMS 3.7e-07°); Earth max 1.0e-06° (RMS 5.8e-07°) |
| V3 | Apollo 11 touchdown (1969-07-20 20:17:40 UTC): Sun elevation vs Horizons and vs the published value | ≤ 0.2° | pass | SPICE 10.704°, Horizons 10.703°, published 10.8° (planned landing Sun elevation, NASA SP-4029 Apollo by the Numbers) |
| V4 | Synthetic terrain: smooth-sphere dip at 4 heights; Gaussian ring wall vs the exact profile | ≤ 1e-4° | pass | sphere 1.0e-06°, ring 3.6e-05° |
| V5 | Azimuth wrap at north, off-pole site on the 180° meridian; rays leaving the DEM are flagged, not fatal | no seam; ≤ 1e-3° vs exact terrain | pass | seam 8.4e-06°, max error 7.4e-05° |
| V6 | Convergence on real LOLA terrain: halve azimuth spacing and ray step, double the search radius (300 → 600 km) | mask change ≤ 0.02° | pass | connecting_ridge_001 0.014°; shackleton_rim_004 0.016°; im2_athena 0.009° |
| V7 | Raster sweep algorithm vs naive ray-marching | ≤ 0.01° | not run | Raster layers are not built yet, so there is nothing to compare. |
| V8 | Rise/set event times vs brute-force 1 s scan (8 events, rugged synthetic mask, 12 days) | ≤ 5 s | pass | max 0.48 s |
| V9 | Sun-disk occlusion vs analytic circle-segment area | ≤ 1e-4 | pass | 4.9e-07 (4000 strips); production setting, 200 strips: 3.0e-05 |
| V10 | Energy integrator vs closed form (clipped sinusoid sampled like the app's time series) | ≤ 0.1 % | pass | relative error 6.1e-06 |
| V11 | Ground-station geometry (Moon elevation at DSN sites) vs Horizons | ≤ 0.05° | not run | Ground-station windows are not implemented yet. |
| V12 | Hero sites vs Quickmap screenshots | qualitative | not run | Manual comparison not done. |
| V13 | Front end: headless end-to-end flow (pick site, compare, custom site, share link, 3D globe, phone width) | pass | pass | 13 checks passed, 0 failed. axe and Lighthouse audits not run. |
| V14 | Clean clone → one command rebuilds artifacts with identical hashes | pass | not run | A rebuild script exists; hash identity on a second machine was not verified. |
| B1 | Browser ephemeris (Chebyshev, TypeScript) vs rigorous SPICE topocentric az/el (600 pairs) | ≤ 0.001° | pass | max 2.7e-05° |
| B2 | Moon-centre vector minus site vector vs SPICE constant-position observer | ≤ 0.001° | pass | max 2.7e-05° |
