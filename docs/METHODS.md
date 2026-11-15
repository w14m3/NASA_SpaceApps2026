# Methods — Sightline

Every equation the product uses, in the order the numbers flow, with the code that implements it and the test that
checks it. Browser science lives in `web/src/core/` (framework-free TypeScript, also run by the build scripts, so the
precomputed and the live numbers come from the same code); the ephemeris pipeline is `pipeline/lunarnav/` (Python).
Validation results: `docs/VALIDATION.md` (generated) and the in-app **Methods & Trust** page.

## 1. Conventions (contract §7.1)

| Item | Choice |
|---|---|
| Time | UTC in and out. TDB inside the pipeline (ERFA `utctai`, `taitt`, `dtdb`). TAI−UTC = 37 s over 2017-01-01 → 2031-01-03 (asserted by `build_ephemeris.py`), so the browser interpolates in UTC milliseconds |
| Lunar frame | MOON_ME (Mean Earth/Polar Axis), SPICE DE440 realisation (`moon_de440_250416.tf` + `moon_pa_de440_200625.bpc`) over the whole runtime span 2017-01-01 → 2031-01-03 (D20). JPL DE421 with its PA→ME rotation is kept as an independent cross-check (≤ 1.6e-5°, V19) |
| LOLA frame | MOON_ME of DE421 (product metadata). DE421-vs-DE440 ME direction difference measured ≤ 1.6e-5° (V19), < 1 m at the surface |
| Coordinates | Planetocentric latitude, east-positive longitude (−180…180) |
| Reference surface | Sphere R = 1737.4 km; terrain heights z relative to it |
| Angles | Azimuth clockwise from local north; elevation above the local horizontal of the sphere; km and degrees in the UI, radians internally |
| Instrument height | h above the terrain (mast); shown next to every result |
| Aberration | Apparent positions, SPICE "LT+S": converged light time then stellar aberration for the observer's barycentric velocity |

## 2. Constants (contract §7.2) — `web/src/core/constants.ts`, `pipeline/lunarnav/constants.py`

| Symbol | Value | Source |
|---|---|---|
| R☾ | 1737.4 km | LOLA reference sphere (PGDA product 90 metadata; Barker et al. 2023, PSJ 4, 183) |
| R☉ | 695,700 km | IAU 2015 Resolution B3 (nominal solar radius) |
| R⊕ | 6378.1366 km (equatorial; flattening ignored for the disk) | IERS Conventions 2010, Table 1.1 |
| au | 149,597,870.7 km | IAU 2012 Resolution B2 |
| S₀ | 1360.8 W/m² | Kopp & Lean 2011, GRL 38, L01706 |
| g☾ | 1.62 m/s² | NASA Moon fact sheet (NSSDCA) |
| c | 299,792.458 km/s | SI definition |
| Synodic month | 29.530589 d | mean synodic month (NASA Moon fact sheet) |
| σ (Stefan–Boltzmann) | 5.670374419 × 10⁻⁸ W m⁻² K⁻⁴ | SI defined constant (2019) |
| Earth spheroid for stations | a = 6378.137 km, b = 6356.7523142478 km | as quoted by NAIF `earth_topo_260814.tf` for the DSN geodetic coordinates |

## 3. Ephemerides (contract §7.3) — `pipeline/lunarnav/{de421,ephem,cheby}.py`, `web/src/core/ephem.ts`

- **2026–2031**: the SPICE DE440 Chebyshev artifact of reference/v1 (`spkpos(target, et, "MOON_ME", "LT+S",
  "MOON")`, degree 15 on 4-day segments, fit error 3e-9°), copied byte for byte.
- **2017–2026**: fitted here to SPICE DE440 (`spkpos(target, et, "MOON_ME", "LT+S", "MOON")`, kernels from
  `codex/fetch_nasa_data.py`), same layout, fit error ≤ 4.1e-9° (V19). Independent cross-check: JPL DE421 (PyPI
  `de421`) with converged light time, stellar aberration (as SPICE `STELAB`), the DE421 Euler angles R₃(ψ) R₁(θ) R₃(φ)
  and the DE421 PA→ME rotation (transpose of [67.92″]₃[78.56″]₂[0.30″]₁, composition fixed against DE440, D4):
  ≤ 1.6e-5° from SPICE over 2017–2031. DE421 is also the fallback when the kernels are absent (D3).
