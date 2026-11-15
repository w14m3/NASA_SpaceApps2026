# MASTER PROMPT v2 — Sightline: Lunar Landing Site Navigator (Product Edition)

NASA Space Apps Challenge 2026 · Challenge "Lunar Landing Site Navigator" (10 – CLPS) · Prompt v2.0 · 15 Nov 2026

> Paste this whole file into Claude Code at the root of the `lunar-navigator` repository, or save it as
> `docs/MASTER_PROMPT_V2.md` and tell Claude Code: "Read docs/MASTER_PROMPT_V2.md and execute it phase by phase,
> starting with P0. Report after each phase." Work autonomously. Ask the owner only when blocked.

---

## 0. Read this first

### 0.1 What changes from v1

v1 (MASTER PROMPT v1.0, 14 Nov) produced a validated scientific MVP (milestones M0–M5). v2 turns it into a product
that a jury understands in 10 seconds and that a mission team could buy. **Every requirement of v1 stays in force.**
v2 adds four things:

1. **Landing safety** — will the lander stay upright on this ground? (slope, roughness, tip-over)
2. **Top 3 recommendations** — the tool never imposes one site. It proposes three ranked, diverse, explained options
   and the crew chooses.
3. **A product interface** modelled on the owner's reference mockup (layout only, §6.2).
4. **Differentiating features** that other teams are unlikely to have (§7).

### 0.2 Deadline and time boxes

Submission closes **Sunday 15 November 2026, 23:59, local time of our Local Event**. In your first message, ask the
owner to confirm the time zone and the hosting choice (GitHub Pages or Netlify); assume Europe/Paris and continue if no
answer comes. Follow the phase plan in §12 with hard time boxes. After **every** phase: tests green, production build,
deploy, short report. If a phase overruns by more than 30 minutes, apply the cut list (§12.2) instead of continuing.
**Feature freeze 4 hours before the deadline**; after that only bug fixes, docs and screenshots.

### 0.3 Priority order (unchanged)

(1) scientific truthfulness → (2) numerical correctness → (3) interactivity and clarity → (4) visual polish →
(5) number of features. A smaller tool that is correct, fast and understandable beats a bigger one that is wrong.

### 0.4 Starting point

**Mode A (default): the existing repo is present.** It contains a validated science core. Keep it and extend it;
rebuild the *product layer* (UI, flows, state) from scratch per §6. Do not rewrite validated code without a failing test
that justifies it. Read first: `HANDOFF.md`, `README.md`, `docs/METHODS.md`, `docs/DECISIONS.md`,
`docs/VALIDATION.md`.

Validated assets to keep (re-verified on 14–15 Nov: vitest 4/4, pytest synthetic 5/5, e2e 13/13, build OK):

- `pipeline/lunarnav/ephem.py`, `cheby.py`: SPICE (MOON_ME, LT+S) → Chebyshev degree 15 on 4-day segments. Browser vs
  rigorous SPICE 2.7e-5°; SPICE vs JPL Horizons ≈ 1e-6° (V2).
- `pipeline/lunarnav/horizon.py` + `web/src/core/horizon.ts`: great-circle horizon march (V4, V5, V6 pass).
- `web/src/core/visibility.ts`, `analysis.ts`: disk fraction (V9), events to 1 s (V8), energy integral (V10).
- `pipeline/scripts/build_validation.py`: Trust-page statuses generated from test output, never hand-typed.
- URL-state sharing, CSV/JSON/PNG export, Playwright smoke test.

Known defects — fix in P0 unless noted:

1. `pipeline/scripts/build_site_data.py`: `in_fine = lat <= -80.5` mislabels IM-1 Odysseus (80.13°S, 1.44°E, inside
   the ±304 km square of the 80 m product) as "240 m, outside the 80 m product". Test DEM coverage, not latitude. This
   also fixes the pixel size used by the Workbench near-field warning.
2. Manifest and Trust page say "half-pixel ray steps"; the code uses "1 % of distance, capped at ½ pixel". The Trust
   page says terrain exists only for 80–90°S; curated sites have terrain down to 60°S (Chandrayaan-3). Make every text
   match the code.
3. 2 m results are dominated by ground less than 500 m away. Example: Malapert M1 at 2 m has its north horizon at 4.2°
   set 0.5 km away and its west horizon at 2.0° set 0.1 km away → 32.6 % sunlit and a 4,158 h continuous night over one
   year; at 10 m the Sun clears the horizon every month. Change the default mast to 10 m, add the confidence grade of
   §5.2 to every score, the compare table and every ranking, and stop the uncertainty band from vanishing in the near
   field (§5.2).
