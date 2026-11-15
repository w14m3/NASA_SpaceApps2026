import { describe, expect, it } from 'vitest'
import { HOUR } from './constants'
import { attribute } from './whoblocks'
import { route, type SlopeGrid } from './traverse'
import { mulberry32 } from './rng'
import { record } from './record'
import { flatMask, type Mask } from './mask'
import { sphereDip } from './topo'

describe('who blocks the Sun', () => {
  it('who blocks: a ridge sets the night when the Sun is above the limb, the limb otherwise', () => {
    const n = 360
    const mid = new Float32Array(n).fill(-0.2)
    const dist = new Float32Array(n).fill(3)
    for (let i = 130; i <= 140; i++) {
      mid[i] = 2.5
      dist[i] = 12.4
    }
    const m: Mask = { n, mid, lo: mid, hi: mid, dist, kind: 'synthetic' }
    const a = attribute(m, 10, { az: 135, el: 1.0, rad: 0.27 })
    expect(a.cause).toBe('terrain')
    expect(a.distKm).toBeCloseTo(12.4, 5)
    expect(a.horizonEl).toBeCloseTo(2.5, 5)
    const b = attribute(flatMask(sphereDip(10)), 10, { az: 20, el: -1.0, rad: 0.27 })
    expect(b.cause).toBe('limb')
    expect(b.distKm).toBeNull()
    // on a 5 km massif the smooth-sphere horizon is near −4.4°: a Sun at −1° is hidden by terrain, not by the limb
    const c = attribute(m, 5000, { az: 135, el: -1.0, rad: 0.27 })
    expect(c.cause).toBe('terrain')
    expect(HOUR).toBe(3_600_000)
  })
})

describe('Moon Directions', () => {
  it('V20 A* matches a brute-force Dijkstra exactly and never crosses a forbidden cell (50 random grids)', () => {
    const rnd = mulberry32(2026)
    let maxDiff = 0
    let forbidden = 0
    let routes = 0
    for (let k = 0; k < 50; k++) {
      const nx = 20 + Math.floor(rnd() * 20)
      const ny = 20 + Math.floor(rnd() * 20)
      const slope = new Float32Array(nx * ny)
      for (let i = 0; i < slope.length; i++) slope[i] = rnd() < 0.15 ? 25 + 10 * rnd() : 18 * rnd() ** 2
      const g: SlopeGrid = { nx, ny, px: 100, slope }
      const s = Math.floor(rnd() * nx * ny)
      const t = Math.floor(rnd() * nx * ny)
      const a = route(g, s, t, 20, 10, true)
      const b = route(g, s, t, 20, 10, false)
      expect(!!a).toBe(!!b)
      if (a && b) {
        routes++
        maxDiff = Math.max(maxDiff, Math.abs(a.cost - b.cost) / Math.max(1, b.cost))
        forbidden += a.path.filter((c) => !(g.slope[c] <= 20)).length
      }
    }
    record('V20', {
      test: 'Moon Directions: A* (straight-line heuristic) vs brute-force Dijkstra on 50 seeded random slope grids (20–40 cells, 15 % forbidden cells, S_max 20°, S_ref 10°)',
      criterion: 'exact cost match; no forbidden cell on the route',
      measured: { routes, max_relative_cost_diff: maxDiff, forbidden_cells_on_routes: forbidden },
      summary: `${routes} routes: max relative cost difference ${maxDiff.toExponential(1)}, ${forbidden} forbidden cells`,
      pass: maxDiff <= 1e-12 && forbidden === 0 && routes > 20,
    })
    expect(maxDiff).toBeLessThanOrEqual(1e-12)
    expect(forbidden).toBe(0)
  })
})
