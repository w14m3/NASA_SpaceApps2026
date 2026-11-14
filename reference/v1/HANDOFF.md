# Handoff notes

State on 2026-11-14: a working MVP of the Lunar Landing Site Navigator (NASA Space Apps 2026). Read this
first, then `README.md`, `docs/DECISIONS.md` and `docs/VALIDATION.md`.

**Deadline:** unconfirmed. The Space Apps site could not be read from the build machine; search snippets
suggest submissions close Sunday 15 November 2026 at 23:59 local time. Check the official page.

## Run it in two minutes (no data download needed)

The zip contains a ready-built site in `web/dist`. Serve that folder with any static server:

```bash
cd web/dist
python -m http.server 4173        # then open http://localhost:4173
```

It needs internet only for the 3D globe imagery (NASA Moon Trek tiles). Everything else is local.

## Set up for development

Requirements: Python 3.11+, Node 20+.

```bash
python -m venv .venv
.venv/Scripts/pip install -r pipeline/requirements.txt     # Linux/macOS: .venv/bin/pip
cd web && npm ci && npm run dev                            # http://localhost:5173
```

The web app runs straight away: its data files are committed in `web/public/data/`. You only need the
pipeline if you change the science, the site list or the DEM.

To rebuild the data (downloads about 830 MB of NASA files into `data/kernels` and `data/dem`, which are not in
the zip):

```bash
.venv/Scripts/python build.py all       # fetch, data, test, validate, web
```

Tests on their own: `python build.py test` (pytest + vitest). End-to-end: `npm run build`, then
`npx vite preview --port 4173` in one terminal and `npm run e2e` in another (needs
`npx playwright install chromium` once).

## What is in the zip

| Path | Content |
|---|---|
| `pipeline/` | Python science core (`lunarnav/`), artifact builders (`scripts/`), tests |
| `web/` | React + TypeScript app; `src/core/` is the science in the browser; `public/data/` holds built artifacts; `dist/` is the built site |
| `data/sites_research.json` | Researched site coordinates with source URL and quoted text per site |
| `data/validation/` | Recorded test output that feeds the Trust page |
| `data/raw/horizons/` | Cached JPL Horizons responses, so validation re-runs without the network |
| `data/sources.json` | URL, size and SHA-256 of every downloaded input |
| `docs/` | METHODS, VALIDATION (generated), RESOURCES, DECISIONS, DATA_PROVENANCE (generated), SUBMISSION drafts |
| `.git/` | Full history (two commits) |

Not included: `.venv`, `node_modules`, `data/dem`, `data/kernels`, `web/public/cesium` (copied from
`node_modules` automatically by `npm run dev` / `npm run build`).

## Where things are

- Horizon mask algorithm: `pipeline/lunarnav/horizon.py`; browser port in `web/src/core/horizon.ts`. Keep the
  two in step.
- Ephemeris: `pipeline/lunarnav/ephem.py` (SPICE), `cheby.py` (fit), `web/src/core/ephem.ts` (evaluation).
- Visibility, events: `web/src/core/visibility.ts`. Metrics, scores, energy: `web/src/core/analysis.ts`.
- App state and URL sync: `web/src/state.ts`. UI: `web/src/App.tsx`, `web/src/components/`.
- Site list: edit `data/sites_research.json`, add a short name in `SHORT` in
  `pipeline/scripts/build_site_data.py`, then `python build.py data`.

## What to do next, in priority order

1. **Publish.** Nothing is deployed. `web/dist` is fully static with a relative base path, so GitHub Pages,
   Netlify or Vercel all work. The submission needs a public URL.
2. **Submission text.** Drafts are in `docs/SUBMISSION.md` (200-word summary, demo script, slide outline).
   Record the demo video.
3. **Connectivity module** (largest gap versus the brief). Deep Space Network station windows: station
   coordinates for DSS-14/43/63 are already in `data/sites_research.json`; the Earth-orientation kernel
   `earth_1962_260806_2126_combined.bpc` is already downloaded; the station kernels are
   `earthstns_itrf93_260814.bsp` and `earth_topo_260814.tf` (optional entries in `fetch_data.py`). Then
   validation check V11 (Moon elevation at stations vs Horizons, ≤ 0.05°). After that: antenna pointing
   envelope and path-loss variation.
4. **Verify the unverified coordinates.** Eight south-pole points are flagged `unverified` (six from Bussey et
   al. 2010 read only on Wikipedia, two from a conference abstract). Mazarico et al. 2011 Table 3 is the
   proper source and was paywalled.
5. **Higher-resolution terrain for hero sites.** `LDEM_80S_20MPP_ADJ.TIF` (2.6 GB) or the 10 m 83°S product
   from the same PGDA page. At a 2 m mast much of the horizon is set by ground within three 80 m pixels, and
   the app already warns about it.
6. **Raster layers and neighbouring-site ranking** (illumination %, permanently shadowed areas, "move 5 km").
   Needs the O(N)-per-direction sweep and check V7.
7. **Accessibility and performance audits** (axe, Lighthouse), French translation, PDF report, panorama.

## Things that will bite you

- **PGDA downloads are slow and do not resume.** `fetch_data.py` restarts a file from zero after a timeout; a
  220 MB file took three attempts. Adding HTTP range resume would help.
- **Moon Trek drops connections** when hit quickly in sequence from scripts. Cesium's own tile throttling is
  fine. Only one layer was verified (`LRO_WAC_Mosaic_Global_303ppd_v02`, zoom 0–8); the API page is rendered
  by script, so the rest of the catalogue has not been read.
- **Half-pixel ray steps are not enough.** The brief asks for ≤ ½ pixel; that failed convergence by 1.2° for
  low masts. The step is 1 % of the distance near the site, capped at ½ pixel. Do not "simplify" it back.
- **The uncertainty band ramps in over two pixels.** Applying the full DEM height error right next to the
  lander gave upper horizons of 60°. The ramp is an assumption (correlated errors), documented in METHODS.
- **Browser ephemeris time is UTC**, valid only while no leap second falls inside 2026–2031. The build asserts
  this; if a leap second is announced, split the fit.
- **Validation statuses are generated, never typed.** `build_validation.py` reads `data/validation/*.json`.
  Checks V7, V11, V12, V14 and the axe/Lighthouse part of V13 are "not run".
- **Scores are heuristics** defined in `analysis.ts` and shown in the UI tooltips. The schedule-slip ranking
  uses hourly samples, so its durations are rounded to 1 h and can differ slightly from the main metrics.
- **No 3D terrain on the globe.** It is a sphere with imagery; the fallback named in the brief (custom
  three.js tile renderer) was not attempted.
- **The Cesium ion logo** shows by default although no ion service is used.
- The git commits use a placeholder author (`noreply@example.invalid`); set your own identity.
