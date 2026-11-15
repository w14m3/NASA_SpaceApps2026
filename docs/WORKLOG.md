# WORKLOG — Sightline

Times are Europe/Paris. Newest entries at the bottom. The **resume point** is always the last "RESUME POINT" block.

## 2026-11-15 01:43 CET — session session_01E6ZbLzKgBjZSm5dfrvnAnd (watchdog run)
- No docs/LOCK.md, OBJECTIVES.md or WORKLOG.md existed on main (HEAD 4b0645e): no active session. Lock taken.
- Starting phase L0 from zero (contract V3 §12).

## 2026-11-15 01:54 CET — L0 preflight
- Tools: Python 3.13.18, Node v22.23.4, npm 10.9.9, Playwright 1.63.0 + Chromium 1243 preinstalled; 4 CPU,
  15 GB RAM, ~30 GB free disk.
- Reachability (curl -I via the session proxy): **blocked (403 CONNECT)** for every Appendix A domain:
  www.spaceappschallenge.org, www.asc-csa.gc.ca, ssd.jpl.nasa.gov, ssd-api.jpl.nasa.gov, trek.nasa.gov,
  quickmap.lroc.asu.edu, www.lroc.asu.edu, naif.jpl.nasa.gov, pgda.gsfc.nasa.gov, core2.gsfc.nasa.gov,
  pds-geosciences.wustl.edu, planetarynames.wr.usgs.gov, svs.gsfc.nasa.gov, nssdc.gsfc.nasa.gov, www.nasa.gov,
  science.nasa.gov, zenodo.org. **Reachable**: registry.npmjs.org, pypi.org, files.pythonhosted.org, github.com.
- **Owner action (optional)**: add the Appendix A domains to this cloud environment's allowed hosts so a later
  session can fetch SPICE kernels and the LOLA 80/20/5 m products. Until then: fallback D2/D3.
- Plan L0: REFERENCE_AUDIT ✔, OBJECTIVES ✔ (status computed by scripts/objectives.mjs), DECISIONS, RESOURCES,
  scaffold (root verify, web Vite/React/TS, pipeline), CI + Pages deploy.
- DE421 (PyPI) → MOON_ME matches the v1 SPICE DE440 oracle to 1.6e-5° (D3, D4).
