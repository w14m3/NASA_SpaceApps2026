# LOCK — one working session at a time (contract §0.6)

- session: session_01E6ZbLzKgBjZSm5dfrvnAnd (Claude Code on the web, watchdog run)
- session start: 2026-11-15 01:43 CET
- last heartbeat: 2026-11-15 04:59 Europe/Paris
- current objective: L5 — V14 full rebuild running; Lighthouse; final verify

Rule: a new session that finds a heartbeat younger than 45 minutes written by another session appends
"watchdog: active session detected" to docs/WORKLOG.md, pushes and ends.
