# Submission text — NASA Space Apps Challenge 2026, "Lunar Landing Site Navigator"

**Project name**: Sightline — Lunar Landing Site Navigator
**Public URL**: https://w14m3.github.io/NASA_SpaceApps2026/ (GitHub Pages; see "Deployment status" in `docs/WORKLOG.md`)
**Repository**: https://github.com/w14m3/NASA_SpaceApps2026

## Summary (≈ 200 words)

Sightline is a "Google Maps for the Moon" for the lunar south pole. Pick a region and a date: in seconds it ranks
3,721 candidate landing spots per 15 × 15 km region and proposes three options for the crew — safe to touch down,
powered by the Sun, in contact with Earth — and explains each choice in plain language. At the pole the Sun skims
the horizon and Earth wobbles near it, so terrain decides everything: Sightline computes real terrain horizons from
NASA LOLA laser altimetry, Sun and Earth positions from JPL ephemerides, direct-to-Earth windows with the Deep Space
Network, solar energy with a battery survival timeline, and a landing tip-over screening. Planners slip the date by
a day or a lunar day, change constraints and lander, compare site-date scenarios and print a Mission Brief that both
science and engineering teams sign. Educators get a guided tour, a first-person Street View with the Sun and Earth
at true size, a 3D view lit by the real Sun, and the "Land it!" game. Every number comes from a tested science core:
the browser ephemeris matches rigorous SPICE to 2.7e-5° and cached JPL Horizons to 2.7e-5°; uncertainty bands,
confidence grades and assumptions are shown where the numbers are. Free, static, offline-capable, in English and
French.

## Long description

**The problem.** South-pole missions face extreme lighting and communication constraints, and schedules slip. The
tools that hold the data (QuickMap, Moon Trek, Horizons) are built for detailed analysis; comparing many site-date
combinations quickly is hard for non-specialists.

**What Sightline does.**
- *Answer first*: opens on a computed scenario (Connecting Ridge region, 14 days from 2026-12-11, generic medium
  lander, 10 m mast) with the Top 3 already ranked; 747 of 3,721 candidates pass the default constraints.
- *Moon Maps*: polar map with computed layers (mean illumination, longest night, zero-illumination cells, Earth
  visibility, direct-to-Earth, slope, viability index, mast gain, live lighting and shadows, Sun/Earth rays),
  search by name or coordinates, click-anywhere analysis, a 3D globe with Moon Trek imagery lit by the true Sun,
  Site 3D with real-time shadows, and Street View.
- *Power*: array layouts and mast heights, an optimiser with the headline "optimised layout delivers +X % energy and
  shortens the worst blackout by Y h versus the best fixed vertical panel at 2 m", storage and survival timeline.
- *Earth link*: DSN Goldstone, Madrid and Canberra plus a user station, direct-to-Earth windows with countdowns,
  antenna pointing envelope, path loss per band, solar-interference flag — labelled geometric feasibility, not link
  closure.
- *Safety*: plane-fit slope at a stated baseline, roughness, tip-over margin and critical sideways speed, a seeded
  landing-ellipse Monte Carlo — labelled screening estimates.
- *Why*: Who blocks the Sun (which ridge, how far), the illumination compass ("snap to best within 500 m"), Moon
  Directions to the nearest zero-illumination cell, a 12-lunation season heatmap, mission replay (IM-1, IM-2,
  Chandrayaan-3 touchdowns).
- *Decide*: science and engineering constraint panels feed the ranking; "Choose this site" produces a printable
  Mission Brief with both constraint sets, assumptions, uncertainty and provenance.

**How we know it is right.** A validation matrix generated from recorded test output (Methods & Trust page): browser
ephemeris vs SPICE 2.7e-5°; vs 2,012 cached JPL Horizons rows Sun 1.5e-6°, Earth 2.7e-5°; Apollo 11 touchdown Sun
elevation 10.703° (Horizons 10.703°); horizon algorithm identical to the validated v1 code on the same DEM, analytic
terrain cases ≤ 1e-4°, convergence ≤ 0.0102°; event times within 0.5 s of a 1 s brute-force scan; energy within
3.6e-6 % of a one-minute reference over 365 days; station geometry within 0.0022° of an independent astropy chain;
Top 3 deterministic, feasible and ≥ 1 km apart; A* routes identical to Dijkstra.

**Honest limits.** Built without access to NASA servers from the build machine: terrain for custom sites and candidate
grids is LOLA 240 m (horizons can differ by ~3° from 80 m-based ones; curated south-pole sites use validated 80 m-based
masks); checks against Horizons for ground stations and against the LOLA 80 m product use documented substitutes. No
reflected light, thermal or dust effects; lander presets are generic and illustrative. Not endorsed by NASA.

**Data and credits.** NASA LRO/LOLA (GSFC PGDA, Barker et al. 2023), LROC/ASU via NASA Moon Trek, JPL/NAIF SPICE and JPL
DE421/DE440 ephemerides, JPL Horizons (validation), IERS, DSN station data via NAIF, USGS and CSA (challenge resources).
Code MIT.
