# Space Apps submission material

Drafts for the owner to edit. Numbers quoted here come from this build's recorded test output
(`docs/VALIDATION.md`); re-check them after any rebuild.

## Summary (≈200 words)

Lunar Landing Site Navigator answers the two questions that decide whether a lander survives at the Moon's
south pole: can it make power, and can it talk to Earth? At the pole the Sun and Earth skim the horizon, so a
ridge a few kilometres away decides everything. Existing tools hold the data but are slow for comparing
scenarios.

Our web app lets anyone pick a site and a date and see the answer in seconds. It computes the real terrain
horizon from NASA's LOLA elevation model, places the Sun and Earth with JPL-grade ephemerides, and shows when
each rises and sets, how long sunlight and contact last, and how confident the numbers are. Click anywhere
within ten degrees of the pole and the horizon is computed in your browser. Slip the date by a day or a lunar
day, raise the mast from 2 m to 10 m, change the solar-panel layout, or pin up to four sites side by side.

Every number has a definition one tap away, uncertainty is shown rather than hidden, and a public Trust page
reports our tests: our Sun and Earth directions match JPL Horizons to about a millionth of a degree. The app is
fully static, open source and needs no account.

## Long description (outline)

1. **The problem**: mission dates slip; planners need to re-evaluate a site for a new date, or a nearby site,
   quickly. At the pole the Sun stays within about 1.5° of the horizon, and Earth moves ±6–8° with libration.
2. **What we built**: 3D Moon with real-time lighting; south-pole map; Site Workbench (scores, countdowns, sky
   plot, timeline, compare); panel-layout and mast-height comparison; share links and exports.
3. **How it works**: SPICE → Chebyshev ephemeris in the browser; great-circle horizon marching on the LOLA
   80 m DEM; disk-fraction visibility; bisection for event times. See `docs/METHODS.md`.
4. **Why you can trust it**: the validation table, the uncertainty bands, the honest labels ("smooth sphere —
   no terrain data", "indicative at 2 m"), and the list of limits.
5. **NASA data used**: LOLA/LRO (PGDA south-pole DEMs), LRO WAC mosaic via Moon Trek, NAIF SPICE kernels,
   JPL Horizons for independent checks.
6. **What is next**: Deep Space Network windows and antenna pointing, raster layers (illumination maps,
   permanently shadowed areas), ranked alternatives across neighbouring sites, 20 m DEM for hero sites.

## Two-minute demo script

| Time | On screen | Say |
|---|---|---|
| 0:00 | 3D Moon, press play at 1 d/s | "This is the Moon lit as it is right now. Watch the terminator sweep — except near the south pole, where the Sun just circles the horizon." |
| 0:15 | Switch to South pole, click *Connecting Ridge (site 001)* | "Pick a site. Two answers: power score and link score, and countdowns — the Sun sets in…, Earth rises in…" |
| 0:35 | Hover the sky plot | "This is the real horizon from LOLA topography. The Sun and Earth are drawn at their true size. Hover: this ridge, this far away, sets the horizon here." |
| 0:55 | Click *IM-2 Athena*; point at the timeline and compare table | "Pin a second site. Amber is sunlight, blue is Earth in view. The table flags the better site for each measure." |
| 1:15 | Press *+7 d*, then *+1 lunar day* | "The launch slipped a week? One click re-evaluates everything." |
| 1:30 | Mast 2 m → 10 m; panel layout Flat → Sun-tracking | "Raise the mast, turn the panels vertical: here is how much more energy you collect than a flat panel." |
| 1:45 | Click an empty spot on the polar map | "Any spot near the pole: the horizon is computed in the browser." |
| 1:52 | Methods & Trust page | "And this is why you can believe it: our tests against JPL Horizons, and everything we do not model." |

## Five slides

1. **Title + one sentence**: "Can it make power? Can it talk to Earth? — answered in seconds for any polar site and date."
2. **Why the pole is hard**: Sun within ~1.5° of the horizon; Earth libration; terrain decides.
3. **The product**: one annotated screenshot (map, workbench, timeline).
4. **Trust**: validation table headline numbers; uncertainty band; limits stated in the UI.
5. **Impact and next steps**: who uses it (planners, educators, public); DSN windows, layers, alternatives.