- **Moon from Earth stations**: apparent geocentric Moon (DE421, LT+S for the geocentre) rotated GCRS → CIRS with
  ERFA `c2i06a` (IAU 2006/2000A), Chebyshev-fitted 2017–2031. At runtime CIRS → TIRS by the Earth Rotation Angle
  ERA = 2π (0.7790572732640 + 1.00273781191135448 (JD_UT1 − 2451545.0)) (IERS Conventions 2010, eq. 5.15), with
  UT1−UTC from IERS `finals2000A` (Bulletin A incl. predictions) interpolated daily. Polar motion (< 0.5″) ignored.
- Evaluation: Clenshaw recurrence. Checks: O1, V2, V3, V19, V11b, libration unit test.

## 4. Topocentric geometry (§7.4) — `web/src/core/topo.ts`

r_s = (R + z₀ + h)·û(λ, φ); up = û, east = (−sin λ, cos λ, 0), north = up × east. For a body at p (Moon-centred),
d = p − r_s and elevation = asin(d̂·up), azimuth = atan2(d̂·east, d̂·north). The Earth direction uses d (parallax up
to R/d ≈ 0.26°). Angular radius = asin(R_body / |d|). Smooth-sphere dip: −acos(R / (R + h)).

## 5. Horizon mask (§7.5, §7.6) — `web/src/core/horizon.ts`

DEM: south polar stereographic on the sphere, true scale at the pole: k = 2R cos φ / (1 − sin φ), x = k sin λ,
y = k cos λ (V1). For azimuth α the great circle from the site is marched; at arc length s, θ = s/R,
u(s) = up cos θ + (north cos α + east sin α) sin θ, terrain height z(s) by bilinear interpolation, ρ = R + z(s),
ρ₀ = R + z₀ + h:

    ε(s) = atan2(ρ cos θ − ρ₀, ρ sin θ),    mask(α) = max ε(s), s ≤ 300 km

- Radial step: 1 % of the distance near the site, never more than ½ pixel of the active grid (a plain half-pixel step
  failed convergence by 1.2° in v1). The maximum is then refined by golden section between the neighbouring steps (D5).
- Grid cascade: finest grid with valid data at each step (here: LOLA 240 m 80–90°S for live masks; curated sites
  use the precomputed v1 masks from LOLA 80 m + 240 m). Rays leaving every grid are counted and reported.
- Uncertainty band: terrain shifted by ±δ(s), δ(s) = √(δ_corr² + δ_rough²), δ_corr = (σ_terrain + σ_site)·min(1,
  s / 2 px), δ_rough = RMS residual of a plane fit within 3 pixels of the site. σ for the 240 m grid = 2.7 m (measured
  RMS difference vs the 80 m DEM, from reference/v1).
- Distance of the horizon-defining point stored per azimuth (Who blocks the Sun).
- Confidence: near_share = fraction of azimuths whose horizon is set closer than 3 pixels of the grid that sets it;
  grade A (near_share < 10 % and a 5 m DEM), B (< 25 %), C otherwise. No 5 m DEM is available here, so A never occurs.
- Checks: V4, V5, V6, O2b, report O2_240m, V7.

## 6. Disk visibility and events (§7.7) — `web/src/core/{disk,events}.ts`

Visible fraction of a uniform disk of angular radius ρ centred at (az, el): 200 vertical strips at offset x, half
height √(ρ² − x²), visible length clamp(el + √(ρ² − x²) − mask(az + x / cos el), 0, 2√(ρ² − x²)). No limb darkening.
Sun "lit" at ≥ 1 % of the disk; Earth "in view" at ≥ 50 % (editable thresholds). Events: g(t) = fraction − threshold,
coarse scan 10 min (30 min beyond 120 days), bisection to 1 s, probing of grazing excursions (20 sub-steps when
|g| < 0.25 and moving toward zero). ± on an event = largest shift with the lower/upper masks. Checks: V8, V9.

