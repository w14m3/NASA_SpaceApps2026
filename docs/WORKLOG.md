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

## 2026-11-15 04:45 — resume (same session, after a usage-limit pause; lock refreshed)
- State: objectives 42 met / 56; verify green except typecheck fixed after the last run.
- Plan L4 (this iteration): Who blocks the Sun (C12, §7.13) + illumination compass (C12) in the workbench;
  Moon Directions A* with V20 (P9); PWA manifest + service worker (P15); "Land it!" (P17); then L5 docs
  (METHODS, RESOURCES, TRACEABILITY, PRODUCT, SUBMISSION, DEMO_SCRIPT, PITCH, README) and the deploy check.

## 2026-11-15 05:00 — phase report L3–L5 (same session)
- Built: Top 3 engine + candidate grids (4 regions × 3,721), constraints panels, Mission Brief, compare with site-date
  scenarios and seasons, Who blocks the Sun, compass, Moon Directions, Land it!, PWA, Trust page, docs.
- Verified: `npm run verify` green (lint, typecheck, 27 Vitest, 8 pytest, build, 36 Playwright e2e incl. axe and
  offline). Objectives 50 met / 56 before V14; blocked O2, V11, V18 (unreachable hosts) with substitutes.
- Deploy: CI builds and uploads; deploy step 404 until the owner enables GitHub Pages (D13).
- Review and Judge pass: `docs/REVIEW_L5.md`; high-severity findings fixed.

## RESUME POINT (2026-11-15 ~05:10)
- Done: L0–L5 scope built and verified; objectives 51 met. Remaining: P13 (owner must enable GitHub Pages →
  then `NODE_USE_ENV_PROXY=1 node scripts/check-deploy.mjs`), V14 full rebuild with `--candidates` (running),
  Lighthouse record (`scripts/lighthouse-record.mjs`). Blocked by unreachable hosts: O2, V11, V12, V18 (substitutes
  recorded).
- Next if time remains before the 19:59 freeze: polish (Street View Sun animation, collapsed workbench sections in
  Explore), re-run Judge pass, keep `npm run verify` green.

## 2026-11-15 ~05:20 — V14 and V13 closed
- V14: `node scripts/rebuild-check.mjs --candidates` rebuilt 25 artifacts (ephemeris, DEM, sites, masks, fixtures,
  4 candidate grids) with identical content hashes.
- V13: Lighthouse 12.8.2 on the built site: performance 91, accessibility 97, best practices 100, SEO 91.
- `npm run verify`: all steps PASS (27 Vitest, 8 pytest, 37 Playwright). Objectives: 51 met, 4 blocked
  (O2, V11, V12, V18 — unreachable hosts, substitutes recorded), 1 failing (P13 — GitHub Pages not enabled: owner action).
