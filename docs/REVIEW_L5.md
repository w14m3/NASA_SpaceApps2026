# Hostile self-review and Judge pass — 2026-11-15 ~05:00 Europe/Paris

## Hostile review (contract §11.5)

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | Wizard says "Vertical, fixed (azimuth optimised)" but the main analysis used a north-facing panel when no azimuth was set | **High** (UI claim not matching the core) | Fixed: `analyseSite` now picks the facing (15° steps) that maximises window energy and the workbench states the azimuth used |
| 2 | "Lunar limb" attribution compared the Sun with the dip for the mast height only; on a 5 km massif the smooth-sphere horizon is ~−4.4° | **High** (wrong cause shown) | Fixed (D12) with a unit test |
| 3 | Top 3 confidence badge always coloured as grade B; boundary 0.25 handled as `>` in places and `<` in the grade function | Medium | Fixed: same `≥ 0.25 → C` rule everywhere |
| 4 | Pitch and demo script used an illustrative "12 km ridge / 40-hour night" | **High** (number not computed) | Replaced with a computed example (`web/scripts/example-blocker.ts`) |
| 5 | Re-derived: horizon ε(s), disk quadrature, tip-over v_crit, FSPL, ERA, plane-fit slope/azimuth sign, polar-stereographic scale factor; units deg/rad, m/km, UTC/TDB | — | No defect found; covered by V4, V9, V16, V11b, V15, V1 |
| 6 | Candidate masks quantised to 0.1° and clipped 25.5° above the lowest horizon | Low | Documented (D10); V7b shows ≤ 0.95 pp effect on sunlit time |
| 7 | Phone layout: DTE card covered the solar card and view tabs | Medium | Fixed (CSS ≤ 700 px) |
| 8 | Deploy job fails (Pages not enabled) | High for P13 | Owner action (D13); CI build is green |

## Judge pass (contract §11.4) — screenshots in `docs/screenshots/` (1440 × 900 and 390 × 844)

| Criterion | Score (1–5) | Evidence | Improvement (ranked by gain per hour) |
|---|---|---|---|
| Impact | 4 | Opens on a ranked Top 3; slip a day and everything re-ranks; Brief for both teams | One-line "why this matters" banner in Explore mode for first-time visitors |
| Creativity | 4 | Street View with true-size Sun/Earth, Who blocks the Sun, compass, Land it! | Animate the Sun along its path in Street View while playing |
| Validity | 4 | Generated validation matrix, uncertainty bands, confidence grades, substitutes for unreachable oracles stated | Fetch LOLA 80 m/5 m when network allows (O2, grade A) |
| Relevance | 5 | Every challenge objective and consideration mapped (TRACEABILITY) | — |
| Presentation | 3.5 → 4 after fixes | Dense but readable; no console errors; phone layout fixed | Collapse workbench sections by default in Explore mode |
