# Decisions

Decisions taken without asking the owner, and deviations from the master prompt, newest last.

1. **Scope: MVP (M0–M5) plus the cheap parts of M6.** The owner gave a 48-hour deadline, so the priority order
   of the brief (truthfulness → correctness → clarity → polish → features) was applied literally. Built: 3D map,
   2D polar map, real horizon, sky plot, events, countdowns, timeline, compare, export, share URL, Trust page,
   and a panel-layout energy comparison. Not built: connectivity module (DSN windows, pointing), raster layers,
   alternatives ranking, panorama, i18n, PDF, accessibility audit.
2. **Starter pack not used.** Its path points to another user's profile and does not exist here. Horizons data
   was re-acquired through the API and the DEM came from PGDA.
3. **Name.** Working title kept in the UI. Proposed stronger name: *Sightline — Lunar Landing Site Navigator*.
   Left for the owner to choose.
4. **DEM product.** LOLA PGDA product 90 (Barker et al. 2023) at 80 m for 80°S–90°S, plus the 240 m product for
   the far field out to 60°S. The 20 m product (2.6 GB) was left out for download time.
5. **Time variable of the browser ephemeris is UTC**, not TDB. The pipeline samples SPICE at UTC instants, so the
   browser needs no leap-second table. Valid while no leap second falls inside 2026–2031 (the build asserts this
   against naif0012.tls).
6. **Earth direction at runtime = Moon-centre apparent vector − site vector** instead of a per-site SPICE call.
   Measured difference from the rigorous constant-position observer: < 3e-5° (check B2).
7. **Ray step.** The brief asks for ≤ ½ pixel. That did not converge: for a 2 m mast on a rim, the horizon is set
   by kinks of the bilinear surface a few tens of metres away, and V6 failed by 1.2°. The step is now 1 % of the
   distance in the near field, capped at ½ pixel. V6 passes at ≤ 0.02°.
8. **Uncertainty band** = re-running the mask with terrain shifted by ±1σ (LOLA `_ERR` raster) and the observer by
   ∓1σ. Outside the 80 m product ±3 m is assumed (the measured RMS difference between the 240 m and 80 m surfaces, rounded up; labelled as an assumption in the manifest). The relative error is ramped in over two pixels because neighbouring cells share most of their error; an earlier version applied the full error next to the lander and produced absurd upper horizons.
   Registration and ephemeris errors are not in the band; the ephemeris term is negligible (1e-6°).
9. **Custom sites use a 240 m DEM in the browser** (12.8 MB, loaded on first use) and only terrain south of 80°S.
   Custom sites are therefore limited to latitudes ≤ −80.5° for terrain; elsewhere the horizon is a smooth sphere
   and is labelled as such.
10. **2D polar map is a hand-written canvas renderer**, not OpenLayers/MapLibre: one static image in the DEM's own
    projection needs no map library, and it keeps the first load small.
11. **No Cesium terrain.** The globe is a sphere with imagery; relief is shown on the 2D map and in the sky plot.
    Building a quantized-mesh lunar terrain set was out of reach in the time available.
12. **Scores are documented heuristics.** Power = 100·(0.6·sunlit fraction + 0.4·(1 − longest dark ÷ half a
    synodic month)); Link is the same on Earth visibility; Combined is their geometric mean. Thresholds: Sun
    "lit" at ≥ 1 % of the disk, Earth "in view" at ≥ 50 % of the disk.
13. **Unverified coordinates are shown, flagged.** Six Bussey et al. 2010 points and two conference-abstract
    candidates could not be confirmed on a primary source; they appear with "source (unverified)".
14. **Nothing is published.** The owner chose local-only; the site is built and served on localhost.
15. **Station kernels.** The first download attempt used out-of-date filenames (404). The correct current names
    are recorded; they are optional and unused until the connectivity module exists.
