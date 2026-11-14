# Lunar Landing Site Navigator

NASA Space Apps Challenge 2026 — "Lunar Landing Site Navigator".

Pick a site on the Moon and a date. See the Sun and Earth against the **real terrain horizon** and get two
answers in seconds: **can the lander make power, and can it talk to Earth?** Then slip the date, raise the mast,
change the panel layout or pin a neighbouring site and compare.

## Quick start

Requirements: Python 3.11+, Node 20+, about 1 GB of disk for NASA data.

```bash
python build.py all        # download data, build artifacts, run every test, build the site
python build.py serve      # serve the built site at http://localhost:4173
```

Individual steps: `python build.py fetch | data | test | web | validate`. The built site in `web/dist` is fully
static: copy it to GitHub Pages, Netlify, Vercel or any file server. No keys, no backend.

## What it does

- **3D Moon** (CesiumJS on the lunar sphere, LRO WAC mosaic from NASA Moon Trek) lit from the real Sun direction
  at the chosen UTC, with terminator, sub-solar and sub-Earth points.
- **South-pole map** (polar stereographic, LOLA shaded relief). Click anywhere between 80.5°S and 90°S to
  analyse that spot: its horizon is computed in the browser from a 240 m DEM in well under a second.
- **Site Workbench**: Power, Link and Combined scores; "Sun sets in… / Earth rises in…" countdowns with ±
  from DEM uncertainty; sky plot with the terrain silhouette, uncertainty band and Sun/Earth at true angular
  size; metrics with a definition on every number.
- **Timeline**: Sun-visible fraction and Earth-in-view tracks for up to 4 pinned sites, 7 days to a year;
  click or drag to scrub; play/pause.
- **Schedule slip**: ±1 d, ±7 d and +1 lunar day buttons re-evaluate everything instantly.
- **Solar layout comparison**: flat, fixed vertical (N/E/S/W) and Sun-tracking vertical arrays, with the
  headline "N× the energy of a flat panel", at 2 m or 10 m mast height.
- **Compare**: side-by-side table for pinned sites with the best value flagged per column.
- **Share and export**: all state lives in the URL; CSV time series, JSON report with manifest, sky-plot PNG.
- **Methods & Trust page**: conventions, equations in words, known limits and the validation matrix, generated
  from recorded test output.

## Architecture

```
pipeline/   Python: SPICE ephemeris, horizon-mask engine (numba), tests, artifact builders
  lunarnav/   ephem.py  cheby.py  horizon.py  horizons.py (JPL Horizons cross-check client)
  scripts/    fetch_data.py  build_ephemeris.py  build_site_data.py  build_validation.py
  tests/      V1–V6 and ephemeris checks
web/        TypeScript + React + Vite. src/core is the same science in the browser, with vitest checks
  public/data/  static artifacts produced by the pipeline (ephemeris, masks, DEM, manifest, validation)
data/       downloaded NASA inputs (not committed), recorded validation output
docs/       METHODS, VALIDATION, RESOURCES, DECISIONS, DATA_PROVENANCE, submission texts
```

The browser never calls SPICE: the pipeline compresses the Sun and Earth vectors (Moon-centred, MOON_ME frame)
into Chebyshev polynomials whose error is measured against SPICE at build time.

## Trust

See `docs/VALIDATION.md` (generated) and the in-app **Methods & Trust** page. Headline numbers from this build:
SPICE agrees with JPL Horizons to about 1e-6° over 2,000 random site/time pairs; the browser ephemeris agrees
with rigorous SPICE to 3e-5°; rise/set times agree with a brute-force 1 s scan to under 1 s.

## Known limitations

- Illumination is not electrical power; Earth in view is not link closure. No link budget, no ground-station
  (DSN) windows yet.
- Terrain only between 60°S and 90°S for curated sites and 80°S–90°S for custom sites. Elsewhere the horizon is
  a smooth sphere and the app says so.
- An 80 m DEM cannot resolve relief smaller than a pixel. For a 2 m mast on a ridge most of the horizon is set
  by ground within a few pixels; the app warns when that is the case.
- No reflected light from terrain, no thermal or dust effects, no lander self-shadowing, no slope/hazard layers.
- The south-pole "points of interest" are locations from the literature, not approved landing sites. Several
  carry coordinates that could only be confirmed on Wikipedia and are flagged "unverified".
- Not built in this version: raster map layers, alternatives ranking across neighbouring sites, panorama view,
  French translation, PDF report, accessibility and Lighthouse audits.

## Credits and licence

Code: MIT. Data: LOLA south-pole DEMs — NASA GSFC PGDA (Barker et al. 2023, doi:10.3847/PSJ/acf3e1); LRO WAC
mosaic — NASA/GSFC/Arizona State University via NASA Moon Trek; kernels — NASA/JPL NAIF; cross-check —
NASA/JPL Horizons. Site coordinates carry their sources in `data/sites_research.json`.
