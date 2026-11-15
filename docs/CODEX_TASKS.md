# Codex task plan — paste these messages in order

## Local mode on your PC (Windows) — read first
1. Install Git (with Git Bash), Python 3.11+ ("Add to PATH" checked), Node.js 20+ LTS, and Codex (app, CLI or IDE
   extension). Sign in with your ChatGPT account.
2. Copy the settings of `codex/config.toml.example` into `%USERPROFILE%\.codex\config.toml` (model, reasoning
   effort, workspace-write sandbox, **network access on**).
3. Open the repository folder in Codex (CLI: open a terminal in the folder and run `codex`).
4. A "task" below = one Codex session started with the message. When it ends: check the summary, push to GitHub
   (GitHub Desktop → Push) so the site redeploys, then start the next task in a new session.
5. **Parallel tasks locally** (T1 + T2, T4 + T4b): create a second working folder with
   `git worktree add ../sightline-t2 -b t2-ui`, open it in a second Codex session, and merge the branch into `main`
   when both are done (`git merge t2-ui`). If this feels risky, run them one after the other instead.
6. Keep the PC awake (Windows: Settings → System → Power → Sleep: Never while plugged in).

For **T0 locally**, add this first line to the message: "Local mode on Windows: run `python codex/setup.py` first,
then continue."


How it works: each message starts one Codex cloud task on the current `main`. When a task finishes, read its summary,
create the pull request, merge it, then start the next task. Tasks marked **parallel** can run at the same time
because they own disjoint directories. Times are Europe/Paris targets; if you start later, keep the order and the
**19:59 feature freeze**.

Every message below already includes the standard opening:
"Read AGENTS.md and docs/MASTER_PROMPT_CODEX.md in full." and closing:
"Run the work loop until these objectives are met or the time box ends. End with the task summary of §0.6."

---

## T0 — Foundation and safety net · ~1 h · owns everything except `reference/`

```
Read AGENTS.md and docs/MASTER_PROMPT_CODEX.md in full. Execute task T0 of docs/CODEX_TASKS.md.
Scope: preflight (§9.1) and record results in docs/WORKLOG.md; read reference/v1 in full and write
docs/REFERENCE_AUDIT.md; seed docs/OBJECTIVES.md with every objective of §11.1 and every validation row of §10;
create scripts/objectives.mjs and the root `npm run verify` gate (§11.6, §8); scaffold pipeline/ and web/ (React +
TypeScript + Vite) with empty test suites that pass; freeze the shared interfaces in web/src/core/api.ts and
docs/ARTIFACTS.md (§1.5); add a CI workflow running `npm run verify`; add a GitHub Pages workflow on main that, for
now, builds and publishes reference/v1/web as the safety-net site; start docs/RESOURCES.md by reading the four
NASA-provided links of §4.1 and answering questions Q1–Q6 of §4.3 as far as possible.
Objectives: P13 (safety net workflow ready), P12 (started), all scaffolding and gates green.
Time box: 1 hour. Run the work loop until these objectives are met or the time box ends. End with the task summary
of §0.6.
```
After merging: in the GitHub repository, Settings → Pages → Source: **GitHub Actions**. Check the URL works.

---

## T1 — Science core from zero · ~4 h · **parallel with T2** · owns `pipeline/`, `web/src/core/`, `data/validation/`

```
Read AGENTS.md and docs/MASTER_PROMPT_CODEX.md in full. Execute task T1 of docs/CODEX_TASKS.md.
Scope: rebuild the science core from zero (§7) against the reference oracles (§10): SPICE ephemerides and Chebyshev
runtime 2017-01-01 → 2031-01-03; Moon-in-ITRF93 Chebyshev for ground stations; multi-resolution horizon cascade
with uncertainty, near_share and confidence grade; disk visibility, events, energy with adaptive integration;
connectivity primitives (station elevation, DTE, FSPL, pointing envelope). Implement the functions declared in
web/src/core/api.ts without changing their signatures. Produce the artifacts described in docs/ARTIFACTS.md.
You own pipeline/, web/src/core/, data/validation/. Do not edit web/src/ui/, web/src/state/, web/src/workers/.
Objectives: O1, O2, V1, V2, V3, V4, V5, V6, V8, V9, V10, V11, V19, C10.
If a re-implemented module cannot match its oracle within the time box, port the reference module, keep the oracle
test and log the deviation (§1.3).
Time box: 4 hours. Run the work loop until these objectives are met or the time box ends. End with the task summary
of §0.6.
```

## T2 — Moon Maps product shell · ~4 h · **parallel with T1** · owns `web/src/ui/`, `web/src/state/`, `web/src/workers/`, `web/e2e/`

```
Read AGENTS.md and docs/MASTER_PROMPT_CODEX.md in full. Execute task T2 of docs/CODEX_TASKS.md.
Scope: build the product shell of §6.3 and §6.5 from zero: three-column layout from docs/design/reference_mockup.png
(layout only), Explore / Plan / Learn modes, Globe (Cesium, Moon Trek imagery, time-aware lighting), South-pole map
(Moon Trek south-polar tiles if available per RESOURCES.md, else LOLA hillshade), search (site names, IAU feature
names from the USGS Gazetteer, coordinates), layers panel, place card, timeline dock, URL state, EN/FR dictionary,
Web Worker plumbing. Use web/src/core/api.ts; until T1 lands, call a mock that returns values computed from
reference/v1/web/public/data so the UI shows real numbers, clearly marked as reference data in a dev badge.
You own web/src/ui/, web/src/state/, web/src/workers/, web/e2e/. Do not edit web/src/core/ or pipeline/.
Objectives: C1, C3, C7 (globe + polar map), P2, P1 (shell part), e2e golden-path skeleton.
Time box: 4 hours. Run the work loop until these objectives are met or the time box ends. End with the task summary
of §0.6.
```
Merge T1 first, then T2 (resolve nothing by hand: directories are disjoint).

