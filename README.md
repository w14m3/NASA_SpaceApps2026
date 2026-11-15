# Sightline — Lunar Landing Site Navigator

NASA Space Apps Challenge 2026 · challenge "Lunar Landing Site Navigator".

This repository is built by an AI coding agent from a written contract:

- **OpenAI Codex**: rules in [`AGENTS.md`](AGENTS.md) (loaded automatically), contract [`docs/MASTER_PROMPT_CODEX.md`](docs/MASTER_PROMPT_CODEX.md), task messages [`docs/CODEX_TASKS.md`](docs/CODEX_TASKS.md), environment setup script `codex/setup.sh`.
- **Claude Code**: contract [`docs/MASTER_PROMPT_V3.md`](docs/MASTER_PROMPT_V3.md).

- `docs/` — the build contract, the official challenge text, the UI reference and the review of the earlier version.
- `reference/v1/` — the earlier, validated implementation, kept read-only as specification and test oracle.

Start in Claude Code on the web with (Codex users: see `docs/CODEX_TASKS.md`, task T0):

> Read docs/MASTER_PROMPT_V3.md in full and execute it. Run the work loop of §11 until every objective in
> docs/OBJECTIVES.md is met or the feature freeze is reached.

---
Original repository description: "for nasa's hackathon".
