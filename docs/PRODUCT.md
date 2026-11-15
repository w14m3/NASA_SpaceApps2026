# Product — Sightline, Lunar Landing Site Navigator

`PRODUCT_NAME = 'Sightline'` (one constant in `web/src/ui/TopBar.tsx`). A trademark check is needed before any
commercial use of the name.

## Problem

Missions to the lunar south pole live and die by geometry: the Sun skims the horizon (the Moon's axis is tilted only
about 1.5° to the ecliptic), Earth hovers near the horizon and wobbles with libration, and the terrain decides
everything. When hardware or launch slips, teams must re-evaluate other dates at the same site or other sites in the
same region, quickly. The challenge text notes that the existing tools (QuickMap, Moon Trek, JPL Horizons) "are built
for detailed analysis and are often difficult for non-specialists to use effectively for rapid scenario comparison".

## Promise

*Pick a region and a date. In seconds, get the three best places to land near the lunar south pole — safe to touch
down, powered by the Sun, in contact with Earth — and see why.*

## Users

| User | Job to be done | Where Sightline helps |
|---|---|---|
| Mission planner / systems engineer | Re-plan a landing after a slip; defend a site choice | Top 3 with constraints, ±-banded metrics, schedule slip, porkchop-style best date, Mission Brief |
| Science team | Keep science goals visible in the trade | Science constraint panel, "Science near ice" persona, distance to zero-illumination cells |
| Power and comms engineers | Size arrays and batteries; check direct-to-Earth windows | Optimiser vs a fair baseline, survival timeline, DSN windows, pointing envelope, path loss |
| Educators and the public | Understand why the pole is hard | Learn mode tour, Street View, "Land it!" game, plain-language verdicts |

## Value proposition

1. **Answer first**: the app opens on a computed default scenario with the Top 3 already ranked (no click).
2. **Trust second**: every number comes from a tested core with recorded validation, uncertainty bands and a
   confidence grade; assumptions are labelled where the number is shown.
3. **Why, not just what**: Who blocks the Sun, the illumination compass and the season view explain why a few hundred
   metres or a few days change everything.

## Competitive landscape (claims limited to what could be verified)

| Tool | What it is (verified source) | Sightline's difference |
|---|---|---|
| LROC QuickMap | Detailed map viewer; challenge text: built for detailed analysis, hard for rapid comparison | Decision-first: Top 3, constraints, Brief; links out to QuickMap |
| NASA Moon Trek | Data portal with WMTS tile services (tile API read by reference/v1) | Uses Moon Trek imagery; adds terrain horizons, power/link/safety screening |
| JPL Horizons | Ephemeris service (API read by reference/v1) | Precomputed, validated against Horizons; works offline in the browser |
| IrisDataLabs Lunar Landing Site API, LUMINA, LunarSafe AI, generalist mission-analysis suites | **Not verified** — their public pages could not be read from the build environment | No comparison claimed until their pages are read |

## Business model options (no market figures invented)

- Free public and education tier (static site, offline PWA for classrooms).
- Mission-team tier: private deployment with higher-resolution DEMs (LOLA 5 m site products), team constraint sets,
  signed Mission Briefs.
- Data/API tier: candidate-grid and horizon-mask products for commercial lander teams.

## Moat

Validated science core (oracle tests against SPICE and Horizons, convergence and analytic checks), one code path for
live and precomputed numbers, and a decision workflow (constraints → Top 3 → Brief) rather than a viewer.

## Roadmap

1. Fetch the LOLA 80 m / 20 m / 5 m products and SPICE kernels (needs network access): grade-A confidence, O2 and V11
   against their real oracles, lander-scale hazards.
2. Moon Trek south-polar tiles and USGS Gazetteer feature search.
3. Relay-satellite coverage (user-supplied orbits, notional) and a fuller link budget.
4. Thermal model with terrain infrared; dust and degradation assumptions.

## Risks

| Risk | Mitigation |
|---|---|
| 240 m terrain misses near-field relief (horizons up to ~3° off) | Labelled "screening resolution", confidence grade, curated sites on 80 m-based masks |
| Unverified literature coordinates | Shown with "coordinate unverified"; region centres say so |
| Users read illumination as power or visibility as link closure | Separated in the UI with explicit labels and assumptions |
| Name conflicts | Single constant; trademark check before commercial use |