4. Headline "N× the energy of a flat panel" (38×–61× at polar sites) uses a strawman baseline. Primary baseline: a fixed
   vertical panel at 2 m facing the best fixed azimuth. Keep "flat panel" only as an educational comparison.
5. Heavy computation runs on the main thread (≈ 2 s freeze with 4 sites over 365 days). Move it to Web Workers (§10).
   (P1)
6. Ephemeris covers 2026-01-01 → 2031-01-03 only. Extend to 2017-01-01 → 2031-01-03: no leap second since
   2017-01-01, so the UTC time variable stays valid (the build already asserts this). Needs the kernels only
   (≈ 50–80 MB), not the DEMs. (P3)
7. The app ignores `hashchange`; `web/README.md` is the Vite template; unused assets `react.svg`, `vite.svg`,
   `hero.png`; the Cesium ion logo shows although no ion service is used; placeholder git author; 17 oxlint warnings.

**Mode B: no repo.** Rebuild the architecture of §10 in this order: ephemeris (SPICE → Chebyshev) with its parity test
→ horizon engine with V4–V6 → visibility/events with V8–V9 → then the product. Never skip validation to gain time.

---

## 1. Product

### 1.1 Name and promise

Working name **Sightline — Lunar Landing Site Navigator**, stored in one constant `PRODUCT_NAME` so the owner can change
it. Note in `docs/PRODUCT.md` that a trademark check is required before commercial use.

Promise: *"Pick a region and a date. In seconds, get the three best places to land near the lunar south pole — safe to
touch down, powered by the Sun, in contact with Earth — and see why."*

Four questions answered on every screen:

1. **Can it land safely?** Ground slope, roughness, tip-over margin.
2. **Can it make power?** Sunlight, longest night, energy.
3. **Can it talk to Earth?** Earth in view AND a Deep Space Network complex sees the Moon.
4. **Which three sites should the crew choose from, and why?**

### 1.2 Users and modes

| Persona | Mode | Needs |
|---|---|---|
| Mission planner / engineer (CLPS provider, agency) | Plan | Top 3, trade-offs, uncertainty, exports, mission brief |
| Educator, student, public, jury | Explore (default on first visit) | 10-second verdict in plain language, 3D, guided tour |
| Scientist | Plan + "Science" weight | Proximity to permanently shadowed regions, provenance |

Top-bar mode switch: **Explore · Plan · Learn** (Learn = guided tour + glossary). Same data, progressive disclosure.

### 1.3 Golden path (this is the demo; it must work flawlessly)

1. The app opens on a **pre-computed default scenario** (south-pole hero region, next feasible window, generic medium
   lander, mast 10 m) and shows the Top 3 within 3 s without any click (snapshot built at build time, recomputed live
   when inputs change).
2. **Plan a landing** opens a 3-step wizard: (a) region, (b) mission window (landing date + surface duration),
   (c) lander (preset, mast height, priorities). Every step has defaults; "Find my top 3" is enabled from step 1.
3. Results: three cards **Option A / B / C** in the left panel, three pins on the stage, trade-off bars on the right,
   timelines at the bottom.
4. Clicking a card flies to the site and opens the Site Workbench (verdict, countdowns, sky plot, safety gauge, power,
   link).
5. **Crew choice**: "Choose this site" → Mission Brief (printable page / PDF) with the chosen site, the two
   alternatives, reasons, risks, assumptions, uncertainty, manifest and share link.

Targets: open → defensible answer ≤ 10 s; open → full brief ≤ 60 s.

---

## 2. Non-negotiable rules

Rules 1–10 of v1 §5 stay in force: no fabricated data; read before use; reproducible (pinned versions, scripts,
manifest); fixed and displayed conventions; validate before claiming; show uncertainty and assumptions in the UI;
illumination ≠ electrical power and geometric visibility ≠ link closure; respect terms of use and attribute
NASA/LRO/LOLA/LROC/Moon Trek/JPL/NAIF/CSA; no paid keys, no secrets, graceful offline behaviour; ask only when blocked
and record decisions in `docs/DECISIONS.md`. New rules:

11. **No NASA insignia, logo or wording implying NASA endorsement.** Use our own logo; credit data sources in text.
12. **The reference mockup is a layout reference only.** Its numbers are physically wrong for the pole (for example a
    14.2° solar elevation: at the south pole the Sun stays within about 1.5° of the astronomical horizon, plus its
    0.27° radius). Never display a number that the core did not compute. Any visual exaggeration (vertical
    exaggeration, enlarged sky arc) carries an on-screen label "×N, for visibility".
