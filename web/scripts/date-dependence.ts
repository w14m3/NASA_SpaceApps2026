// Shows that the Top 3 depends on the mission window (Sun/Earth geometry at those dates), not on "every date".
import { rankCandidates, DEFAULT_CONSTRAINTS, PERSONAS } from '../src/core/top3'
import { LANDERS } from '../src/core/safety'
import { DSN } from '../src/core/stations'
import { subPoint } from '../src/core/topo'
import { testEphemeris, testGrid } from '../src/core/testdata'
const eph = await testEphemeris()
const g = testGrid('connecting-ridge')
const DAY = 86_400_000
for (const d of ['2026-12-01', '2026-12-11', '2026-12-21', '2026-12-27', '2027-01-10']) {
  const t0 = Date.parse(d + 'T00:00:00Z')
  const r = rankCandidates({ grid: g, heightIndex: 1, eph, t0, t1: t0 + 14 * DAY, stations: DSN, lander: LANDERS.medium, constraints: DEFAULT_CONSTRAINTS, weights: PERSONAS.balanced, minSeparationKm: 1 })
  const se = subPoint(eph, 'EARTH', t0 + 7 * DAY)
  const ss = subPoint(eph, 'SUN', t0 + 7 * DAY)
  console.log(`${d} +14 d | sub-Earth lat ${se.lat.toFixed(1)}° | sub-Sun lon ${ss.lon.toFixed(0)}° | feasible ${String(r.feasibleCount).padStart(4)} | ` +
    (r.top.length ? r.top.map((o, k) => `${'ABC'[k]}: #${o.i} sun ${Math.round(o.lit * 100)}% DTE ${Math.round(o.dte * 100)}% score ${Math.round(o.combined)}`).join(' | ') : `no option (DTE fails for ${r.failedCounts.dte ?? 0} of ${g.n})`))
}
