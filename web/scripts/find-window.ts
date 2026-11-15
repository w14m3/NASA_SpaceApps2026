// Finds the "next feasible window" for the default scenario (contract §6.2): the first landing date on or after
// 2026-12-01 where the default region has at least 25 candidates passing every default constraint (14-day window,
// medium lander, 10 m mast). Deterministic; the result is recorded in docs/DECISIONS.md and used as DEFAULT_LANDING.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { parseCandidates } from '../src/core/candidates'
import { HERO_REGIONS } from '../src/core/regions'
import { rankCandidates, DEFAULT_CONSTRAINTS, PERSONAS } from '../src/core/top3'
import { LANDERS } from '../src/core/safety'
import { DSN } from '../src/core/stations'
import { testEphemeris, PUBLIC } from '../src/core/testdata'
const eph = await testEphemeris()
const region = process.argv[2] ?? 'connecting-ridge'
const P = `${PUBLIC}/data/candidates/`
const meta = JSON.parse(readFileSync(P + region + '.json', 'utf8'))
const b = gunzipSync(readFileSync(P + region + '.bin.gz'))
const g = parseCandidates(HERO_REGIONS.find((r) => r.id === region)!, meta, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
for (let d = 0; d < 120; d += 2) {
  const t0 = Date.UTC(2026, 11, 1) + d * 86400e3
  const r = rankCandidates({ grid: g, heightIndex: 1, eph, t0, t1: t0 + 14 * 86400e3, stations: DSN, lander: LANDERS.medium, constraints: DEFAULT_CONSTRAINTS, weights: PERSONAS.balanced, minSeparationKm: 1 })
  console.log(new Date(t0).toISOString().slice(0, 10), 'feasible', r.feasibleCount, 'dteFail', r.failedCounts.dte ?? 0, 'sunFail', r.failedCounts.sunlit ?? 0, r.top[0] ? `best ${r.top[0].combined.toFixed(0)}` : '')
}
