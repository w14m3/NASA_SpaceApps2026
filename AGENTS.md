# AGENTS.md — Sightline (Lunar Landing Site Navigator) · NASA Space Apps 2026

You are building, from zero, a professional "Google Maps for the Moon" that answers, for any south-pole site and
date: **Can it land safely? Can it make power? Can it talk to Earth? Which three sites should the crew choose, and
why?** Focus areas: **solar-energy efficiency** and **connectivity with Earth**. Credible, validated physics.

## The contract
- **Read `docs/MASTER_PROMPT_CODEX.md` in full at the start of every task.** It is the binding specification
  (product, physics, validation, objectives, plan). This file only summarises it.
- Task messages, in order: `docs/CODEX_TASKS.md`. Objectives and their evidence: `docs/OBJECTIVES.md`.
  Running log: `docs/WORKLOG.md`. Decisions taken without the owner: `docs/DECISIONS.md`.
- Deadline: **Sunday 15 Nov 2026, 23:59 Europe/Paris. Feature freeze 19:59.** Check the current Europe/Paris time (cross-platform: `node -e "console.log(new Date().toLocaleString('en-GB',{timeZone:'Europe/Paris'}))"`) at the start of every loop iteration.

## Repository map
- `reference/v1/` — earlier validated implementation. **Read-only.** Specification and test oracle, not source.
- `pipeline/` — new Python pipeline (SPICE, LOLA, horizons, hazards, candidates, layers).
- `web/` — new React + TypeScript + Vite app; `web/src/core/` is framework-free science; `web/src/core/api.ts` and
  `docs/ARTIFACTS.md` are frozen interfaces shared by parallel tasks.
- `data/cache/` — NASA downloads from `codex/setup.sh` (git-ignored). `data/validation/` — recorded test results.
- `docs/` — contract, challenge text, UI mockup (`docs/design/reference_mockup.png`, layout only), generated docs.

## Commands
- Setup: `python codex/setup.py` (local PC, any OS) or `bash codex/setup.sh` (Codex cloud environment).
  Data only: `python codex/fetch_nasa_data.py` (resumable).
- Full gate (create in T0, keep green): `npm run verify` at the repo root = lint + typecheck + Vitest + offline
  pytest + build + Playwright e2e + `npm run objectives`.
- Objective statuses: `npm run objectives` (computed from test reports; never edit the status column by hand).

## Local mode (the owner runs Codex on a Windows PC)
- There is no setup phase: at the start of T0, and whenever `data/cache/SHA256SUMS` is missing, run
  `python codex/setup.py`. Use `python`, not `python3`, in instructions for the owner.
- Every project script must be cross-platform (Node or Python). No bash-only commands in npm scripts or docs.
- Commit at the end of every loop iteration. At the end of every task run `git push` if a remote and credentials are
  configured; otherwise tell the owner to push (GitHub Desktop) so GitHub Pages redeploys.
- Parallel tasks run in separate git worktrees (see `docs/CODEX_TASKS.md`), never in the same folder.

## Non-negotiable rules
1. Priority: scientific truthfulness > numerical correctness > interactivity and clarity > polish > feature count.
2. No fabricated data: every coordinate, constant, default and citation has a source; otherwise "unverified".
3. Read a resource before integrating it; log the decision in `docs/RESOURCES.md`. No scraping (QuickMap included).
4. Show uncertainty and assumptions in the UI. Illumination ≠ electrical power. Geometric visibility ≠ link closure.
   Safety outputs are screening estimates with their DEM baseline.
5. Never display a number the core did not compute. The mockup's numbers are wrong for the pole. Label every visual
   exaggeration on screen.
6. No NASA insignia or implied endorsement. Credit NASA, LRO/LOLA, LROC/ASU, Moon Trek, JPL/NAIF, USGS, CSA in text.
7. No invented lander specifications: generic presets, every parameter labelled as an assumption.
8. Deterministic results (seeded randomness, stable sorts). The same URL gives the same result.
9. Never weaken a test or tolerance to make it pass without a `docs/DECISIONS.md` entry.
10. No secrets, no paid keys. Never commit files > 25 MB, raw DEMs or kernels.
11. Never edit `reference/`. Never edit a directory owned by another parallel task (see `docs/CODEX_TASKS.md`).
12. Do not stop to ask the owner: choose a documented default, record it, and list questions in the task summary.

## Work loop (run until this task's objectives are met)
1. Time check; read `docs/OBJECTIVES.md` and `docs/WORKLOG.md`; run the preflight (contract §9.1).
2. Pick the highest-priority unmet objective assigned to this task.
3. Write a 3–6 line plan in `docs/WORKLOG.md`.
4. Implement the smallest complete increment. Physics: failing test first, then code; compare with the
   `reference/v1` oracles (contract §10, O1–O2).
5. Run `npm run verify`. Fix until green.
6. Self-review against the Definition of Done and the rules above.
7. Commit with the objective IDs in the message. Go to 1.
An objective failing three consecutive iterations → mark it blocked in WORKLOG with the reason, apply the documented
fallback, move on. At the end of each phase run the hostile self-review (contract §11.5) and the Judge pass (§11.4).

## Definition of Done
Acceptance criterion met with evidence · tests pass · no console errors · keyboard accessible · EN and FR strings ·
every number has a definition and units · assumptions labelled · performance budgets met · docs updated.

## Task summary (end of every task)
Objectives met with evidence · `npm run verify` result · failures and unknowns · deviations and why · questions for
the owner · the exact message for the next task · time used vs time box.

## Pull request message
Title: `[Tn] <phase> — <objectives met>`. Body: the task summary, then "How to check" (URL path, steps).