13. **No invented lander specifications.** Presets are "Generic small / medium / large lander — illustrative
    parameters, editable"; every parameter is labelled as an assumption. A real vehicle appears only with a cited
    public source.
14. **Decision support, not certification.** Every safety number is labelled "screening estimate at <baseline> m".
15. **Deterministic.** Seeded randomness and stable sorts: the same URL gives the same result.
16. **Region and site coordinates only from sources** (PGDA product metadata, NASA announcements, peer-reviewed papers,
    LROC). Weak source → flagged "unverified".

---

## 3. Requirements traceability

Create `docs/TRACEABILITY.md`: one row per requirement from (a) the challenge page (objectives and potential
considerations), (b) v1 §7–§12, (c) this prompt — with status (done / partial / not done), code location, test, and
screen. Update it at the end of every phase; the Trust page links to it.

The challenge asks, at minimum: curated sites (Apollo, CLPS targets, commercial missions, other nations) and custom
coordinates; side-by-side or sequential comparison; date and time selection across lunar days and seasons; Sun and
Earth positions relative to the horizon; time remaining before sunset and Earthset; solar elevation displayed
prominently; duration of sunlight; Earth visibility windows; several visual approaches (2D maps, 3D surfaces, other);
animations or timelines; usable by planners, educators and the public; real topography and no atmosphere; Earth
libration and orbital variations; steep slopes and deep craters; why small location or date changes have large impacts.

---

## 4. Data

### 4.1 Sources (read each one and log it in `docs/RESOURCES.md` before use)

| Data | Source | Use |
|---|---|---|
| SPICE kernels | NAIF generic kernels: naif0012.tls, pck00011.tpc, moon_pa_de440_200625.bpc, moon_de440_250416.tf, de440s.bsp, earth_1962_260806_2126_combined.bpc, station kernels earthstns_itrf93_260814.bsp and earth_topo_260814.tf (verify current names) | Ephemeris, DSN geometry |
| LOLA 80 m, 240 m and `_ERR` | PGDA product 90 (already in the pipeline) | Horizon far field, uncertainty |
| LOLA 20 m, 80–90°S | PGDA product 90, `LDEM_80S_20MPP_ADJ.TIF` (≈ 2.6 GB) | Hazard and near field outside 5 m coverage. Do not download it whole: it is published as a Cloud-Optimized GeoTIFF, so read only windows over HTTP (`rasterio` with `/vsicurl/`). Verify the COG layout first |
| LOLA 5 m site DEMs and slope | PGDA product 78 (Barker et al. 2021, Planet. Space Sci. 203, 105119): 13 Artemis III candidate regions plus Site 004, south polar stereographic, MOON_ME (DE421) | Landing hazard at lander scale; near-field horizon in hero regions |
| 5 m Shape-from-Shading DEMs | PGDA product 104 (Bertone et al.) — evaluate | Optional refinement in illuminated areas |
| LRO WAC mosaic | NASA Moon Trek WMTS (already used) | Imagery |
| JPL Horizons | API, responses cached | Independent validation (V2, V3, V11) |
| DSN station coordinates | NAIF earth_topo tf comments (DSN 810-005, module 301) — already in `data/sites_research.json` | Ground-station windows |
| Site coordinates | `data/sites_research.json` plus new sourced entries | Curated sites |

### 4.2 Hero regions

Select **at least three** hero regions from PGDA product 78 coverage: the Shackleton–de Gerlache connecting ridge
(contains curated site 001), the Shackleton rim (site 004), and one more distinct region. Take names and footprints
from the product metadata; record the choice in `docs/DECISIONS.md`. Defaults with a cited source: a candidate landing
region is about 15 × 15 km; a landing site is about 100 m in radius.

### 4.3 New curated sites

Add upcoming south-pole targets only with a public source, each with access date and verified/unverified status:
Chang'e-7 (target: illuminated Shackleton rim; launch reported delayed to 2027), Griffin-1 (Mons Mouton / Nobile
region), Blue Origin Blue Moon MK1 pathfinder and VIPER (south pole; verify), and the Artemis III candidate regions as
named outlines from the product 78 footprints. Any site south of 80.5°S without a precomputed mask already gets an
in-browser 240 m mask, so these can be shown before the pipeline finishes; also add them to
`data/sites_research.json` so a rebuild keeps them.

---

## 5. Science core (exact definitions)

v1 §8 remains the reference (conventions, dual-source ephemerides, topocentric geometry, horizon mask, disk
visibility, power model, connectivity, events, uncertainty). Additions:

### 5.1 Multi-resolution horizon

Generalise the horizon march to a **cascade of grids** (5 m → 20 m → 80 m → 240 m): at each step use the finest grid
with valid data. Same equation as v1 §8.4. Record which grids contributed and the void fraction. V6 convergence applies
to every hero site.

### 5.2 Near field and confidence

- `near_share(h)` = fraction of azimuths whose horizon is set by terrain closer than 3 pixels of the grid that sets it.
- Uncertainty band = v1 correlated-error ramp **plus** a near-field roughness term so the band never collapses next to
  the observer: δ(s) = sqrt(δ_corr(s)² + δ_rough²), with δ_rough from the RMS residual of a plane fit within 3 pixels
  (or the published 5 m DEM uncertainty where available). Document it in METHODS.
- Confidence grade per site and mast height: **A** (near_share < 10 % and 5 m DEM), **B** (near_share < 25 %), **C**
  otherwise. Show it next to every score, in the compare table and on every Top 3 card. A grade-C site cannot be
  Option A unless no A/B candidate passes the constraints — and the card says so.

### 5.3 Landing surface and tip-over (screening model)

DEM priority for hazards: 5 m (product 78) → 20 m → 80 m. Always display the slope baseline (≈ the plane-fit window).

- **Footprint slope**: least-squares plane through the DEM heights inside a disk of diameter D_fp (lander footprint,
  from the preset) → slope angle σ and downhill azimuth.
- **Roughness**: RMS of residual heights inside the footprint. **Max step** = max |residual|.
- **Safe-area fraction** inside the landing circle (radius r_site, default 100 m): share of pixels with slope < S_max
  (default 8°, a literature example used by Barker et al. 2021; editable, labelled).
- **Tip-over** (rigid lander, first order). Parameters: n legs; pad-circle radius R (centre to footpad); centre of
  gravity height h above the pad plane; radius of gyration k about the centre of gravity (assumption); lunar gravity
  g = 1.62 m/s² (cite).
  - worst-case pivot distance r = R·cos(π/n); static tip angle θ_tip = atan(r / h)
  - effective tilt τ = σ + δ_σ + attitude dispersion, where δ_σ is the DEM slope uncertainty (product value if
    provided, else the published 1.5–2.5° typical RMS for LOLA 5 m DEMs, labelled as an assumption)
  - static margin M = θ_tip − τ
  - critical lateral touchdown velocity, from conservation of angular momentum about the downhill pad at impact:
    L = sqrt(r² + h²); **v_crit = sqrt(2·g·L·(1 − cos M)·(L² + k²)) / h** (tip-over if the rotational energy
    exceeds the potential barrier m·g·L·(1 − cos M))
  - verdict: green if M ≥ M_min and v_crit ≥ v_design; amber if M ≥ 0; red otherwise
  - plain sentence: "On this ground, this lander tips over if it touches down faster than X m/s sideways."
  - label: screening estimate; ignores leg stroke and crush cores, plume–surface interaction, soil failure, and rocks
    smaller than the DEM pixel.
- **Landing ellipse Monte Carlo**: semi-axes a, b and orientation (preset per lander class, editable); N = 500 seeded
  samples → P(safe) = share of samples with M ≥ M_min and σ ≤ S_max; P10/P50/P90 of σ, M, v_crit, sunlit %, longest
  night and DTE %. Show it as a point cloud on the map and as a "landing confidence" percentage with its sample size.

### 5.4 Power additions

- **Mast height continuous 0–30 m**: recompute in a worker for custom and hero sites; precompute curated sites at
  {1, 2, 5, 10, 20, 30} m; draw the mast-gain curve.
- **Lander attitude**: rotate panel normals by the lander tilt (default = footprint slope; user slider 0–90°) and
  heading. Story for the demo: IM-1 and IM-2 both ended on their side.
- **Electrical model** (v1 §8.6) plus battery: E_batt = P_load·T_dark / (DoD·η_batt); mass = E_batt / specific energy
  (assumption). **Survival timeline**: hourly state of charge over the window → "survives" or "battery empty at T".
- **Energy integration**: refine adaptively around rise/set events (already exact) so V10 holds at ≤ 0.1 % on real
  terrain over 365 days (it reaches 0.74 % today).

### 5.5 Connectivity (direct to Earth)

