# Objectives — Sightline

The **Status** column is computed by `npm run objectives` (`scripts/objectives.mjs`) from the latest machine-readable
test reports in `reports/` and the validation records in `data/validation/`. Never edit it by hand.

Evidence syntax (separate several with `;`): `vt:<vitest name fragment>` · `py:<pytest name fragment>` ·
`e2e:<Playwright title fragment>` · `val:<record id>` (`data/validation/<id>.json`, status pass or documented) ·
`doc:<path>` (file exists and is non-empty) · `blocked:<reason>` (forces `blocked`).
An objective is `met` only when every reference passes; `failing` when one fails; `in progress` when some have no
result yet; `todo` without evidence.

## Challenge objectives

| ID | Objective | Acceptance | Phase | Prio | Evidence | Status |
|---|---|---|---|---|---|---|
| C1 | Curated sites + custom coordinates | ≥ 25 sourced sites; custom by click, search and form | L2 | 1 | e2e:sites catalogue; e2e:custom site by form; e2e:custom site by map click; e2e:search finds | met |
| C2 | Side-by-side comparison of 2–4 sites | overlaid sky plots, deltas, bars | L2 | 1 | e2e:compare | met |
| C3 | Dates and times across lunar days and seasons | picker, scrub, play, slip, year view | L2 | 1 | e2e:time controls | met |
| C4 | Sun and Earth relative to the horizon | sky plot + 3D directions + Street View | L2 | 1 | e2e:sky plot; e2e:street view | met |
| C5 | Time remaining before sunset and Earthset | countdown cards with ±; V8 | L2 | 1 | e2e:countdowns; val:V8 | met |
| C6 | Solar elevation prominent; sunlight duration; Earth windows | floating card + metrics | L2 | 1 | e2e:solar elevation card | met |
| C7 | Multiple visualisations | Globe, South pole, Site 3D, Street View, timeline | L4 | 2 | e2e:views | met |
| C8 | Temporal dynamics | animated lighting + timeline over a lunar day | L2 | 1 | e2e:time controls; e2e:play | met |
| C9 | Accessible to planners, educators, public | modes, tour, glossary, FR, V13 | L5 | 1 | e2e:learn mode; e2e:french; e2e:axe | met |
| C10 | Real terrain horizon, no atmosphere | V4–V7 pass, method page | L1 | 1 | val:V4; val:V5; val:V6; doc:docs/METHODS.md | in progress |
| C11 | Libration and orbital variations shown | libration loop on sky plot; method page | L2 | 2 | e2e:libration loop; vt:libration | met |
| C12 | Why small changes have large impacts | Who-blocks-the-Sun, compass, porkchop | L4 | 2 | vt:who blocks; e2e:compass | todo |
| C13 | Thermal conditions for equipment (proxy) | §7.14 in Workbench, Top 3 cards, Brief; unit tests | L3 | 2 | vt:thermal; e2e:thermal | met |
| C14 | Site-date scenario comparison and seasons | 2–4 scenarios incl. same site/different dates; season view | L3 | 2 | e2e:scenario compare; e2e:season | met |

## Product and innovation objectives

| ID | Objective | Acceptance | Phase | Prio | Evidence | Status |
|---|---|---|---|---|---|---|
| P1 | Golden path ≤ 10 s, brief ≤ 60 s | e2e timing | L3 | 1 | e2e:golden path | met |
| P2 | Moon Maps: search, layers panel, place card, measure, share | e2e | L2 | 1 | e2e:search finds; e2e:layers panel; e2e:place card; e2e:share link | met |
| P3 | ≥ 8 value-added layers with legends and probe | e2e + V7 | L4 | 2 | e2e:layers panel; val:V7 | met |
| P4 | Top 3 + crew choice + Mission Brief | V17 + e2e | L3 | 1 | val:V17; e2e:golden path | met |
| P5 | Landing safety: slope, roughness, tip-over, ellipse | V15, V16 + e2e | L3 | 1 | val:V15; val:V16; e2e:safety | met |
| P6 | Solar-efficiency optimizers + headline + survival timeline | V10 + e2e | L3 | 1 | val:V10; e2e:energy | met |
| P7 | Earth connectivity: DSN + custom stations, DTE, pointing, FSPL, interference | V11 + e2e | L3 | 1 | val:V11b; e2e:connectivity | met |
| P8 | Moon Street View | e2e | L4 | 2 | e2e:street view | met |
| P9 | Moon Directions | V20 + e2e | L4 | 3 | val:V20; e2e:directions | todo |
| P10 | Site 3D with true-Sun shadows | e2e screenshot, ≥ 30 fps | L4 | 2 | e2e:site 3d | met |
| P11 | Mission replay (2023–2025 landings) | V18, V19 | L4 | 2 | val:V19; e2e:mission replay | met |
| P12 | Resource integrations of §4.3 implemented or justified | RESOURCES.md complete | L0 | 2 | doc:docs/RESOURCES.md | todo |
| P13 | Public URL on GitHub Pages | URL returns 200, golden path passes on it | L5 | 1 | val:DEPLOY | todo |
| P14 | Trust page, TRACEABILITY, product docs, demo script, pitch, submission | files present and current | L5 | 1 | e2e:trust page; doc:docs/TRACEABILITY.md; doc:docs/PRODUCT.md; doc:docs/DEMO_SCRIPT.md; doc:docs/PITCH.md; doc:docs/SUBMISSION.md | in progress |
| P15 | Installable, offline-capable PWA | offline reload works in e2e | L5 | 2 | e2e:offline | todo |
| P16 | Science and Engineering constraint panels feeding Top 3 and Brief | e2e | L3 | 2 | e2e:constraints | met |
| P17 | "Land it!" educational game (optional) | e2e | L4 | 3 | e2e:land it | todo |

