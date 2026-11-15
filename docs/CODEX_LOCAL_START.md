# Codex on your PC — start here

Two ways to run the whole project with Codex locally. Both use the same contract (`AGENTS.md` +
`docs/MASTER_PROMPT_CODEX.md`) and the same objectives, lock and log, so you can switch between them.

## 0. Once (10 minutes)
1. Clone the up-to-date repository (do not use an older zip):
   `git clone https://github.com/w14m3/NASA_SpaceApps2026.git` then `cd NASA_SpaceApps2026`
2. Run `git push` once by hand (or push from GitHub Desktop) so Windows stores your GitHub credentials.
3. Copy `codex/config.toml.example` into `%USERPROFILE%\.codex\config.toml` (model, reasoning effort,
   workspace-write sandbox, network access on, automatic review of approvals).
4. Run `python codex/setup.py` (dependencies + NASA data, ~0.8 GB, resumable).
5. If Codex offers to set up the Windows sandbox, accept (`/setup-default-sandbox`).
6. If another agent works on the same repository (for example a Claude Code scheduled task), pause it: one agent at a
   time. The lock file `docs/LOCK.md` prevents most collisions, but not all.

## A. Interactive (Codex app or `codex` in a terminal) — paste this message

```
You are working locally in the owner's clone of github.com/w14m3/NASA_SpaceApps2026 on Windows, in full autonomy.
1. If data/cache/SHA256SUMS is missing, run `python codex/setup.py`.
2. Read AGENTS.md and docs/MASTER_PROMPT_CODEX.md in full — they are the binding contract — then docs/OBJECTIVES.md,
   docs/WORKLOG.md, docs/LOCK.md and the last 20 commits if they exist.
3. Apply the lock rule of contract §0.7, then the resume protocol of §11.2.
4. Execute the tasks of docs/CODEX_TASKS.md in order — T0, T1, T2, T3, T4, T4b, T5, T6 — sequentially in this folder
   (no worktrees), skipping objectives already met; after the 19:59 Europe/Paris feature freeze run T7 only.
5. Run the work loop of AGENTS.md continuously. After every iteration: update docs/LOCK.md, commit,
   `git pull --rebase origin main`, `git push origin HEAD:main`. If a push fails, continue and note it.
6. Never ask me anything and never wait for approval: take documented defaults (docs/DECISIONS.md) and list questions
   in docs/WORKLOG.md.
7. Do not end your turn while unmet objectives remain and the freeze has not passed: when a task ends, append its
   summary (§0.6) to docs/WORKLOG.md and start the next task immediately.
8. Quality bar: oracle tests against reference/v1, every UI number traceable to the core and its tests, hostile
   self-review at each phase end (§11.5), objective statuses only from `npm run objectives`.
9. When every objective is met, create docs/ALL_OBJECTIVES_MET. Before ending for any reason: commit, push, and
   write the exact resume point at the end of docs/WORKLOG.md.
```
In the session, set permissions to automatic review (`/permissions` → "Approve for me") so approval requests are
reviewed automatically instead of waiting for you. If the session stops, send:
`Follow the resume protocol of §11.2 and continue exactly where docs/WORKLOG.md says. Same rules as before.`

## B. Autopilot (most autonomous) — one command, restarts Codex until the deadline

```
powershell -ExecutionPolicy Bypass -File codex\autopilot.ps1
```
The script runs `codex exec` (non-interactive: it never asks for approval) in the workspace-write sandbox with network
access, using the prompt in `codex/autopilot_prompt.txt`. Between runs it commits leftovers, pulls and pushes to
`main`, then starts the next run, until 23:30 Europe/Paris or until `docs/ALL_OBJECTIVES_MET` exists. Logs:
`data/autopilot/run-*.log`. Options: `-Model gpt-6-astra`, `-StopAt "2026-11-15T23:30:00"`, `-PauseSeconds 120`.
Stop it any time with Ctrl+C. Keep the PC awake (Settings → System → Power → Sleep: Never).

## After the first push
GitHub → Settings → Pages → Source: **GitHub Actions**. Every push to `main` then redeploys the site.