## 7. Solar energy (§6.8, §7.8) — `web/src/core/energy.ts`

S(t) = S₀ (1 au / d☉)²; P_inc = S · f☉ · max(0, n̂·ŝ) per m² of panel (f☉ at the mast height); P_el = η · A · P_inc ·
(1 − losses). Layouts: flat, fixed vertical (any azimuth), four vertical facets, vertical with azimuth tracking
(cos i = cos el), tilted, two-axis tracking (cos i = 1); lander attitude rotates the normals. Energy: trapezoid over
an event-aware track (10-min base, 1-min wherever the disk is partly hidden or the visible fraction changes) — within
0.1 % of a 1-minute reference over 365 days on real terrain (V10). Capacity factor CF = E / (η A S₀ T). Storage for the
longest night: E_batt = P_load T_dark / (DoD η_batt); mass = E_batt / specific energy. Survival: hourly balance with
√η_batt on charge and discharge, clamped to the usable capacity. Headline: best option vs the best fixed vertical
panel at 2 m (primary baseline); flat panel at 2 m shown as the educational baseline. Defaults (labelled
assumptions): η 30 %, A 2 m², losses 15 %, load 100 W, battery 2 kWh, DoD 80 %, round trip 90 %, 150 Wh/kg.

## 8. Earth connectivity (§6.9, §7.9) — `web/src/core/{stations,link}.ts`

Station topocentric frame from geodetic coordinates on the station spheroid; Moon elevation from §3. DTE(t) = Earth
in view ∧ ∃ station with Moon elevation ≥ minimum (default 10°, assumption; DSS-14, DSS-63, DSS-43 + optional user
station). Range from the ephemeris; light time d/c; FSPL = 20 log₁₀(4π d f / c) at S 2.2 GHz, X 8.4 GHz, Ka 32 GHz
(nominal). Pointing envelope: smallest cone containing every Earth direction while in view (Bădoiu–Clarkson
iteration on the unit sphere), fraction of time within half-angle β, azimuth/elevation gimbal range. Solar interference
flag when the Sun–Earth separation < 5° (assumption) while the Sun is up. Optional link budget (all user inputs):
Eb/N0 margin = EIRP − FSPL − losses + G_rx − (−228.6 + 10 log T_sys) − 10 log R_b − required Eb/N0. Geometric
feasibility only, not link closure. Check: V11b.

## 9. Landing safety (§6.10, §7.10) — `web/src/core/safety.ts`

Footprint slope: least-squares plane z = a + b·E + c·N through bilinear DEM samples inside a disk of diameter D (true
metres; map offsets converted with the scale factor and meridian convergence); slope = atan √(b² + c²), downhill
azimuth = atan2(−b, −c); roughness = RMS residual; max step = max |residual|. Baseline here: 720 m (3 pixels of the
240 m DEM) — stated next to every slope. Tip-over (rigid body, first order): r = R_p cos(π/n), θ_tip = atan(r/h),
τ = σ + δσ + attitude dispersion (δσ = 2°, typical LOLA slope uncertainty, labelled), M = θ_tip − τ, L = √(r² + h²),
v_crit = √(2 g L (1 − cos M)(L² + k²)) / h. Verdict green if M ≥ M_min and v_crit ≥ v_design, amber if M ≥ 0, red
otherwise. Landing ellipse: 500 seeded samples (mulberry32 + Box–Muller), P(safe) = share with M ≥ M_min and
σ ≤ S_max, P10/P50/P90. Lander presets "Generic small / medium / large — illustrative", every parameter an
assumption. Default S_max 8° (literature example, Barker et al. 2021, Planet. Space Sci. 203, 105119). Checks: V15,
V16.