- The pipeline precomputes the Moon's topocentric elevation at DSS-14 (Goldstone), DSS-43 (Canberra) and DSS-63
  (Madrid) every 10 minutes for 2026–2031 with SPICE (Earth orientation kernel plus station kernels or the earth_topo
  coordinates), stored as int16 at 0.01° → `dsn_moon_elev.bin` (≈ 1.6 MB, lazy-loaded). The minimum station elevation
  is a runtime setting (default 10°, editable, labelled assumption) with linear interpolation.
- DTE(t) = EarthVisible(site, t) ∧ (∃ station with elevation ≥ minimum). Timeline tracks: Earth in view, each DSN
  complex, DTE.
- Range, one-way light time, free-space path loss per band (S ≈ 2.2 GHz, X ≈ 8.4 GHz, Ka ≈ 32 GHz, nominal and
  labelled) and its variation over the window.
- Sun–Earth separation flag (editable threshold, labelled assumption).
- Antenna pointing: Earth-direction envelope over the window, best fixed boresight (minimum enclosing cone), fraction of
  time inside beamwidth β, required gimbal range.
- Always labelled: geometric feasibility, not link closure.

### 5.6 Top 3 recommendation engine

Inputs: region (or all hero regions), mission window (landing date + duration), lander preset, mast height, priority
weights, constraints.

1. **Candidates**: a grid every 250 m inside each hero region (≈ 3,600 per 15 × 15 km region). The pipeline
   precomputes per candidate: lat, lon, z0, hazard stats (footprint slope for each preset footprint, roughness,
   safe-area fraction, DEM used), horizon masks at 360 azimuths (uint8, 0.1° step plus offset) for h = 2 m and 10 m,
   near_share and height uncertainty. Budget ≤ 3 MB per region per height (gzip). Use numba with multiprocessing. If the
   build is too slow, split the near field (full resolution, ≤ 20 km) from the far field (2 km sub-grid, interpolated)
   and validate the split (V7b).
2. **Hard constraints** (editable, defaults labelled): footprint slope ≤ S_max; safe-area fraction ≥ f_min; tip margin
   M ≥ M_min; not in a cell with zero illumination over the window; sunlit ≥ x %; longest night ≤ y h; DTE ≥ z %.
   Confidence grade is a soft constraint (§5.2).
3. **Fast scoring** in a Web Worker on hourly samples: Sun visible when its upper limb clears the mask (exact disk
   fraction later for the final 20), Earth and DTE likewise. Metrics: sunlit %, longest night, Earth %, DTE %, longest
   DTE gap, energy, safety.
4. **Scores 0–100**, each with a published formula: Safety (M, v_crit, safe-area fraction); Power (v1 formula on sunlit
   % and longest night, or energy-based — document the choice); Link (DTE-based); Robustness (score change under a
   ±3-day slip and under the lo/hi masks); optional Science (distance to the nearest zero-illumination cell). Combined
   = weighted geometric mean, so a zero in any dimension sinks the site. Persona presets: "Crew safety first",
   "Long-duration power", "Balanced" (default), "Science near ice".
5. **Refine** the best 20 in the worker: full 720–1440-azimuth masks on the cascade DEM, exact disk fractions and events
   from the v1 core.
6. **Select three diverse options**: greedy by combined score with a minimum separation d_min (default 1 km, editable).
   Label each by its strongest dimension: "Safest", "Most sunlight", "Best Earth link" or "Best balance".
7. **Explain**: for each option, three bullets generated from its largest advantages over the feasible-set median and
   over the other two options, plus its main risk and its confidence grade. Form: "Sunlit 87 % of the window (median
   61 %). Longest night 31 h. Tilt margin 9.2° — tips over above 1.1 m/s sideways." Every number comes from the core.
8. **Pareto view**: power versus link, marker size = safety, the three picks highlighted.
9. **Empty result**: name the constraint that removed the most candidates and offer one-click relaxations.

### 5.7 Who blocks the Sun? (explainability)

Masks already store the distance of the horizon-defining terrain for every azimuth. Use it to (a) draw the ray from the
site to the blocking ridge on the 2D map and in 3D, and (b) attribute every dark interval: "Night of 40 h from 3 Dec
04:10 UTC, caused by the ridge 12.4 km away at azimuth 135°." This is the direct answer to the challenge's "why do
small changes have large impacts".

---

## 6. Product interface

### 6.1 Design principles

Dark mission-control look (keep the v1 tokens: Sun amber, Earth blue, terrain greys, shadow near-black; add Safety
green/amber/red). Never colour alone: icon + text + shape. One type scale. Plain language first; every number one tap
from its definition. Motion only when it explains (terminator sweep, Sun arc, fly-to); reduced motion respected.
WCAG 2.2 AA, fully keyboard-operable. English default, French available.

