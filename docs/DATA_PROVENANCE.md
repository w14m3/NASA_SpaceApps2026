# Data provenance (generated)

Generated 2026-11-15T03:51:49.149Z by `scripts/gen-docs.mjs` from the artifact manifests. Nothing here is typed by hand.

## Runtime artifacts (`web/public/data/`)

| Artifact | Source | Build | SHA-256 |
|---|---|---|---|
| ephem/sun_earth_de421_2017_2026.bin | JPL DE421 (PyPI de421 2008.1) rebuilt with LT+S and DE421 PA->ME rotation | `pipeline/scripts/build_ephemeris.py` | `dcbc952e063afc22…` |
| ephem/sun_earth_de440_2026_2031.bin | SPICE DE440 via reference/v1 build (kernels and SHA-256 in reference/v1/web/public/data/manifest.json) | `pipeline/scripts/build_ephemeris.py` | `e4bf8d58df0a66b8…` |
| ephem/moon_cirs_2017_2031.bin | DE421 apparent geocentric Moon (LT+S) rotated GCRS->CIRS with ERFA c2i06a (IAU 2006/2000A) | `pipeline/scripts/build_ephemeris.py` | `e6a31700eea11124…` |
| ephem/ut1.json | IERS finals2000A (Bulletin A) via PyPI astropy-iers-data | `pipeline/scripts/build_ephemeris.py` | — |
| dem/dem240_80S.i16d.gz | LDEM_60S_240MPP_ADJ.TIF (LOLA, NASA GSFC PGDA product 90; Barker et al. 2023, PSJ 4, 183, doi:10.3847/PSJ/acf3e1), cropped to the 80°S cap and quantised to 0.5 m by reference/v1 | `pipeline/scripts/build_dem.py` | `ea8116d572e06c43…` |
| candidates/connecting-ridge.bin.gz | 3721 candidates, computeHorizon (web/src/core/horizon.ts), 360 azimuths, s_max 300 km, refinement on, no bands; planeFit over a 720 m disk | `web/scripts/build-candidates.ts` | 1075865 B gzip |
| candidates/de-gerlache.bin.gz | 3721 candidates, computeHorizon (web/src/core/horizon.ts), 360 azimuths, s_max 300 km, refinement on, no bands; planeFit over a 720 m disk | `web/scripts/build-candidates.ts` | 1068964 B gzip |
| candidates/malapert.bin.gz | 3721 candidates, computeHorizon (web/src/core/horizon.ts), 360 azimuths, s_max 300 km, refinement on, no bands; planeFit over a 720 m disk | `web/scripts/build-candidates.ts` | 996571 B gzip |
| candidates/peak-near-shackleton.bin.gz | 3721 candidates, computeHorizon (web/src/core/horizon.ts), 360 azimuths, s_max 300 km, refinement on, no bands; planeFit over a 720 m disk | `web/scripts/build-candidates.ts` | 938287 B gzip |
| masks/*.json, sites.json, hillshade_80S.jpg | reference/v1 (LOLA 80 m + 240 m masks, researched site list with source quotes, LOLA hillshade) | `pipeline/scripts/build_sites.py` (copy) | see reference/v1 manifest |

## Upstream inputs

- JPL DE421 (Folkner, Williams & Boggs 2009): PyPI `de421` de421==2008.1, sha256 `a66faf7be328573d0028e45632ba614dd573cee88e3b6f099059149acc024df8`, fetched 2026-11-15T00:53:06+00:00 by `pipeline/scripts/fetch_de421.py`.
- SPICE kernels used by reference/v1 (DE440 piece): naif0012.tls, pck00011.tpc, moon_pa_de440_200625.bpc, moon_de440_250416.tf, de440s.bsp; hashes in `reference/v1/web/public/data/manifest.json`.
- LOLA DEM products used by reference/v1: LDEM_60S_240MPP_ADJ.TIF (`3f9663257b63…`), LDEM_80S_80MPP_ADJ.TIF (`82030dcbdd7c…`), LDEM_80S_80MPP_ADJ_ERR.TIF (`e89306914bb2…`), LDEM_80S_80MPP_ADJ_HILL.TIF (`f669073ea6bf…`).
- Validation fixtures: cached JPL Horizons responses (`reference/v1/data/raw/horizons/`, 2013 rows), v1 SPICE az/el oracle (300 rows), astropy station fixture (`pipeline/scripts/build_dsn_fixture.py`).

## Licences and credits

LOLA data: NASA GSFC PGDA, public domain, cite Barker et al. 2023 (PSJ 4, 183). SPICE kernels and DE ephemerides: NASA/JPL NAIF and JPL Solar System Dynamics. IERS data: IERS Rapid Service/Prediction Centre. LRO WAC mosaic: NASA/GSFC/Arizona State University via NASA Moon Trek (streamed, not redistributed). Code: MIT.
