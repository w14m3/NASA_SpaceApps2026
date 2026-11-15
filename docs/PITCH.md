# Pitch — 5 slides

1. **The problem** — At the lunar south pole the Sun skims the horizon and Earth wobbles near it. Computed example
   (Malapert, Bussey M1, 60 days from 2026-12-11): a 2 m mast sits through a 286-hour night set by ground 0.1 km
   away; at 10 m the longest night is 2 hours. Schedules slip; teams must re-plan fast. Existing tools are built for
   detailed analysis, not rapid comparison.
2. **Sightline** — "Google Maps for the Moon": pick a region and a date, get three landing options in seconds — safe,
   powered, in contact — and see why. Live screenshot of the Top 3 and the polar map.
3. **How it works** — LOLA laser-altimetry terrain horizons, JPL ephemerides, DSN geometry, energy with survival
   timeline, tip-over screening; science and engineering constraints feed a transparent score; Mission Brief.
4. **Why trust it** — Validation matrix generated from tests: ephemeris vs SPICE 2.7e-5°, vs Horizons 2.7e-5°; horizon
   algorithm identical to the validated reference; energy within 3.6e-6 % of a 1-minute reference over a year;
   uncertainty and assumptions on screen.
5. **Impact and next steps** — For planners, educators and the public (offline PWA, EN/FR, accessible). Next: LOLA 5 m
   site DEMs for lander-scale hazards, Moon Trek polar tiles, relay coverage. Open source (MIT); not endorsed by NASA.