### 6.2 Layout (from the reference mockup — layout only)

Desktop ≥ 1280 px: three columns plus a bottom dock. Mobile: stage full screen, panels as bottom sheets.

- **Top bar**: our logo + `PRODUCT_NAME` · mode switch Explore / Plan / Learn · **Plan a landing** (primary button) ·
  Compare · EN/FR · Methods & Trust · settings.
- **Left panel "Sites & comparison"**: search (site name or "lat, lon"); notable sites grouped (South-pole targets,
  CLPS, Apollo, Other nations, Custom) with radio selection and category chips; custom-coordinates form with validation
  and an "Apply" button; **Top 3 cards** once computed; **Overlays** toggles, each with a legend: Topography
  (hillshade), Lighting now, Mean illumination (window), Earth visibility, Landing hazard (slope), Zero-illumination
  cells, DSN coverage, Who-blocks-the-Sun rays.
- **Centre stage**, three views: **3D Moon** (Cesium globe), **South pole** (2D polar map), **Site 3D** (§6.3).
  Floating cards: *Solar elevation* (big number above the terrain horizon, trend ↑/↓, "sets in …"); *Direct-to-Earth
  window* ("active, ends in …" or "next in …"); pinned site label.
- **Right panel**: Mission time (UTC, editable) · **Current conditions** chips "☀ Sunlight · ● Earth link · ⛰ Safe
  ground" (icon + text + colour) · countdown cards · **Site trade-off** for A/B/C (bars: sunlight hours, DTE hours,
  longest night, tilt margin; small radar) · **Horizon profile** = the existing sky plot (azimuth × elevation, terrain
  silhouette, uncertainty band, Sun and Earth discs at true size, trails, libration loop). Do not copy the mockup's
  elevation-in-metres chart: it mixes units.
- **Bottom dock "Timeline & controls"**: date-range brush (analysis window), time scrubber, play/pause, speed, slip
  −7 / −1 / +1 / +7 days and +1 lunar day, draggable mission bar (landing → end of mission), stacked tracks per pinned
  site: Sun fraction, Earth in view, each DSN complex, DTE, and "both".

### 6.3 Site 3D view (the visual hook)

A three.js scene of the selected hero region (≥ 15 × 15 km) built from the best DEM (5 m resampled into a manageable
mesh with levels of detail). Vertical exaggeration slider (default ×1; labelled whenever ≠ 1). Lit by the true Sun
direction at the selected time with real-time shadow maps (long polar shadows). Earth and Sun discs on a sky dome in
their true directions; Sun path for the next lunar day (any elevation exaggeration labelled); the lander drawn at true
scale on its footprint plane with its tilt; Top 3 pins; landing-ellipse cloud; blocking-ridge rays. Lazy-loaded.
Fallback: Cesium with a `CustomHeightmapTerrainProvider` fed by the 240 m DEM. Target ≥ 30 fps on a mid-range laptop.

### 6.4 Plain-language layer

- In Explore mode every metric has a one-sentence version, e.g. "This spot sees the Sun 87 % of the time; its longest
  night lasts about a day and a half."
- A verdict sentence at the top of the Workbench covering the four questions.
- A 5-step guided tour, "Why is the south pole so hard?": the Sun skims the horizon; terrain decides; Earth wobbles;
  landing needs flat ground; three options for the crew.
- A glossary.
- Fun facts computed by the core, e.g. the shadow length of the mast at the current Sun elevation (2 m at 1.5° gives
  ≈ 76 m), Earth day versus lunar day.

### 6.5 Mission Brief

Print-optimised page and PDF (browser print-to-PDF is acceptable): scenario inputs, Top 3 table, chosen site with
reasons and risks, safety gauge, timeline snapshot, assumptions, uncertainty, conventions, manifest, share URL (QR code
optional). English and French.

---

## 7. Differentiators (in priority order)

| # | Feature | Why it wins | Phase |
|---|---|---|---|
| D1 | Top 3 + crew choice + Mission Brief | Delivers a decision, not only data | P2 |
| D2 | Tip-over critical velocity + stability gauge | Turns slope into "will it stay upright" | P2 |
| D3 | Site 3D view with real shadows | The jury's first impression | P3 |
| D4 | Who blocks the Sun? | Explains instead of only showing | P3 |
| D5 | Lander attitude slider (IM-1 / IM-2 story) | A real-world story everyone understands | P3 |
| D6 | Mission replay validation: Chandrayaan-3 (2023-08-23), IM-1 (2024-02-22), IM-2 (2025-03-06) — compare predicted sunset and Earth conditions with published end-of-mission accounts, each cited | Validity demonstrated on history | P3 |
| D7 | Lunar "porkchop plot": landing date over 6–12 months × mission duration → combined score | Familiar to engineers; answers "what if we slip 3 days?" in one image | P3–P4 |
| D8 | Landing-ellipse risk cloud | Links landing precision to power and safety | P3–P4 |
| D9 | Earth libration loop + best fixed antenna boresight | Makes libration visible and useful | P4 |
| D10 | Illumination compass: 8 neighbours at 100–500 m with gain arrows, "snap to best within r" | Small moves, big effects | P4 |
| D11 | Fun facts | Public engagement | P1 |