## 10. Candidate grid and Top 3 (§7.11) — `web/src/core/{candidates,top3}.ts`, `web/scripts/build-candidates.ts`

Four 15 × 15 km hero regions centred on curated points; candidates every 250 m (3,721 per region). Per candidate:
z₀, plane-fit slope/roughness at 720 m, horizon masks at h = 2 m and 10 m (360 azimuths, stored as uint8 at 0.1° above
a per-candidate offset, D10), near_share. Fast scoring: hourly samples over [t0 − 3 d, t1 + 3 d]; Sun lit when the
centre is more than −0.934 disk radii relative to the local horizon (equivalent to 1 % of the disk above a straight
horizon, solved from the circle-segment formula); Earth in view when its centre clears the horizon. Hard constraints
(defaults, editable): slope ≤ 8°, safe-area fraction (share of candidates within 500 m under the slope limit) ≥ 50 %,
tip-over margin ≥ 10°, not a zero-illumination cell, sunlit ≥ 30 %, longest night ≤ 240 h, DTE ≥ 10 %. Scores 0–100:

    Power  = 100 (0.6 L + 0.4 (1 − min(1, D / 354.4 h)))        L sunlit fraction, D longest night
    Link   = 100 (0.6 E + 0.4 (1 − min(1, G / 354.4 h)))        E DTE fraction, G longest DTE gap
    Safety = 100 (0.5 c(M / 2M_min) + 0.25 c(v_crit / 2v_design) + 0.25 safe-area)    c = clamp to [0, 1]
    Robustness = 100 − largest change of the combined score under a ±3-day slip
    Science = 100 · max(0, 1 − distance to the nearest zero-illumination cell / 5 km)
    Combined (viability) = 100 · exp(Σ wᵢ ln(sᵢ/100) / Σ wᵢ)      weighted geometric mean: a zero sinks the site

354.4 h is half a synodic month. Personas set the weights. Three options: greedy by combined score (stable ties by
index) with a minimum separation of 1 km; labels by strength; three reasons = the largest advantages vs the
feasible-set median; main risk = the weakest engineering metric (or low confidence). Checks: V7, V7b, V17.

## 11. Thermal proxy (§7.14) — `web/src/core/thermal.ts`

Cold-soak duration = longest darkness at the mast height; survival-heater energy E = P_heater T_dark (20 W,
assumption). Radiative equilibrium of an isolated Sun-facing plate in sunlight: T_eq = [α S f☉ cos i / (ε σ)]^¼
(α 0.9, ε 0.85, assumptions). In shadow the UI shows "radiating to deep space — heaters required", never an invented
night temperature. No conduction, terrain infrared or internal dissipation.

## 12. Who blocks the Sun, compass, directions, seasons (§6.12, §7.12, §7.13)

- **Who blocks the Sun**: for every night ≥ 1 h, the Sun azimuth at its midpoint; if the Sun's upper limb is below
  the smooth-sphere horizon the cause is the lunar limb, otherwise the terrain at the stored horizon distance.
- **Illumination compass**: live 240 m masks at 8 neighbours 500 m away; sunlit fraction (hourly) vs the site.
- **Moon Directions**: A* on the 240 m slope grid (central differences, true-scale gradient), 8-connected, cost =
  length × (1 + (slope / 10°)²), cells above 20° forbidden (assumptions), straight-line heuristic (admissible); sunlit
  flag per node from one ray toward the Sun azimuth. Walking time at 2 km/h (assumption). Check: V20.
- **Seasons**: hourly Sun visible fraction and DTE over 12 lunations, binned by lunation × day of lunation.

## 13. What is not modelled (shown in the UI)

Light reflected by terrain, temperature effects on cells, dust, lander self-shadowing, antenna patterns and link
closure, leg stroke, crush cores, plume–surface interaction, soil failure, rocks smaller than a DEM pixel. Horizons from
the 240 m DEM differ from 80 m-based ones by up to ~3° (report O2_240m); custom sites and candidate grids are
therefore "screening resolution" with confidence at most B.