---

## T3 — Integration and Site Workbench · ~4 h · owns `web/`, `docs/`

```
Read AGENTS.md and docs/MASTER_PROMPT_CODEX.md in full. Execute task T3 of docs/CODEX_TASKS.md.
Scope: replace the mock with the real core; switch the Pages workflow from reference/v1 to the new app; Site
Workbench (§6.7) with verdict sentence, scores with confidence grade, countdowns with ±, sky plot with uncertainty
band and libration loop, metrics with definitions; floating Solar-elevation and Direct-to-Earth cards; compare view
(§6.12) with overlaid sky plots and deltas; date slip; default scenario snapshot; golden path end to end.
Objectives: C1–C9, C11, P1, P13 (new app live).
Time box: 4 hours. Run the work loop until these objectives are met or the time box ends. End with the task summary
of §0.6.
```

## T4 — Decide: safety, Top 3, energy, Earth link · ~4 h · owns `pipeline/`, `web/`

```
Read AGENTS.md and docs/MASTER_PROMPT_CODEX.md in full. Execute task T4 of docs/CODEX_TASKS.md.
Scope: hazard windows from LOLA 5 m (product 78) and 20 m; landing safety (§7.10) with safety gauge and plain
sentence; candidate grids per hero region (§7.11); Top 3 engine, Pareto view, crew choice, Mission Brief (§6.11,
§6.14); solar-energy efficiency module with optimizers, survival timeline and headline vs baseline (§6.8); Earth
connectivity module with DSN and custom stations, DTE windows, antenna-pointing optimizer, FSPL, interference flag
(§6.9).
Objectives: P4, P5, P6, P7, P16, C13, C14, V15, V16, V17, V7, V7b. Include the challenge-driven additions of §6.15 items 1, 2 and 4.
Time box: 4 hours. Run the work loop until these objectives are met or the time box ends. End with the task summary
of §0.6.
```

## T4b — Product documents · ~1.5 h · **parallel with T4 or T5** · owns `docs/PRODUCT.md`, `docs/SUBMISSION.md`, `docs/DEMO_SCRIPT.md`, `docs/PITCH.md`, `web/src/ui/learn/content/`

```
Read AGENTS.md and docs/MASTER_PROMPT_CODEX.md in full. Execute task T4b of docs/CODEX_TASKS.md.
Scope: write docs/PRODUCT.md (verify every competitor claim on its public page), docs/SUBMISSION.md, docs/DEMO_SCRIPT.md
(2 minutes, mapped to Impact, Creativity, Validity, Relevance, Presentation), docs/PITCH.md (5 slides), and the Learn
mode content (guided tour, glossary, CSA/NASA context cards written in our own words with credits) as data files in
web/src/ui/learn/content/. Only these paths.
Objectives: P14 (documents), C9 (Learn content).
Time box: 1.5 hours. Run the work loop until these objectives are met or the time box ends. End with the task summary
of §0.6.
```

---

## T5 — Value-added layers and differentiators · until ~18:00 · owns `pipeline/`, `web/`

```
Read AGENTS.md and docs/MASTER_PROMPT_CODEX.md in full. Execute task T5 of docs/CODEX_TASKS.md.
Scope, in this order (apply the cut list of §12 if late): value-added layers of §6.4; Site 3D view with true-Sun
shadows (§6.6); Who blocks the Sun (§7.13); Moon Street View; lander attitude slider; mission replay for
Chandrayaan-3, IM-1, IM-2 (V18); lunar porkchop plot; illumination compass; Moon Directions (§7.12, V20).
Objectives: P3, P8, P9, P10, P11, C12, V18, V20, then the season view (§6.15 item 3) and P17 if time remains.
Time box: until 18:00 Europe/Paris. Run the work loop until these objectives are met or the time box ends. End with
the task summary of §0.6.
```

## T6 — Proof and polish · until 19:59 (feature freeze) · owns everything except `reference/`

```
Read AGENTS.md and docs/MASTER_PROMPT_CODEX.md in full. Execute task T6 of docs/CODEX_TASKS.md.
Scope: hostile self-review of the whole product (§11.5) and fixes; accessibility (axe), Lighthouse, mobile 390 px,
performance budgets; Trust page with generated validation, TRACEABILITY, METHODS with every equation and constant
source; README with screenshots; Judge pass (§11.4) and its top fixes; final deploy check on the public URL.
Objectives: V13, V12 (documented), P13, P14, P15 (PWA), re-check of the Resources tab (§6.15 item 7), and every remaining unmet objective that fits.
Time box: until 19:59 Europe/Paris — feature freeze. Run the work loop until these objectives are met or the time box
ends. End with the task summary of §0.6.
```

## T7 — Fix-only and submission support · 19:59 → 23:00

```
Read AGENTS.md and docs/MASTER_PROMPT_CODEX.md in full. Execute task T7 of docs/CODEX_TASKS.md.
Feature freeze is active: fix only bugs found on the public URL, update docs and screenshots, and prepare the final
submission text (docs/SUBMISSION.md) and the demo shot list (docs/DEMO_SCRIPT.md) with the real URL and real numbers.
Time box: until 23:00 Europe/Paris. End with the task summary of §0.6.
```

---

## Resume message (any time a task stops early)

```
Read AGENTS.md and docs/MASTER_PROMPT_CODEX.md, follow the resume protocol of §11.2 and continue with the next unmet
objectives of the current task. Same ownership and time box as before. End with the task summary of §0.6.
```
