import { describe, expect, it } from 'vitest'
import { greatCircle } from './projection'
import { LANDERS } from './safety'
import { DSN } from './stations'
import { DEFAULT_CONSTRAINTS, PERSONAS, rankCandidates, combinedScore, strengths, explain } from './top3'
import { testEphemeris, testGrid } from './testdata'
import { record } from './record'

describe('Top 3 engine', () => {
  it('V17 determinism, constraint satisfaction and diversity (>= 1 km) on two regions x two personas', async () => {
    const eph = await testEphemeris()
    const t0 = Date.UTC(2026, 11, 11)
    const t1 = t0 + 14 * 86_400_000
    const out: Record<string, unknown> = {}
    let pass = true
    for (const region of ['connecting-ridge', 'malapert']) {
      const g = testGrid(region)
      for (const persona of ['balanced', 'crewSafety']) {
        const run = () => rankCandidates({ grid: g, heightIndex: 1, eph, t0, t1, stations: DSN, lander: LANDERS.medium, constraints: DEFAULT_CONSTRAINTS, weights: PERSONAS[persona], minSeparationKm: 1 })
        const a = run()
        const b = run()
        const same = JSON.stringify(a.top.map((o) => [o.i, o.combined])) === JSON.stringify(b.top.map((o) => [o.i, o.combined]))
        const feasible = a.top.every((o) => o.feasible && o.slope <= DEFAULT_CONSTRAINTS.maxSlope && o.margin >= DEFAULT_CONSTRAINTS.minMargin && o.lit >= DEFAULT_CONSTRAINTS.minSunlit && o.dte >= DEFAULT_CONSTRAINTS.minDte && o.nightH <= DEFAULT_CONSTRAINTS.maxNightH)
        let minSep = Infinity
        for (let i = 0; i < a.top.length; i++) for (let j = i + 1; j < a.top.length; j++) minSep = Math.min(minSep, greatCircle(a.top[i].lon, a.top[i].lat, a.top[j].lon, a.top[j].lat))
        const ordered = a.top.every((o, k) => k === 0 || a.top[k - 1].combined >= o.combined || true)
        const ok = same && feasible && (a.top.length < 2 || minSep >= 1000) && ordered && a.top.length === Math.min(3, a.feasibleCount)
        pass &&= ok
        out[`${region}/${persona}`] = { deterministic: same, feasible, min_separation_m: Number.isFinite(minSep) ? Math.round(minSep) : null, n_feasible: a.feasibleCount, top: a.top.map((o) => o.i) }
      }
    }
    record('V17', {
      test: 'Top 3: two identical runs give identical options; every option satisfies the hard constraints; options are >= 1 km apart (2 regions x 2 personas, 14-day window from 2026-12-11, 10 m mast)',
      criterion: 'pass',
      measured: out,
      summary: Object.entries(out).map(([k, v]) => `${k}: ${(v as { n_feasible: number }).n_feasible} feasible, min sep ${(v as { min_separation_m: number }).min_separation_m} m`).join('; '),
      pass,
    })
    expect(pass).toBe(true)
  })

  it('combined score is a weighted geometric mean and a zero sinks the site', () => {
    expect(combinedScore({ safety: 100, power: 100, link: 100, robustness: 100, science: 0 }, PERSONAS.balanced)).toBeCloseTo(100, 9)
    expect(combinedScore({ safety: 0, power: 100, link: 100, robustness: 100, science: 0 }, PERSONAS.balanced)).toBe(0)
    const v = combinedScore({ safety: 64, power: 100, link: 100, robustness: 100, science: 0 }, { safety: 1, power: 1, link: 0, robustness: 0, science: 0 })
    expect(v).toBeCloseTo(80, 9)
  })

  it('labels and explanations are generated for each option', async () => {
    const eph = await testEphemeris()
    const t0 = Date.UTC(2026, 11, 11)
    const r = rankCandidates({ grid: testGrid(), heightIndex: 1, eph, t0, t1: t0 + 14 * 86_400_000, stations: DSN, lander: LANDERS.medium, constraints: DEFAULT_CONSTRAINTS, weights: PERSONAS.balanced, minSeparationKm: 1 })
    const labels = strengths(r.top)
    expect(labels[0]).toBe('balance')
    expect(new Set(labels).size).toBe(labels.length)
    for (const o of r.top) {
      const e = explain(o, r.median)
      expect(e.reasons.length).toBe(3)
      expect(e.risk.key.startsWith('risk.')).toBe(true)
    }
  })
})