---

## 8. Commercial framing (`docs/PRODUCT.md`, English)

- Problem, users, jobs to be done, value proposition, why now (Artemis, CLPS, NASA Moon Base plans, international
  south-pole missions).
- Competitive landscape matrix. **Verify every claim on the competitor's public page before writing it.** Rows: NASA
  Quickmap, NASA Moon Trek, JPL Horizons (data-rich, not decision tools); Lunar Landing Site API by IrisDataLabs
  (pre-analysed south-pole sites served by an API); academic AI site-selection work (e.g. LUMINA, Ohio State); image-based
  hazard prototypes (e.g. LunarSafe AI); generalist mission-analysis software. Columns: time-aware Sun/Earth, terrain
  horizon, DSN/DTE windows, landing safety, tip-over, Top 3 with explanations, uncertainty and public validation, open
  data, runs in a browser without install.
- Business model options, with no invented market figures: free public Explorer (education and outreach); Pro for
  mission teams (custom lander models, higher-resolution DEMs, team workspaces, API, PDF briefs); Enterprise or
  on-premise for agencies; education licences.
- Moat: validated science and a public Trust page; the four questions in one tool; a decision engine that gives
  reasons; deterministic, reproducible, works offline once loaded.
- Roadmap and risks.

---

## 9. Validation (extend v1 §12; publish everything on the Trust page)

Keep V1–V14, B1, B2. Add:

| ID | Test | Pass criterion |
|---|---|---|
| V7 | Candidate masks vs naive march at the same azimuths | ≤ 0.01° |
| V7b | Near/far split and 360-azimuth sampling vs full 1440-azimuth masks: sunlit-time error on 200 random candidates | ≤ 2 percentage points (report the maximum) |
| V11 | DSN Moon elevation vs JPL Horizons at ≥ 200 random instants | ≤ 0.05° |
| V15 | Plane fit on synthetic tilted planes and a cone | slope ≤ 0.01°, azimuth ≤ 0.1° |
| V16 | Tip-over analytic cases (M = 0 → v_crit = 0; flat ground; symmetry; units) | exact to 1e-9 |
| V17 | Top 3: determinism, constraint satisfaction (no pick violates a hard constraint), diversity (separation ≥ d_min) | pass |
| V18 | Mission replay: predicted conditions vs published accounts (qualitative, cited) | documented |
| V19 | Ephemeris extension 2017–2031: browser vs SPICE | ≤ 0.001° |
| V13+ | e2e golden path: open → Top 3 visible ≤ 3 s → choose → brief → share URL restores everything; axe critical = 0; Lighthouse performance ≥ 85 and accessibility ≥ 95 (when tooling is available) | pass |

---

## 10. Architecture

- **Keep**: Python 3.11+ pipeline (spiceypy, numpy, rasterio, pyproj, numba) producing static artifacts; React +
  TypeScript + Vite front end; CesiumJS lazy-loaded; fully static deployment.
- **Add**: `three` (lazy, Site 3D view); Web Workers for every heavy computation (`analyse`, `quickScore`, mask
  computation, Top 3, Monte Carlo) behind a small typed message API; a lightweight store (the current reducer or
  Zustand) with URL sync including the scenario inputs; i18n through a small dictionary module (EN/FR); charts drawn on
  canvas or with one small library, not several.
- Split `Workbench.tsx` into presentational components; `core/` stays React-free.
- New artifacts: `candidates/<region>_<h>.bin` + `.json`, `dem/<region>_<res>.bin` (hero windows for 3D and
  refinement), `dsn_moon_elev.bin`, `default_scenario.json` (snapshot), extended `ephem.bin`.
- Budgets: first meaningful render < 3 s; Top 3 recompute < 5 s with a progress indicator; interaction < 100 ms;
  sky-plot redraw on scrub ≤ 16 ms; initial JS < 1.5 MB gzipped, excluding Cesium and three.js.
