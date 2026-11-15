# Decisions taken without the owner

Newest last. Each entry: decision · reason · consequence. Contract rule R10 / AGENTS rule 12.

- **D1 (2026-11-15 01:43) — Watchdog session took the lock.** No `docs/LOCK.md` existed on `main`; the session is
  the only worker. Lock heartbeat refreshed every loop iteration.
- **D2 — Network fallback (contract §9.7).** The environment's network policy refuses every NASA/JPL/USGS/CSA/ASU
  host (preflight in WORKLOG; `CONNECT tunnel failed, response 403`). Per the owner's instruction not to wait for
  approvals, the session does not block on a network-access request; it builds from `reference/v1` artifacts and PyPI.
  The owner can add the Appendix A domains (cloud environment → Network access) so a later session can fetch the
  80 m / 20 m / 5 m LOLA products and SPICE kernels.
- **D3 — Ephemeris before 2026 from JPL DE421 via PyPI.** The `de421` package (2008.1, sha256 `a66faf7b…`) contains
  the DE421 Chebyshev series including lunar librations. The pipeline rebuilds apparent (`LT+S`) Sun/Earth vectors in
  MOON_ME from it. Measured against the SPICE DE440 oracle of v1 over 2026–2031 (3,000 random instants): max
  1.6e-5° (Earth and Sun). Runtime ephemeris = DE421 piece 2017-01-01 → 2026-01-01 + SPICE DE440 piece
  2026-01-01 → 2031-01-03 (v1 artifact, unchanged). The DE421–DE440 MOON_ME offset is therefore quantified as
  ≤ 1.6e-5° in direction (≈ 0.5 m at the lunar surface).
- **D4 — PA→ME composition order fixed by the oracle.** The DE421 PA→ME angles (67.92″, 78.56″, 0.30″ about axes
  3, 2, 1) are applied as the transpose of [a1]₃[a2]₂[a3]₁ (SPICE TKFRAME semantics). The other compositions disagree
  with the DE440 oracle by 0.029–0.058°, the chosen one by 1.6e-5°; recorded by `test_pa_to_me_convention`.