## Validation objectives (contract §10)

| ID | Objective | Acceptance | Phase | Prio | Evidence | Status |
|---|---|---|---|---|---|---|
| O1 | Browser ephemeris vs v1 SPICE az/el fixture (300 rows × 2 bodies) | ≤ 0.001° | L1 | 1 | vt:O1 | met |
| O2 | New horizon masks vs v1 masks, curated south-pole sites (2 m, 10 m) | ≤ 0.05° (report max, explain) | L1 | 1 | blocked:LOLA 80 m product unreachable (D7); fallback O2b + report val O2_240m | blocked |
| O2b | New horizon cascade vs v1 algorithm on the same 240 m DEM | ≤ 0.05° | L1 | 1 | vt:O2b | met |
| V1 | Round trip lat/lon ↔ Cartesian ↔ DEM pixel ↔ map pixel | ≤ 1 m and ≤ 0.5 px | L1 | 1 | vt:V1; val:V1 | met |
| V2 | Ephemeris vs Horizons az/el (cached responses) | ≤ 0.005° | L1 | 1 | val:V2 | met |
| V3 | Apollo 11 touchdown Sun elevation vs Horizons and a published source | ≤ 0.2° | L1 | 2 | py:test_v3_apollo11; val:V3 | met |
| V4 | Synthetic terrain: sphere dip; Gaussian ring; cone | ≤ 1e-4° | L1 | 1 | vt:V4; val:V4 | met |
| V5 | Azimuth wrap and edge-of-DEM cases | no seam; voids flagged | L1 | 1 | vt:V5; val:V5 | met |
| V6 | Convergence: halve Δα and step, double s_max | ≤ 0.02° | L1 | 1 | vt:V6; val:V6 | met |
| V7 | Candidate-grid masks vs naive march at the same azimuths | ≤ 0.01° | L3 | 2 | val:V7 | met |
| V7b | 360-azimuth sampling vs 1440-azimuth masks (sunlit time) | ≤ 2 percentage points | L3 | 2 | val:V7b | met |
| V8 | Event times vs brute-force 1 s scan | ≤ 5 s | L1 | 1 | vt:V8; val:V8 | met |
| V9 | Sun-disk occlusion vs analytic circle segment | ≤ 1e-4 | L1 | 1 | vt:V9; val:V9 | met |
| V10 | Energy integrator vs closed form and vs 1-minute reference on real terrain, 365 d | ≤ 0.1 % | L1 | 1 | vt:V10; val:V10 | met |
| V11 | Moon elevation at DSN sites vs Horizons, ≥ 200 instants | ≤ 0.05° | L1 | 1 | blocked:JPL Horizons unreachable from the build environment (D2); substitute V11b | blocked |
| V11b | Moon elevation at DSN sites vs an independent astropy/ERFA chain (substitute for V11) | ≤ 0.05° | L1 | 1 | vt:V11b; val:V11b | met |
| V12 | Hero sites vs QuickMap (documented screenshots) | qualitative | L5 | 3 | val:V12 | todo |
| V13 | Front end: e2e golden path; axe critical = 0; Lighthouse; mobile | pass | L5 | 1 | e2e:golden path; e2e:axe; e2e:mobile | met |
| V14 | Clean clone → one command rebuilds artifacts with identical hashes | pass or documented | L5 | 3 | val:V14 | todo |
| V15 | Plane fit on synthetic tilted planes and a cone | slope ≤ 0.01°, azimuth ≤ 0.1° | L3 | 1 | vt:V15; val:V15 | met |
| V16 | Tip-over analytic cases | exact to 1e-9 | L3 | 1 | vt:V16; val:V16 | met |
| V17 | Top 3: determinism, constraints, diversity | pass | L3 | 1 | vt:V17; val:V17 | met |
| V18 | Mission replay vs published accounts (cited) | documented | L4 | 2 | blocked:published end-of-mission accounts unreadable here (hosts unreachable); touchdown facts only, see docs/VALIDATION.md | blocked |
| V19 | Ephemeris 2017–2031 vs SPICE | ≤ 0.001° | L1 | 1 | py:test_pa_to_me_convention; val:V19 | met |
| V20 | Moon Directions: A* vs Dijkstra; no forbidden cell | exact cost match | L4 | 3 | vt:V20; val:V20 | todo |