- Quality gates: pytest, vitest, Playwright e2e, lint clean, GitHub Actions workflow on push.
- Deployment: prepare a GitHub Pages workflow and `netlify.toml`. If credentials are unavailable, produce `dist.zip`
  plus exact manual steps. Deploy at the end of every phase.

---

## 11. Pipeline additions

1. `fetch_data.py`: HTTP range resume; `--only kernels`; windowed COG reads (product 78 regions, 20 m windows) instead
   of full downloads; record URLs, bytes read and hashes of derived windows.
2. Ephemeris extension 2017–2031 plus a new parity fixture.
3. Hazard rasters per hero region (slope at each preset footprint, roughness, safe-area fraction), recording DEM and
   baseline.
4. Candidate tables and masks per region and mast height (§5.6), with build timings.
5. DSN Moon-elevation series (§5.5).
6. Default scenario snapshot.
7. Manifest and `docs/DATA_PROVENANCE.md` regenerated automatically.

---

## 12. Phase plan (T0 = when you start)

| Phase | Time box | Scope | Exit criteria |
|---|---|---|---|
| **P0 Stabilise & ship** | T0 → T0+1 h | Defects 1–4 and 7; default mast 10 m; confidence grade; new energy baseline; deploy the current app as a safety net | Tests green; public URL works |
| **P1 Product shell** | → T0+6 h | Layout §6.2, modes, wizard skeleton, plain-language layer, Web Workers (defect 5), i18n scaffold, fun facts, default scenario built from existing curated sites | Golden path clickable end to end with existing data; deployed |
| **P2 Decide** | → T0+12 h | 5 m hazard windows and §5.3 safety gauge; candidate pipeline; Top 3 engine §5.6; DSN/DTE §5.5; Mission Brief | Top 3 live for ≥ 3 regions; V11, V15, V16, V17 pass; deployed |
| **P3 Wow** | → T0+17 h | In this order: Site 3D view, Who blocks the Sun, attitude slider, ephemeris extension + mission replay (defect 6), porkchop plot, ellipse cloud | Each feature behind a working toggle; deployed |
| **P4 Polish & proof** | → deadline − 4 h (**feature freeze**) | Accessibility pass, mobile, performance, Trust page + TRACEABILITY, docs (PRODUCT, METHODS, SUBMISSION, DEMO_SCRIPT, PITCH), screenshots/GIF, final deploy | V13+ pass; all docs present |
| **P5 Submission support** | deadline − 4 h → deadline | Fixes only; hand the owner the demo shot list and the submission text | — |

### 12.2 Cut list (apply in this order when late)

D10 → D9 → D8 → D7 → real-time shadows in Site 3D (keep static lighting) → D6 → French translation (keep the scaffold)
→ PDF (keep the print page). **Never cut**: P0 fixes, Top 3, tip-over screening, DSN/DTE, Trust page, deployment.

---

## 13. Deliverables

Public URL. Repository with a product README (screenshots, 30-second quick start, architecture, methods, limits,
credits, licence). Docs: METHODS (every equation, including §5), VALIDATION (generated), TRACEABILITY, RESOURCES,
DECISIONS, DATA_PROVENANCE, PRODUCT, SUBMISSION (≈ 200-word summary + long description, English), DEMO_SCRIPT
(2 minutes, shot list mapped to the judging criteria Impact, Creativity, Validity, Relevance, Presentation), PITCH
(5 slides).

## 14. Reporting protocol

End of every phase: what was built; what was verified (paste the test output); what failed or is unknown; deviations
from this prompt and why; deployed URL; next steps; time used versus time box. Final report: known limitations (no
secondary illumination; no thermal or dust effects; DEMs cannot resolve rocks smaller than their pixel; tip-over is a
screening model; geometric visibility ≠ link closure; DE421 frame of the DEM products vs DE440 kernels — quantify the
offset).

## 15. Pitfalls

From v1: ME vs PA frames; longitude sign; UTC vs TDB; reference sphere vs ellipsoid; the Sun treated as a point; Earth
direction from the Moon's centre; forgetting mast height; azimuth wrap; polar-stereographic scale; tile row/column
order; unlabelled assumptions; over-claiming validation; decorative effects that cost frame rate; hidden state that
breaks shareable URLs.

New: slope baseline not stated; mixing slopes from different resolutions; interpolated 5 m pixels treated as measured;
DE421 (DEM) vs DE440 (kernels) realisations of MOON_ME; DSN minimum elevation and time zones; Monte Carlo without a
seed; "three options" that are 200 m apart; mockup numbers leaking into the UI; the NASA logo.
