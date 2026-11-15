# MASTER PROMPT v3 — Sightline: Lunar Landing Site Navigator
## From-zero build in Claude Code on the web · NASA Space Apps Challenge 2026

Challenge: "Lunar Landing Site Navigator" (10 – CLPS) · Prompt v3.0 · 15 Nov 2026 · supersedes v1 and v2 (both kept
in `docs/challenge/` for reference).

> **How to start.** This file lives at `docs/MASTER_PROMPT_V3.md`. In Claude Code on the web, send:
> "Read docs/MASTER_PROMPT_V3.md in full and execute it. Run the work loop of §11 until every objective in
> docs/OBJECTIVES.md is met or the feature freeze is reached."

---

## 0. Operating context

### 0.1 Where you run
You run in a **cloud VM** (Claude Code on the web) on a clone of this GitHub repository. You have no access to the
owner's computer. Everything you need is in the repo or downloadable from the domains in Appendix A. Work persists
only through git commits and the files in the repo, so commit often.

### 0.2 Repository layout at start
```
docs/MASTER_PROMPT_V3.md            ← this file (the contract)
docs/challenge/challenge_page.md    ← text of the official challenge page
docs/challenge/MASTER_PROMPT_v1.pdf ← v1 prompt (history)
docs/challenge/MASTER_PROMPT_V2.md  ← v2 prompt (history)
docs/challenge/ANALYSIS_v1.md       ← external review of the reference implementation
docs/design/reference_mockup.png    ← UI layout reference (layout only, see rule R12)
reference/v1/                       ← earlier implementation, READ-ONLY (validated science core, MVP UI)
```
You build the new product at the repository root (`pipeline/`, `web/`, `docs/`, `.github/`). Never edit
`reference/`.

### 0.3 Mission in one sentence
Build, from zero, a professional, hyper-interactive web application — **a "Google Maps for the Moon"** — that lets
mission planners, educators and the public pick a site and a date near the lunar south pole and answer, in seconds and
with credible physics: **Can it land safely? Can it make power? Can it talk to Earth? Which three sites should the
crew choose from, and why?** — with a strong focus on **increasing solar-energy efficiency** and **improving
connectivity with Earth**.

