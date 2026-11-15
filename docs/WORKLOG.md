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

## 2026-11-15 11:12 — resume (same session, lock refreshed)
- Preflight: pgda.gsfc.nasa.gov, ssd.jpl.nasa.gov, trek.nasa.gov now answer 200 (network opened by the owner).
  GitHub Pages still 404 (owner action pending, D13).
- Plan: V11 vs JPL Horizons (DSN Moon elevation, ≥ 200 instants); fetch LOLA 80 m + _ERR, run O2 against the v1
  masks; move candidate grids to the 80 m + 240 m cascade if O2 passes; re-read resources (challenge Resources tab,
  Moon Trek polar layers, QuickMap, Gazetteer, CSA) and update RESOURCES.md; then V18 from published accounts.

## 2026-11-15 ~12:00 — progress (same session)
- Done since 11:12: V11 vs JPL Horizons (0.0005°), O2 on LOLA 80 m (0.0010°), V18 documented (ISRO/NASA quotes),
  ephemeris fully SPICE DE440 2017–2031, Moon Trek south-polar layers, 78 IAU features in search, 80 m live terrain
  windows, IM-1 mask recomputed on 80 m (v1 defect 1), RESOURCES updated.
- The first 80 m candidate-grid rebuild was stopped by the 30-min background limit at ~55 % (nothing written);
  restarted with a 2-h limit. After it: re-run V7, V7b, V17, default-window scan, verify, screenshots.

## 2026-11-15 ~13:20 — redesign + 80 m grids verified (same session)
- Owner asked for a simpler app with a Google-Maps-like 3D Moon at higher resolution: Explore mode rebuilt map-first
  (D21) with a tiled 3D Moon (Moon Trek WAC to zoom 8, LOLA 30/10 m relief on 3D LOLA terrain at the pole, true-Sun
  GPU shadows labelled visual), plain-language answer card, time bar, hover readout; Plan mode keeps the workbench.
- Owner asked whether the Top 3 uses the mission date: yes — demonstrated with `web/scripts/date-dependence.ts` and an
  e2e test (Earth libration drives feasibility: 0 options on 27 Dec 2026, 552–615 on 11 Dec / 10 Jan).
- 80 m candidate grids: V7 0.0047°, V7b 0.81 pp, V17 pass; V14 21 artifacts identical. `npm run verify` all PASS
  (28 Vitest, 9 pytest, 40 Playwright). Objectives 54 met, V12 blocked (manual), P13 failing (Pages not enabled).