### 0.4 Deadline
Submission closes **Sunday 15 November 2026, 23:59, Europe/Paris** (owner's Local Event). **Feature freeze at 19:59
Europe/Paris.** After the freeze, only bug fixes, docs, screenshots and submission material. Check the current time
with `TZ=Europe/Paris date` at the start of every loop iteration and plan against the phase time boxes of §12.

### 0.5 Owner interaction
Ask the owner only when blocked, one precise question at a time, and keep working on other objectives while waiting.
Record every decision taken without the owner in `docs/DECISIONS.md`.

### 0.6 Autonomy — no approvals, continuous loop
- **Never wait for the owner.** Run in Auto permission mode. Do not ask for confirmation; take documented defaults.
- **Push straight to `main`** (the owner's instruction): at the end of every loop iteration run
  `git pull --rebase origin main` then `git push origin HEAD:main`, so GitHub Pages redeploys without a pull request.
  If pushing to `main` is refused, push your `claude/` branch, open a pull request and merge it yourself if your tools
  allow it; otherwise keep working on the branch and report it.
- **Do not end your turn early.** While unmet objectives remain and the feature freeze has not passed, finish a phase
  and immediately start the next one in the same turn. End the turn only when (a) every objective is met, (b) the
  freeze has passed and the fix-only work is done, (c) a usage or platform limit stops you, or (d) you are blocked —
  in every case after committing, pushing and writing the resume point in `docs/WORKLOG.md`.
- **Watchdog runs.** An hourly scheduled task restarts work with the resume protocol (§11.2) if the session stopped.
  To avoid two sessions working at once, keep a lock file `docs/LOCK.md` (session start time, last heartbeat time in
  Europe/Paris, current objective). Update and push it at every loop iteration. At the start of a session: if the lock's
  heartbeat is less than 45 minutes old and was written by another session, do not modify anything — append one line
  "watchdog: active session detected" to `docs/WORKLOG.md`, push, and end. Otherwise take the lock and resume.
- **After the deadline** (23:59 Europe/Paris) or once every objective is met, a session only verifies the public URL,
  records the result, and ends; the final summary tells the owner to pause the scheduled task.

---

## 1. "From zero", defined

1. You write a **new codebase**: new architecture, new UI, new state model, new components, new pipeline structure.
   Do not copy UI code from `reference/v1/`.
2. `reference/v1/` is your **specification and test oracle**, not your source. Read all of it first (§5). Its
   validated outputs (ephemeris parity fixture, horizon masks, validation records, cached JPL Horizons responses) become
   **golden fixtures**: your new science core must reproduce them within the tolerances of §10.
3. **Correctness beats purity.** If a re-implemented science module cannot match its oracle within its time box, port
   the reference module, keep the oracle test, and log the deviation in `docs/DECISIONS.md`.
4. **Safety net first.** Within the first hour, build `reference/v1/web` and deploy it to GitHub Pages as a fallback
   public URL (§12, phase L0). Replace it with the new product as soon as the new golden path works.

---

## 2. The challenge, distilled

Read `docs/challenge/challenge_page.md` and the live page
https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/ (including its Resources tab). Re-check the Resources tab at the start of L0 and L5:
resources may be added during the event.

**Problem.** South-pole missions face extreme lighting and communication constraints. Tools that give Sun and Earth
positions at candidate sites (Quickmap, Moon Trek, JPL Horizons) exist, but their complex interfaces make rapid
scenario comparison hard for non-specialists. Missions slip: planners must quickly evaluate other dates at the same
site, or other sites in the same region.

**Objectives (all must be met).** Interactive site selection and comparison (curated list: Apollo, CLPS targets,
commercial missions, other nations; plus custom coordinates; side-by-side or sequential comparison) · date and time
flexibility across lunar days and seasons · Sun and Earth positions relative to the horizon, with time remaining before
sunset and Earthset · power and communication assessment (solar elevation angle, sunlight duration, Earth visibility
windows) · multiple visualisation approaches (2D maps, 3D surfaces, other creative views) · temporal dynamics
(animations, timelines over a lunar day or several days) · accessibility for planners, educators and the public.

**Potential considerations (treat as requirements).** Ephemerides via JPL Horizons or precomputed datasets; LOLA
topography for realistic surfaces and accurate horizons; no atmosphere (horizon = terrain + lunar limb); solar
elevation shown prominently; rapid multi-scenario comparison; clear time-remaining communication; make extreme
lunar-vs-terrestrial differences apparent; explain why small location or date changes have large impacts; real
topography; Earth libration and the Moon's orbital variations; steep slopes and deep craters at the pole; support for
science/engineering coordination; education for students and the public.

**Judging criteria** (verify on https://www.spaceappschallenge.org/resources/judging-awards-guide and
https://www.spaceappschallenge.org/resources/project-submission-guide/): **Impact, Creativity, Validity, Relevance,
Presentation.** North star: *in 10 seconds a non-expert understands; in 2 minutes an engineer trusts the numbers.*

**Physics that shapes the design.** No atmosphere, no refraction. The Moon's spin axis is tilted only ≈ 1.54° to the
ecliptic, so at the south pole the Sun stays within ≈ 1.5° (plus its ≈ 0.27° radius) of the astronomical horizon and
sweeps 360° of azimuth per synodic month (≈ 12.2°/day). Earth librates (≈ ±7.9° in longitude, ≈ ±6.7° in latitude),
so from polar sites it hovers near the horizon. A synodic day lasts ≈ 29.53 days. **Terrain decides almost everything
at the pole**: the terrain horizon computed from LOLA topography is the heart of the product.

---

## 3. Priority order and non-negotiable rules

**Priority order when goals conflict:** (1) scientific truthfulness → (2) numerical correctness → (3) interactivity and
clarity → (4) visual polish → (5) number of features.

- **R1 No fabricated data.** No invented coordinates, endpoints, constants, specifications, figures or citations.
  Every curated site, constant and default carries a source; unknown means "unverified".
- **R2 Read before use.** Fetch and read documentation before integrating a resource; log access date and findings in
  `docs/RESOURCES.md` (§4).
- **R3 Reproducible.** Pinned versions; a script for every artifact; a manifest (kernels, DEM product IDs and hashes,
  commit, build time) shown in the app and embedded in every export.
- **R4 Fixed, displayed conventions** (§7.1), visible in the UI and the docs.
- **R5 Validate before claiming.** Never write "validated" without recorded test output. Statuses on the Trust page are
  generated from test output, never typed.
- **R6 Uncertainty and assumptions in the UI**, not only in docs.
- **R7 Keep apart:** illumination vs electrical power; geometric visibility vs link closure; screening estimate vs
  certification.
- **R8 Terms of use.** No scraping of Quickmap or any site; use documented APIs and tile services only; attribute
  NASA, LRO/LOLA, LROC/ASU, Moon Trek, JPL/NAIF, USGS and CSA.
- **R9 No paid keys, no secrets in the repo.** Degrade gracefully offline and when a tile is missing (missing tile =
  "no coverage").
- **R10 Decide and record.** Ask the owner only when blocked; record decisions in `docs/DECISIONS.md`.
- **R11 No NASA insignia or wording implying NASA endorsement.** Our own logo; data credits in text.
- **R12 The mockup is a layout reference only.** Its numbers are physically wrong for the pole (e.g. a 14.2° solar
  elevation). Never display a number the core did not compute. Every visual exaggeration (vertical exaggeration,
  enlarged sky arc) carries an on-screen label "×N, for visibility".
- **R13 No invented lander specifications.** Presets are "Generic small / medium / large lander — illustrative,
  editable", each parameter labelled as an assumption; real vehicles only with a cited public source.
- **R14 Deterministic.** Seeded randomness, stable sorts: the same URL yields the same result.
- **R15 Never weaken a test to make it pass.** Tolerance changes need a `docs/DECISIONS.md` entry with justification.

---

## 4. Resources and integration protocol

### 4.1 NASA-provided resources (from the challenge) — read each one first

| Resource | URLs | Read for | Expected use |
|---|---|---|---|
| Canadian Space Agency — Moon exploration | https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/ | Canada's lunar programme (Gateway, Canadarm3, rovers, science), educational material, image credits | "Learn" cards and mission context, credited and linked; written in our own words; sites only if official coordinates exist |
| JPL Horizons | https://ssd.jpl.nasa.gov/horizons/ · API doc https://ssd-api.jpl.nasa.gov/doc/horizons.html · manual https://ssd.jpl.nasa.gov/horizons/manual.html · endpoint https://ssd.jpl.nasa.gov/api/horizons.api | Lunar-surface observer syntax (`CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='E-lon,lat,alt_km'`), quantities (az/el, presence flags), frames, limits, CORS behaviour | Independent validation of our ephemerides (V2, V3, V11); cached responses; on-demand checks from the pipeline. Browser calls only if CORS allows; otherwise none |
| NASA Moon Trek | https://trek.nasa.gov/moon/ · tile API https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon | Layer catalogue; WMTS REST template `{endpoint}/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.{png,jpg}`; equirectangular, **south-polar** and north-polar tile sets; other web services (search, elevation profile) | Basemaps for the globe and the polar map, auto-built layer list, extra overlays. Verified working layer: `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg` (zoom 0–8). The service drops connections when hit in rapid sequence: throttle |
| LROC QuickMap | https://quickmap.lroc.asu.edu/ | Layers, illumination tools, **shareable-URL scheme** | Manual validation (V12, documented screenshots); an "Open this site in QuickMap" deep link if a documented URL scheme exists. No scraping |

### 4.2 Other primary resources

| Resource | URLs | Use |
|---|---|---|
| NAIF / SPICE | https://naif.jpl.nasa.gov/naif/data.html · https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ | Primary ephemeris engine; lunar orientation; Earth orientation; DSN station positions |
| LOLA south-pole DEMs (80 m, 240 m, 20 m, error rasters) | https://pgda.gsfc.nasa.gov/products/90 · data https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/ | Terrain truth for horizons, uncertainty, hazards. The 20 m file is a Cloud-Optimized GeoTIFF: read windows over HTTP, do not download it whole |
| LOLA 5 m site DEMs + slopes (13 Artemis III candidate regions + Site 004) | https://pgda.gsfc.nasa.gov/products/78 · data https://core2.gsfc.nasa.gov/PGDA/LOLA_5mpp/ | Lander-scale hazards; near-field horizons; hero regions |
| LOLA 5 m south-pole mosaic | https://pgda.gsfc.nasa.gov/products/81 | Evaluate |
| 5 m Shape-from-Shading DEMs | https://pgda.gsfc.nasa.gov/products/104 | Evaluate (illuminated-area refinement) |
| PDS Geosciences | https://pds-geosciences.wustl.edu/ | Alternative LOLA products |
| LROC | https://www.lroc.asu.edu/ | Landing-site coordinates (citations), imagery context |
| USGS Gazetteer of Planetary Nomenclature | https://planetarynames.wr.usgs.gov/ | **Search by IAU feature name** (official names + coordinates) |
| NASA SVS | https://svs.gsfc.nasa.gov/ (e.g. 5013, Artemis III regions) | Region names, visuals for Learn mode |
| NSSDCA lunar landing sites | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html | Apollo / Luna coordinates |
| NASA Moon Base / CLPS pages | https://www.nasa.gov/moonbase-phases/ | Mission context; upcoming south-pole targets |

### 4.3 Integration protocol
For every resource: read it, follow links **one level deep** when they lead to documentation, data catalogues or APIs,
then decide **INTEGRATE / VALIDATE-AGAINST / REFERENCE / REJECT** with a one-line justification in
`docs/RESOURCES.md`. Actively look for ways to connect our product to these resources. Answer at least these
questions in RESOURCES.md:
1. Which Moon Trek layers are available in the **south-polar** tile set (imagery, LOLA hillshade/colour, slope,
   illumination, PSR products)? Can they replace our static polar basemap with zoomable tiles?
2. Does Moon Trek expose elevation-profile or search services usable from a static site (CORS)?
3. Does QuickMap have a documented URL scheme for a centre/zoom/layer deep link?
4. Does Horizons allow browser requests (CORS)? If not, keep it pipeline-only.
5. Which CSA content can enrich Learn mode (Canadarm3, Gateway, rover), and under which credit terms?
6. Can the USGS Gazetteer provide a downloadable list of named south-polar features for search?
If a resource is unreachable, say so and use a documented alternative.

---

## 5. The reference implementation (`reference/v1/`)

Read it **in full** before writing code: `HANDOFF.md`, `README.md`, `docs/*`, `pipeline/**`, `web/src/**`,
`data/sites_research.json`, `data/validation/*`. Then write `docs/REFERENCE_AUDIT.md`: architecture, algorithms, data
flow, what becomes an oracle, what is reused as data, what is rejected and why.

**Oracles and reusable data:**
- `reference/v1/web/src/core/__fixtures__/azel.json` — 300 rigorous SPICE topocentric az/el rows (Sun, Earth).
- `reference/v1/web/public/data/masks/*.json` — validated horizon masks at 2 m and 10 m (int16 base64, 0.002°).
- `reference/v1/web/public/data/ephem.bin|json`, `dem240.bin|json`, `hillshade_80S.jpg`, `sites.json`, `manifest.json`.
- `reference/v1/data/raw/horizons/*` — cached JPL Horizons responses (validation re-runs offline).
- `reference/v1/data/sites_research.json` — researched site coordinates with source URL and quote per site; DSN
  station coordinates (DSS-14, DSS-43, DSS-63).
- `reference/v1/data/validation/*` — recorded results V1–V6, V8–V10, V13, B1, B2.

**Known defects of v1 (do not reproduce):**
1. IM-1 (80.13°S) mislabelled as outside the 80 m product (`in_fine = lat <= -80.5`): test coverage, not latitude.
2. Docs say "half-pixel ray steps"; the code uses 1 % of distance capped at ½ pixel (the plain half-pixel step failed
   convergence by 1.2° for low masts — keep the 1 % rule). Docs say terrain only 80–90°S; curated sites had terrain to
   60°S.
3. At 2 m mast height the horizon is often set by ground < 500 m away (Malapert M1: 4.2° north horizon set 0.5 km
   away → 173-day night at 2 m, none at 10 m). Default mast 10 m; confidence grade (§7.6); near-field uncertainty term.
4. "N× a flat panel" headline used a strawman baseline (38×–61×).
5. All heavy computation on the main thread (≈ 2 s freeze at 365 days × 4 sites).
6. Ephemeris only 2026–2031; historical landings not viewable.
7. No DSN windows, no raster layers, no 3D terrain, no panorama, no FR, no PDF, no accessibility audit; energy
   integral 0.74 % off on real terrain over 365 days (target 0.1 %).

---

## 6. Product specification

### 6.1 Name, promise, users
- Name: **Sightline — Lunar Landing Site Navigator**, in one constant `PRODUCT_NAME` (owner may rename; note in
  `docs/PRODUCT.md` that a trademark check is needed before commercial use).
- Promise: *"Pick a region and a date. In seconds, get the three best places to land near the lunar south pole — safe
  to touch down, powered by the Sun, in contact with Earth — and see why."*
- Modes in the top bar: **Explore** (public, educators, jury; default on first visit) · **Plan** (mission planners) ·
  **Learn** (guided tour, glossary, CSA/NASA context). Same data, progressive disclosure.

### 6.2 Golden path (the demo — must be flawless)
1. The app opens on a **pre-computed default scenario** (south-pole hero region, next feasible window, generic medium
   lander, mast 10 m) and shows the Top 3 within 3 s without a click (snapshot built at build time; recomputed live
   when inputs change).
2. **Plan a landing** → 3-step wizard: region · mission window (landing date + surface duration) · lander (preset,
   mast height, panel layout, priorities). Defaults everywhere; "Find my top 3" enabled from step 1.
3. Results: cards **Option A / B / C** (left), three pins on the map, trade-off charts (right), timelines (bottom).
4. Clicking a card flies to the site and opens the **Place card** + Site Workbench.
5. **Crew choice** → Mission Brief (print page / PDF) with chosen site, two alternatives, reasons, risks, assumptions,
   uncertainty, manifest, share link.
Targets: open → defensible answer ≤ 10 s; open → full brief ≤ 60 s.

### 6.3 Moon Maps — the "Google Maps for the Moon" experience
- **Globe** (CesiumJS on `Cesium.Ellipsoid.MOON`, R = 1737.4 km): smooth pan/zoom/tilt, Moon Trek imagery, live
  lat/lon/elevation readout, graticule, scale bar, compass, terrain-exaggeration slider, time-aware lighting from the
  ephemeris (terminator, sub-solar and sub-Earth points), fly-to, play/pause/speed.
- **South-pole map** (2D, polar stereographic): zoomable tiles from the Moon Trek south-polar set if available
  (§4.3 Q1), else our own tiles/hillshade from LOLA; hover probe; click anywhere → place card.
- **Search box**: site names, IAU feature names (USGS Gazetteer), "lat, lon" coordinates; autocomplete; fly-to.
- **Layers panel** (Google-Maps-style): basemaps (Trek WAC, LOLA hillshade/colour, others found in §4.3) + computed
  layers of §6.4, each with legend, opacity, time-awareness and click-probe.
- **Place card** (click anywhere or on a pin): the four answers in plain language, key numbers with ±, confidence
  grade, actions: Pin · Compare · Street View · Directions · Open in QuickMap · Share.
- **Moon Street View**: 360° first-person panorama at the site at mast or astronaut-eye height, rendered from the DEM
  (terrain silhouettes shaded by distance), with Sun and Earth discs at true angular size and their paths; drag to look
  around; time-scrubbable.
- **Moon Directions**: least-effort traverse between two points (e.g. landing site → edge of a permanently shadowed
  region) on the hazard grid (§7.12): distance, maximum slope, elevation profile, time in sunlight along the route.
- **Measure** distance and area; **share** a URL that restores the exact view, time, layers and scenario.
- **Pins** (up to 4) for comparison; saved in the URL.

### 6.4 Value-added layers on the 3D map and the polar map (computed, toggleable, legend, probe)
1. Instantaneous lighting and shadows at the selected time (animated).
2. Mean illumination % over the analysis window.
3. Longest continuous sunlight and longest night (hours).
4. Zero-illumination cells over the window (proxy for permanently shadowed regions; state the window and resolution).
5. Earth visibility % and **direct-to-Earth %** (Earth visible AND a ground station sees the Moon).
6. Landing hazard: slope at stated baseline, roughness, safe-area fraction.
7. **Viability index** (transparent formula, §7.11).
8. Mast-height gain (extra sunlight at +10 m vs 2 m).
9. Sun and Earth direction rays at pinned sites; "who blocks the Sun" rays to the blocking ridge.
10. Landing-ellipse risk cloud; Top-3 pins; Directions route.
11. Selected external Moon Trek overlays where available (credited).

### 6.5 Layout (from `docs/design/reference_mockup.png` — layout only)
Desktop ≥ 1280 px: three columns + bottom dock. Mobile: map full screen, panels as bottom sheets.
- **Top bar**: our logo + `PRODUCT_NAME` · Explore / Plan / Learn · **Plan a landing** (primary) · Compare · EN/FR ·
  Methods & Trust · settings.
- **Left panel "Sites & comparison"**: search; notable sites grouped (South-pole targets, CLPS, Apollo, Other nations,
  Custom) with radio selection and chips; custom-coordinates form with validation and "Apply"; **Top 3 cards**;
  **Overlays** toggles (Topography, Lighting, Mean illumination, Earth link, Landing hazard, Shadowed cells, DSN, Rays).
- **Centre stage**: views **Globe · South pole · Site 3D · Street View**. Floating cards: **Solar elevation** (big
  number above the terrain horizon, trend ↑/↓, "sets in …"); **Direct-to-Earth window** ("active, ends in …" / "next in
  …"); pinned site label.
- **Right panel**: Mission time (UTC, editable) · **Current conditions** chips "☀ Sunlight · ● Earth link · ⛰ Safe
  ground" (icon + text + colour) · countdown cards · **Site trade-off** for A/B/C (bars: sunlight h, DTE h, longest
  night, tilt margin; small radar) · **Horizon profile** = sky plot (azimuth × elevation, terrain silhouette with
  uncertainty band, Sun and Earth discs at true size, trails, libration loop). Do not reproduce the mockup's
  elevation-in-metres-versus-time chart: it mixes units.
- **Bottom dock "Timeline & controls"**: date-range brush, time scrubber, play/pause, speed, slip −7/−1/+1/+7 d and
  +1 lunar day, draggable mission bar, stacked tracks per pinned site (Sun fraction, Earth in view, each DSN complex,
  DTE, "both"), eclipses highlighted, zoom from hours to a year.

### 6.6 Site 3D view
three.js scene of the hero region (≥ 15 × 15 km) from the best DEM (5 m resampled to a mesh with levels of detail),
vertical exaggeration slider (×1 default, labelled otherwise), lit by the true Sun direction with real-time shadow
maps, Sun and Earth on a sky dome in true directions, Sun path for the next lunar day, the lander at true scale on its
footprint plane with its tilt, Top-3 pins, ellipse cloud, rays, route. Lazy-loaded; ≥ 30 fps on a mid-range laptop;
fallback Cesium `CustomHeightmapTerrainProvider` fed by the 240 m DEM.

### 6.7 Site Workbench
Verdict sentence covering the four questions · Power, Link, Safety and Combined scores with confidence grade ·
countdowns (Sun sets/rises in…, Earth sets/rises in…, DTE window ends/starts in…) with ± · sky plot · metrics table
with a definition tooltip on every number · energy and connectivity panels (§6.8, §6.9) · safety gauge (§6.10) ·
what-if date slip · exports.

### 6.8 Solar-energy efficiency (focus area)
- Configurable lander: mast height 0–30 m (continuous); array presets: flat horizontal; fixed vertical facets facing
  N/E/S/W; vertical with azimuth tracking; tilt-adjustable; two-axis tracking; tower-mounted; panel area, cell
  efficiency, system losses, optional temperature coefficient (assumption); electrical load; battery (capacity, depth
  of discharge, round-trip efficiency, specific energy). Every default labelled with its source or as an assumption.
- Lander attitude: tilt (default = footprint slope; slider 0–90°) and heading rotate the panel normals (demo story:
  IM-1 and IM-2 both ended on their side).
- Outputs: irradiance and power time series; energy per lunar day (Wh); capacity factor; longest continuous darkness;
  minimum storage for that darkness; parametric battery mass; **survival timeline** (hourly state of charge → "survives"
  or "battery empty at T").
- **Optimizers**: (a) mast-height gain curve; (b) panel azimuth and facet layout; (c) objective switch: maximise total
  energy or maximise worst-window energy (resilience); (d) best landing date for energy inside the mission window.
- **Headline**: "Optimised layout delivers +X % energy and shortens the worst blackout by Y h versus baseline".
  Primary baseline: best fixed vertical panel at 2 m. Secondary (educational): flat panel at ground level.

### 6.9 Earth connectivity (focus area)
- Earth visibility behind real terrain: disk fraction above the mask and minimum-elevation margin.
- Ground stations: DSN complexes Goldstone (DSS-14), Canberra (DSS-43), Madrid (DSS-63) by default, plus
  **user-defined stations** (lat, lon, altitude); configurable minimum station elevation (default 10°, labelled
  assumption).
- **Direct-to-Earth window** = Earth visible at the lander AND ≥ 1 station sees the Moon above its minimum elevation.
- **Antenna-pointing optimizer**: Earth-direction envelope over the window (libration), fraction of time inside a given
  beamwidth, best fixed boresight, required gimbal range; mast height for Earth visibility (the antenna also benefits
  from height).
- Range, one-way light time, free-space path-loss variation per band (S ≈ 2.2 GHz, X ≈ 8.4 GHz, Ka ≈ 32 GHz, nominal
  and labelled); Sun–Earth angular-separation flag (solar interference; editable threshold).
- Always labelled: geometric feasibility, not link closure, unless the user supplies a link budget (optional form:
  transmit power, antenna gains, system noise temperature, data rate → Eb/N0 margin, all user inputs).
- Stretch: relay-satellite coverage from a user-supplied orbit, labelled notional.

### 6.10 Landing safety
Footprint slope, roughness, safe-area fraction, tip-over margin and critical lateral velocity, landing-ellipse Monte
Carlo (§7.10). Display: safety gauge, plain sentence ("On this ground, this lander tips over if it touches down faster
than X m/s sideways."), hazard layer, ellipse cloud. Always labelled "screening estimate at <baseline> m".

### 6.11 Top 3 recommendation engine and crew choice
As specified in §7.11. Three diverse options labelled by strength ("Safest", "Most sunlight", "Best Earth link",
"Best balance"), each with three generated reasons, main risk, confidence grade and best landing date in the window;
Pareto view; one-click constraint relaxation when nothing passes; "Choose this site" → Mission Brief.

### 6.12 Compare and alternatives
Side-by-side 2–4 scenarios: overlaid sky plots, stacked timelines, metric deltas, radar/bar summary. Schedule slip:
±N days or lunar days; **lunar porkchop plot** (landing date over 6–12 months × mission duration → combined score);
neighbours: **illumination compass** (8 neighbours at 100–500 m with gain arrows, "snap to best within r"); every
ranking carries a plain-language "why".

### 6.13 Education, accessibility, languages
Explore/Plan/Learn modes; 5-step guided tour ("Why is the south pole so hard?": the Sun skims the horizon; terrain
decides; Earth wobbles; landing needs flat ground; three options for the crew); glossary; Earth-vs-Moon fun facts
computed by the core (e.g. shadow of a 2 m mast with the Sun at 1.5° ≈ 76 m). English default plus French. WCAG 2.2 AA,
fully keyboard-operable, reduced motion, colour-blind safe (never colour alone), responsive down to 390 px.

### 6.14 Share and export
Compact URL state (view, time, layers, pins, scenario); CSV/JSON; PNG; **Mission Brief** PDF (print page acceptable)
with methods, assumptions, uncertainties and manifest; permanent **Methods & Trust** page (validation matrix,
conventions, equations, limits, data credits, traceability).

### 6.15 Challenge-driven additions (from a line-by-line reading of the challenge text)
1. **Thermal conditions** — the challenge states that the Sun's position drives "power availability for solar arrays
   and thermal conditions for equipment". Add the thermal proxy of §7.14 to the Workbench, the Top 3 cards and the
   Mission Brief.
2. **Site-date scenarios** — the challenge compares "site-date combinations". A scenario = site + landing date / window
   + lander configuration; the compare view accepts 2–4 scenarios that may share a site and differ only in date (and
   vice versa), with deltas between them.
3. **Seasons** — conditions change "across different lunar days and seasons". Add a season view: for the selected site,
   a 12-month heatmap (lunar day × day of lunation, or day of year × hour) of Sun visibility and Earth/DTE visibility,
   with the best and worst lunar days highlighted.
4. **Science–engineering coordination** — two constraint panels feed the Top 3 engine: Science (e.g. distance to
   zero-illumination cells, region of interest) and Engineering (slope, tilt margin, sunlit %, longest night, DTE %).
   The Mission Brief records both sets of constraints so both teams sign off on the same scenario.
5. **Educational game (optional)** — the challenge lists "an educational game" among possible formats. In Learn mode,
   "Land it!": the player picks a spot and a date near the pole; the core scores power, link and safety, then reveals the
   Top 3 and explains the difference. Same core, no new physics.
6. **Mobile app** — make the site an installable Progressive Web App (manifest + service worker caching the app shell
   and artifacts) so it works offline in a classroom or a control room, responsive down to 390 px.
7. **Resources tab** — re-check the challenge's Resources tab at the start of L0 and L5; integrate any resource added
   during the event through the protocol of §4.3.

---

## 7. Physics and algorithms (exact definitions)

### 7.1 Conventions (shown in the UI and docs)
UTC for input and display; TDB (ET) inside SPICE via the leap-second kernel. Lunar body-fixed frame **MOON_ME**
(Mean Earth/Polar Axis, DE440 realisation via `moon_de440_250416.tf` + `moon_pa_de440_200625.bpc`). LOLA products use
MOON_ME of DE421: quantify the DE421–DE440 offset and document it. East-positive longitude, planetocentric latitude.
Reference sphere R = 1737.4 km; heights relative to it. Azimuth clockwise from local north; elevation above the local
horizontal. km and degrees in the UI, radians internally. Instrument height above terrain stated everywhere.

### 7.2 Constants (cite each in `docs/METHODS.md`)
| Symbol | Value | Source |
|---|---|---|
| R☾ | 1737.4 km | LOLA reference sphere (product metadata) |
| R☉ | 695,700 km | IAU 2015 Resolution B3 (nominal solar radius) |
| R⊕ | 6378.1366 km (equatorial; flattening ignored, documented) | IERS Conventions 2010 |
| au | 149,597,870.7 km | IAU 2012 Resolution B2 |
| S₀ | 1360.8 W/m² (or 1361 W/m², IAU 2015 B3 — choose one, cite) | Kopp & Lean 2011 |
| g☾ | 1.62 m/s² | NASA lunar fact sheet |
| c | 299,792.458 km/s | SI definition |
| Synodic month | 29.530589 d | cite |

### 7.3 Ephemerides (dual source)
- **Primary**: SPICE (spiceypy) with current NAIF kernels; Sun and Earth vectors in MOON_ME with `LT+S` correction
  (document the choice).
- **Cross-check**: JPL Horizons at ≥ 1,000 random (site, time) pairs plus the cached v1 responses; report max and RMS
  differences and explain residuals.
- **Runtime**: Chebyshev segments of the Moon-centred body-fixed Sun and Earth vectors, **2017-01-01 → 2031-01-03**
  (no leap second since 2017-01-01, so the browser can use UTC milliseconds directly; the build asserts that TAI−UTC is
  constant over the span). Measured error bound < 0.001° as seen from the surface (v1 reached ≈ 3e-9°). Lazy-load per
  year if the file exceeds 1 MB.
- **Moon seen from Earth stations**: a second Chebyshev set of the Moon's apparent position in the Earth-fixed frame
  ITRF93 (SPICE with `earth_1962_260806_2126_combined.bpc` or its current version; segment length short enough for
  Earth rotation, error < 0.005°), so the browser computes the topocentric Moon elevation for any station (DSN or
  user-defined) from its ITRF coordinates.

### 7.4 Topocentric geometry
Site vector r_s = (R + z₀ + h)·û(lat, lon). For Earth use the vector **from the site** (parallax up to R/d ≈ 0.26°);
the Sun uses the same formula. Local frame: up = û, east = (−sin λ, cos λ, 0), north = up × east. For direction d̂:
elevation = asin(d̂·up), azimuth = atan2(d̂·east, d̂·north). Panels use their own normal; slope-aware variants use the
DEM surface normal.

### 7.5 Horizon mask (multi-resolution cascade)
For azimuth α, march along the great circle from the site: central angle θ = s/R, terrain radius ρ(s) = R + z(s),
observer radius ρ₀ = R + z₀ + h:

  ε(s) = atan2(ρ(s)·cos θ − ρ₀, ρ(s)·sin θ)  and  mask(α) = max ε(s) for s ≤ s_max

Lunar curvature is included automatically (flat terrain gives the dip −acos(R/ρ₀)). Requirements: grid cascade 5 m →
20 m → 80 m → 240 m (finest valid grid at each step); bilinear interpolation; radial step = 1 % of the distance in the
near field, capped at ½ pixel of the active grid; Δα ≤ 0.25° for curated sites; s_max = 300 km; correct
polar-stereographic handling (k = 2R cos φ / (1 − sin φ), x = k sin λ, y = k cos λ); data-void flags; store the
distance of the horizon-defining point per azimuth. **Convergence is mandatory**: < 0.02° change when Δα and the step
are halved and s_max is doubled.

### 7.6 Uncertainty and confidence
- Lower/upper masks from terrain shifted by ∓/± δ(s), δ(s) = sqrt(δ_corr(s)² + δ_rough²): δ_corr = (σ_terrain +
  σ_site)·min(1, s / 2 px) from the LOLA error raster (correlated error); δ_rough = RMS residual of a plane fit within
  3 pixels (sub-pixel relief), so the band never collapses next to the observer.
- `near_share(h)` = fraction of azimuths whose horizon is set closer than 3 pixels of the grid that sets it.
- Confidence grade per site and height: **A** (near_share < 10 % and a 5 m DEM), **B** (< 25 %), **C** otherwise;
  shown next to every score and ranking.
- Every event time carries ± from the lo/hi masks; ephemeris error documented (negligible).

### 7.7 Disk visibility and events
- Visible fraction of a uniform disk (angular radius asin(R_body/d)) above the mask by 2-D quadrature (≥ 200 strips;
  azimuth offsets divided by cos el). Optional limb darkening (document the law; default uniform).
- Thresholds (editable): Sun "lit" at ≥ 1 % of the disk; Earth "in view" at ≥ 50 % of the disk or centre above mask
  + margin. Report centre and limb criteria.
- Events: margin g(t) = visible fraction − threshold; coarse scan ≤ 10 min (≤ 30 min for windows > 120 days); Brent or
  bisection to ≤ 1 s; explicit grazing detection (local minima of |g|); azimuth wrap 359° → 0°.

### 7.8 Power model
S(t) = S₀·(1 au / d☉)². Plane-of-array incident power P_inc = S·f☉·max(0, n̂·ŝ), with f☉ evaluated at the panel's own
height. Electrical P_el = η·A·P_inc·(1 − losses) (optional temperature coefficient, labelled). Energy E = ∫P_el dt with
adaptive refinement (step ≤ 1 min within ±30 min of each event) so the integral is within 0.1 % of a 1-minute
reference on real terrain. Capacity factor CF = E / (η·A·S₀·T). Storage for the longest dark interval E_batt =
P_load·T_dark / (DoD·η_batt); mass = E_batt / specific energy (user-set; default a cited assumption). Disclosed, not
modelled: secondary illumination from sunlit terrain, thermal effects, dust, lander self-shadowing.

### 7.9 Connectivity model
Earth az/el from the site; visible per §7.7. Station topocentric Moon elevation from §7.3 (ITRF93) and the station's
ITRF position; visible when ≥ minimum elevation. DTE(t) = EarthVisible ∧ ∃ station. Range d(t) from the ephemeris;
one-way light time d/c; FSPL = 20·log₁₀(4π·d·f/c) (≈ 1.1 dB variation between perigee and apogee). Pointing envelope =
minimum enclosing cone of Earth directions over the window; P(β) = fraction of time within half-angle β; gimbal range =
envelope extent. Sun–Earth separation below the threshold raises an interference flag.

### 7.10 Landing surface and tip-over (screening model)
DEM priority: 5 m (product 78) → 20 m → 80 m; always display the slope baseline (≈ the plane-fit window).
- **Footprint slope**: least-squares plane through DEM heights inside a disk of diameter D_fp → slope σ, downhill
  azimuth. **Roughness** = RMS residual; **max step** = max |residual|.
- **Safe-area fraction** inside the landing circle (radius r_site, default 100 m): share of pixels with slope < S_max
  (default 8°, a literature example from Barker et al. 2021, Planet. Space Sci. 203, 105119; editable).
- **Tip-over** (rigid body, first order): n legs; pad-circle radius R_p; centre-of-gravity height h above the pad plane;
  radius of gyration k about the centre of gravity (assumption); g = g☾.
  - worst-case pivot distance r = R_p·cos(π/n); static tip angle θ_tip = atan(r/h)
  - effective tilt τ = σ + δ_σ + attitude dispersion (δ_σ = DEM slope uncertainty: product value if provided, else the
    published 1.5–2.5° typical RMS for LOLA 5 m DEMs, labelled)
  - static margin M = θ_tip − τ
  - critical lateral touchdown velocity (angular momentum about the downhill pad conserved at impact; tip-over when the
    rotational energy exceeds the potential barrier): L = sqrt(r² + h²), **v_crit = sqrt(2·g·L·(1 − cos M)·(L² + k²)) / h**
  - verdict: green if M ≥ M_min and v_crit ≥ v_design; amber if M ≥ 0; red otherwise
  - disclosed: ignores leg stroke and crush cores, plume–surface interaction, soil failure, rocks smaller than the pixel.
- **Landing-ellipse Monte Carlo**: semi-axes a, b and orientation (preset, editable); N = 500 seeded samples → P(safe)
  = share with M ≥ M_min and σ ≤ S_max; P10/P50/P90 of σ, M, v_crit, sunlit %, longest night, DTE %.

### 7.11 Candidate grid, layers and the Top 3 engine
1. **Candidate grid** per hero region: every 250 m (≈ 3,600 points per 15 × 15 km region). The pipeline precomputes
   per candidate: position, z₀, hazard stats per preset footprint, horizon masks at 360 azimuths (uint8, 0.1° step +
   offset) for h = 2 m and 10 m, near_share, height uncertainty. Budget ≤ 3 MB per region per height (gzip). numba +
   multiprocessing; if too slow, split near field (full resolution, ≤ 20 km) and far field (2 km sub-grid,
   interpolated) and validate (V7b). The same grid feeds the layers of §6.4.
2. **Hard constraints** (editable, defaults labelled): footprint slope ≤ S_max; safe-area fraction ≥ f_min; M ≥ M_min;
   not a zero-illumination cell; sunlit ≥ x %; longest night ≤ y h; DTE ≥ z %. Confidence grade is a soft constraint.
3. **Fast scoring** in a Web Worker, hourly samples over the window; refine the best 20 with full 720–1440-azimuth
   masks on the DEM cascade and exact disk fractions and events.
4. **Scores 0–100** with published formulas: Safety (M, v_crit, safe-area fraction); Power (sunlit fraction and
   longest night, or energy-based — document); Link (DTE fraction and longest DTE gap); Robustness (score change under a
   ±3-day slip and under lo/hi masks); optional Science (distance to the nearest zero-illumination cell).
   **Combined / Viability index** = weighted geometric mean (a zero anywhere sinks the site). Persona presets: "Crew
   safety first", "Long-duration power", "Balanced" (default), "Science near ice".
5. **Select three diverse options**: greedy by combined score with minimum separation d_min (default 1 km).
6. **Explain**: three bullets per option from its largest advantages versus the feasible-set median and versus the
   other two options; plus main risk and confidence grade. All numbers from the core.

### 7.12 Moon Directions (traverse)
A* on the hazard grid (5 m or 20 m windows, else 80 m): cost per step = length × (1 + (slope / S_ref)²); cells above
S_trav_max (default 20°, literature example for astronaut traverses, editable, cited) forbidden; output distance,
maximum and mean slope, elevation profile, sunlit fraction along the route at the chosen time, walking time at an
assumed speed (labelled).

### 7.13 Who blocks the Sun?
Using the stored horizon distance per azimuth: draw the ray from the site to the blocking terrain, and attribute every
dark interval ("Night of 40 h from 3 Dec 04:10 UTC, caused by the ridge 12.4 km away at azimuth 135°").

### 7.14 Thermal proxy (screening, labelled)
- **Cold-soak duration** = longest continuous darkness at the instrument height (already computed, with ±).
- **Survival-heater energy** E_heat = P_heater · T_dark (P_heater a user input, labelled assumption).
- **Radiative-equilibrium temperature** of an isolated plate facing the Sun while lit:
  T_eq = [α · S · f☉ · cos i / (ε · σ)]^(1/4), with σ = 5.670374419 × 10⁻⁸ W m⁻² K⁻⁴ (SI defined constant) and
  absorptivity α, emissivity ε as labelled assumptions. In shadow, display "radiating to deep space — heaters
  required", never an invented night temperature. Disclose: no conduction, no terrain infrared, no internal
  dissipation.

---

## 8. Architecture

- **Front end**: TypeScript, Vite, React; CesiumJS (lazy); three.js (lazy, Site 3D and Street View); canvas or one
  small chart library; Web Workers for every heavy computation behind a typed message API; a light store with URL
  sync; i18n dictionary (EN/FR); `core/` (science) is framework-free and fully unit-tested.
- **Pipeline**: Python 3.11+ (spiceypy, numpy, rasterio, pyproj, numba, scipy) producing static artifacts: Chebyshev
  ephemerides (Sun/Earth in MOON_ME, Moon in ITRF93), horizon masks for curated sites, candidate grids per hero region,
  hazard rasters, layer tiles, DEM windows for 3D, default scenario snapshot, manifests. Small artifacts are committed
  (each < 25 MB; never commit raw DEMs or kernels).
- **Deployment**: fully static on **GitHub Pages** via a GitHub Actions workflow triggered on `main`; the workflow
  builds the web app only (no NASA downloads in CI). Relative base path. Graceful degradation offline.
- **Budgets**: first meaningful render < 3 s on broadband; interaction < 100 ms; sky-plot redraw on scrub ≤ 16 ms; Top 3
  recompute < 5 s with a progress indicator; initial JS < 1.5 MB gzipped excluding lazy Cesium/three.js; ≥ 30 fps in 3D.
- **Quality gates**: pytest, vitest, Playwright e2e (golden path + objectives), axe (critical = 0), Lighthouse
  (performance ≥ 85, accessibility ≥ 95) when tooling is available, lint and typecheck clean. One command
  `npm run verify` (root) runs them all; CI runs it on every push.

Suggested layout:
```
pipeline/  lunarnav/ (ephem, cheby, horizon, hazards, candidates, dsn, layers) · scripts/ · tests/
web/       src/core/ · src/workers/ · src/state/ · src/ui/ (maps, panels, charts, workbench, brief, learn) · e2e/
docs/      METHODS · VALIDATION (generated) · TRACEABILITY · OBJECTIVES · WORKLOG · RESOURCES · DECISIONS ·
           DATA_PROVENANCE (generated) · REFERENCE_AUDIT · PRODUCT · SUBMISSION · DEMO_SCRIPT · PITCH
```

---

## 9. Data pipeline
1. **Preflight**: check reachability of every Appendix A domain (`curl -sI`), free disk space and tool versions;
   write the results to `docs/WORKLOG.md`; tell the owner which domains are blocked.
2. Fetch NAIF kernels (≈ 50–80 MB) and LOLA products (80 m, `_ERR`, 240 m ≈ 0.7 GB) with HTTP range resume and
   SHA-256 in `data/sources.json`; 20 m and 5 m via windowed COG reads (record URLs and bytes read).
3. Build ephemerides (§7.3) and parity fixtures.
4. Curated sites from `reference/v1/data/sites_research.json` plus new sourced entries (Chang'e-7 — Shackleton rim,
   launch reported delayed to 2027; Griffin-1 — Mons Mouton / Nobile region; Blue Moon MK1 and VIPER — south pole, verify;
   Artemis III candidate regions as outlines from product 78). Verified/unverified status per entry.
5. Horizon masks for curated sites (heights {1, 2, 5, 10, 20, 30} m), hero-region DEM windows, hazard rasters,
   candidate grids, layer rasters/tiles, default scenario snapshot.
6. Manifest and `docs/DATA_PROVENANCE.md` regenerated automatically.
7. **Fallback**: if NASA downloads are blocked, build what is possible from `reference/v1/web/public/data/` (ephemeris
   2026–2031, curated masks, 240 m DEM) and label reduced capabilities in the UI.

---

## 10. Validation matrix (publish everything in `docs/VALIDATION.md` and on the Trust page)

| ID | Test | Pass criterion |
|---|---|---|
| O1 | **Oracle**: new browser ephemeris vs `reference/v1` azel fixture (300 rows × 2 bodies) | ≤ 0.001° |
| O2 | **Oracle**: new horizon masks vs `reference/v1` masks for all curated south-pole sites (2 m, 10 m) | ≤ 0.05° (report max, explain differences from the new cascade) |
| V1 | Round trip lat/lon ↔ Cartesian ↔ DEM pixel ↔ map pixel (vs PROJ) | ≤ 1 m and ≤ 0.5 px |
| V2 | SPICE vs Horizons az/el, ≥ 1,000 random pairs + cached responses | ≤ 0.005° (report max/RMS) |
| V3 | Apollo 11 touchdown Sun elevation vs Horizons and a published mission source | ≤ 0.2° |
| V4 | Synthetic terrain: smooth-sphere dip; Gaussian ring; cone | ≤ 1e-4° |
| V5 | Azimuth wrap and edge-of-DEM cases | no seam; voids flagged |
| V6 | Convergence: halve Δα and step, double s_max | ≤ 0.02° |
| V7 | Candidate-grid/raster masks vs naive march at the same azimuths | ≤ 0.01° |
| V7b | Near/far split and 360-azimuth sampling vs full 1440-azimuth masks (sunlit time, 200 candidates) | ≤ 2 percentage points |
| V8 | Event times vs brute-force 1 s scan | ≤ 5 s |
| V9 | Sun-disk occlusion vs analytic circle segment | ≤ 1e-4 |
| V10 | Energy integrator vs closed form AND vs 1-minute reference on real terrain over 365 days | ≤ 0.1 % |
| V11 | Moon elevation at DSN sites (ITRF93 Chebyshev) vs Horizons, ≥ 200 instants | ≤ 0.05° |
| V12 | Hero sites vs QuickMap (documented screenshots) | qualitative agreement, differences explained |
| V13 | Front end: e2e golden path and objectives; axe critical = 0; Lighthouse perf ≥ 85, a11y ≥ 95; mobile | pass |
| V14 | Clean clone → one command rebuilds artifacts with identical hashes | pass or documented |
| V15 | Plane fit on synthetic tilted planes and a cone | slope ≤ 0.01°, azimuth ≤ 0.1° |
| V16 | Tip-over analytic cases (M = 0 → v_crit = 0; flat ground; symmetry; units) | exact to 1e-9 |
| V17 | Top 3: determinism, constraint satisfaction, diversity (≥ d_min) | pass |
| V18 | Mission replay: Chandrayaan-3 (2023-08-23), IM-1 (2024-02-22), IM-2 (2025-03-06) predicted conditions vs published accounts (cited) | documented |
| V19 | Ephemeris 2017–2031 vs SPICE | ≤ 0.001° |
| V20 | Moon Directions: A* vs brute-force Dijkstra on small grids; no forbidden cell on the route | exact cost match |

---

## 11. Objectives and the work loop

### 11.1 `docs/OBJECTIVES.md` (create in L0, keep current)
One row per objective: ID · description · acceptance criterion (automated where possible) · phase · priority · status
(`todo`, `in progress`, `met`, `blocked`) · evidence (test name, screenshot path, URL). Seed it with:

**Challenge objectives**
| ID | Objective | Acceptance |
|---|---|---|
| C1 | Curated sites (Apollo, CLPS, commercial, other nations, upcoming south-pole targets) + custom coordinates | ≥ 25 sourced sites; custom by click, search and form; e2e |
| C2 | Side-by-side comparison of 2–4 sites | overlaid sky plots, deltas, bars; e2e |
| C3 | Dates and times across lunar days and seasons | picker, scrub, play, slip, year view; e2e |
| C4 | Sun and Earth relative to the horizon | sky plot + 3D directions + Street View |
| C5 | Time remaining before sunset and Earthset | countdown cards with ± ; V8 |
| C6 | Solar elevation prominent; sunlight duration; Earth visibility windows | floating card + metrics; e2e |
| C7 | Multiple visualisations | Globe, South pole, Site 3D, Street View, timeline |
| C8 | Temporal dynamics | animated lighting + timeline over a lunar day |
| C9 | Accessible to planners, educators, public | modes, tour, glossary, FR, V13 |
| C10 | Real terrain horizon, no atmosphere | V4–V7 pass, method page |
| C11 | Libration and orbital variations accounted for and shown | libration loop on sky plot; method page |
| C12 | Why small changes have large impacts | Who-blocks-the-Sun, compass, porkchop |
| C13 | Thermal conditions for equipment (proxy) | §7.14 shown in Workbench, Top 3 cards, Brief; unit tests |
| C14 | Site-date scenario comparison and seasons | compare 2–4 scenarios incl. same site/different dates; season view; e2e |

**Product and innovation objectives**
| ID | Objective | Acceptance |
|---|---|---|
| P1 | Golden path ≤ 10 s, brief ≤ 60 s | e2e timing |
| P2 | Moon Maps: search (names, IAU features, coordinates), layers panel, place card, measure, share | e2e |
| P3 | ≥ 8 value-added layers (§6.4) with legends and probe | e2e + V7 |
| P4 | Top 3 + crew choice + Mission Brief | V17 + e2e |
| P5 | Landing safety: slope, roughness, tip-over, ellipse | V15, V16 + e2e |
| P6 | Solar-efficiency optimizers + headline vs baseline + survival timeline | V10 + e2e |
| P7 | Earth connectivity: DSN + custom stations, DTE windows, pointing optimizer, FSPL, interference flag | V11 + e2e |
| P8 | Moon Street View | e2e |
| P9 | Moon Directions | V20 + e2e |
| P10 | Site 3D with true-Sun shadows | e2e screenshot, ≥ 30 fps |
| P11 | Mission replay (2023–2025 landings) | V18, V19 |
| P12 | Resource integrations of §4.3 implemented or justified | RESOURCES.md complete |
| P13 | Public URL on GitHub Pages | URL returns 200, golden path passes on it |
| P14 | Trust page, TRACEABILITY, product docs, demo script, pitch, submission text | files present and current |
| P15 | Installable, offline-capable PWA (mobile) | Lighthouse PWA checks; offline reload works in e2e |
| P16 | Science and Engineering constraint panels feeding the Top 3 and the Brief | e2e |
| P17 | "Land it!" educational game (optional, first item of the cut list) | e2e |

**Validation objectives**: every row of §10 (`met` = recorded pass; V12 and V18 = documented).

### 11.2 The loop — run until every objective is met
```
LOOP
  1. Check time (TZ=Europe/Paris). Re-read docs/OBJECTIVES.md (and this prompt at each phase start).
  2. Pick the highest-priority objective not `met` in the current phase (or the next phase if done).
  3. Write a 3–6 line plan in docs/WORKLOG.md.
  4. Implement the smallest complete increment. Physics: failing test first, then code.
  5. Run `npm run verify` (lint, typecheck, unit, offline pipeline tests, build, e2e).
  6. Self-review against the Definition of Done (§11.3) and rules R1–R15.
  7. Update OBJECTIVES (status + evidence), TRACEABILITY, VALIDATION records.
  8. Commit, referencing objective IDs.
  9. At phase end or time-box end: push to `main` (§0.6) and update `docs/LOCK.md`, check the deployed site, write the phase
     report, run the Judge pass (§11.4), add its findings as new objectives.
  10. GOTO 1.
STOP only when (a) every objective is `met`, or (b) the feature freeze is reached → fix-only loop until the deadline,
or (c) blocked on the owner → ask one precise question and continue with other objectives.
```
**Anti-stall**: an objective failing three consecutive iterations is marked `blocked` with a note; apply a documented
fallback and move on. Never mark `met` without evidence.

**Resume protocol** (the owner writes "continue", or a new session starts): re-read this prompt, OBJECTIVES.md,
WORKLOG.md and `git log`; re-run the preflight; re-fetch data if the VM is fresh (fetch is idempotent); resume the loop
at the first unmet objective.

### 11.3 Definition of Done (every objective)
Acceptance criterion met with evidence · tests pass · no console errors · keyboard accessible · EN and FR strings ·
every number has a definition and units · assumptions labelled · performance budgets respected · docs updated ·
deployed version checked when user-visible.

### 11.4 Judge pass (end of every phase)
Run the golden path headless with screenshots at 1440×900 and 390×844. Score it 1–5 on Impact, Creativity, Validity,
Relevance, Presentation, with one concrete improvement per criterion; add the improvements as objectives ranked by
expected score gain per hour of work.

---

## 12. Phase plan (times Europe/Paris; T0 = start of the session)

| Phase | Time box | Scope | Exit criteria |
|---|---|---|---|
| **L0 Preflight & safety net** | T0 → T0+1 h | Read this prompt, the challenge page, `reference/v1` in full; REFERENCE_AUDIT; preflight; OBJECTIVES; scaffold; CI; build and deploy `reference/v1/web` to GitHub Pages as the fallback URL; start the resource reading (§4) | Fallback URL live (after the owner merges); OBJECTIVES seeded |
| **L1 Science core from zero** | → T0+5 h | Pipeline fetch; ephemerides 2017–2031 + ITRF93 Moon; horizon cascade; visibility, events, energy; oracle tests O1–O2; V1–V6, V8–V11, V19 | All listed tests pass (or reference module ported with a DECISIONS entry) |
| **L2 Moon Maps & product shell** | → T0+10 h | Layout §6.5; Globe + South-pole map + search + layers panel + place card; Workbench; timeline; modes; i18n; Workers; default scenario | C1–C9 met with existing data; golden path clickable; deployed |
| **L3 Decide** | → T0+14 h | Hazards (5 m windows) + safety; candidate grids; Top 3 + Mission Brief; solar-efficiency optimizers; connectivity module | P4–P7 met; V15–V17 pass; deployed |
| **L4 Value-added & wow** | → 19:00 | Layers §6.4; Site 3D; Who blocks the Sun; Street View; attitude slider; mission replay; porkchop; compass; Directions (in this order) | P3, P8–P11, C11–C12 met as time allows; deployed |
| **L5 Proof & polish** | → **19:59 feature freeze** | Accessibility, mobile, performance, Trust page, TRACEABILITY, PRODUCT, METHODS, SUBMISSION, DEMO_SCRIPT, PITCH, screenshots, final deploy | V13 pass; P13–P14 met |
| **L6 Submission support** | 19:59 → 23:59 | Fix-only loop; hand the owner the demo shot list and submission text | — |

**Challenge-driven additions (§6.15)**: scenario comparison and thermal proxy → L3; season view and constraint panels
→ L3/L4; PWA → L5; "Land it!" → end of L4 if time remains.

**Cut list when late** (apply in order): "Land it!" → Directions → compass → porkchop → ellipse cloud → real-time shadows (keep static
lighting) → mission replay → Street View polish → FR translation (keep scaffold) → PDF (keep print page).
**Never cut**: oracle-validated science core, Top 3, landing safety screening, DTE with DSN, solar-efficiency headline,
Trust page, public URL.

---

## 13. Deliverables
Public GitHub Pages URL. Repository with a product README (screenshots/GIF, 30-second quick start, architecture,
methods, limits, credits, licence: MIT for code; full data attribution NASA/LRO/LOLA, LROC/ASU, Moon Trek, JPL/NAIF,
USGS, CSA). Docs: METHODS (every equation and constant with source), VALIDATION (generated), TRACEABILITY, OBJECTIVES,
RESOURCES, DECISIONS, DATA_PROVENANCE, REFERENCE_AUDIT, **PRODUCT** (problem, users, value proposition, competitive
matrix — verify every competitor claim on its public page: NASA QuickMap, Moon Trek, JPL Horizons, Lunar Landing Site
API by IrisDataLabs, academic AI site-selection tools such as LUMINA, image-based hazard prototypes such as LunarSafe
AI, generalist mission-analysis suites; business model options without invented market figures; moat; roadmap; risks),
**SUBMISSION** (≈ 200-word summary + long description, English), **DEMO_SCRIPT** (2 minutes, shot list mapped to the
five judging criteria), **PITCH** (5 slides).

## 14. Reporting protocol
End of every phase: what was built; what was verified (paste test output); what failed or is unknown; deviations from
this prompt and why; deployed URL; objectives met / remaining; time used vs box. Final report: known limitations (no
secondary illumination; no thermal or dust effects; DEMs cannot resolve rocks smaller than their pixel; tip-over is a
screening model; geometric visibility ≠ link closure; DE421 vs DE440 MOON_ME offset, quantified).

## 15. Pitfalls checklist
ME vs PA frames; longitude sign; UTC vs TDB; reference sphere vs ellipsoid; the Sun as a point; Earth direction from
the Moon's centre; forgetting mast height; azimuth wrap; polar-stereographic scale; tile row/column order; slope
baseline not stated; mixing slopes from different resolutions; interpolated 5 m pixels treated as measured; DE421 vs
DE440; station minimum elevation and time zones; Monte Carlo without a seed; "three options" 200 m apart; mockup
numbers in the UI; NASA logo; unlabelled assumptions; over-claiming validation; decorative effects that cost frame rate;
hidden state that breaks shareable URLs; committing large raw data; CI depending on NASA downloads.

---

## Appendix A — Network allowlist for the cloud environment
The owner adds these domains (one per line) under Network access → Limited → Allowed domains, with "Allow package
managers" checked; or selects Full.
```
www.spaceappschallenge.org
www.asc-csa.gc.ca
ssd.jpl.nasa.gov
ssd-api.jpl.nasa.gov
trek.nasa.gov
quickmap.lroc.asu.edu
www.lroc.asu.edu
naif.jpl.nasa.gov
pgda.gsfc.nasa.gov
core2.gsfc.nasa.gov
pds-geosciences.wustl.edu
planetarynames.wr.usgs.gov
svs.gsfc.nasa.gov
nssdc.gsfc.nasa.gov
www.nasa.gov
science.nasa.gov
zenodo.org
```
If a download is refused (for example Playwright's browser download), report the exact host to the owner.

## Appendix B — Messages for the owner
- Start: "Read docs/MASTER_PROMPT_V3.md in full and execute it. Run the work loop of §11 until every objective in
  docs/OBJECTIVES.md is met or the feature freeze is reached."
- Resume: "continue — follow the resume protocol of §11.2."
