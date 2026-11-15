// V7 and V7b validation of the candidate grid (contract §10). Writes data/validation/V7.json and V7b.json.
// V7 : production horizon march (360 az, unquantised) vs a naive fixed-step march (10 m steps, no refinement).
// V7b: sunlit fraction from the fast path (360-az quantised masks, straight-horizon 1 % criterion, hourly samples)
//      vs full 1440-azimuth masks with exact disk fractions and events (200 seeded candidates, 14 days).
import { computeHorizon } from '../src/core/horizon'
import { candidateMask } from '../src/core/candidates'
import { bilinearXY } from '../src/core/dem'
import { R2D, R_MOON_M, DAY } from '../src/core/constants'
import { unitToXY } from '../src/core/projection'
import { mulberry32 } from '../src/core/rng'
import { analyseSite, defaultScenario } from '../src/core/analysis'
import { rankCandidates, DEFAULT_CONSTRAINTS, PERSONAS } from '../src/core/top3'
import { LANDERS } from '../src/core/safety'
import { DSN } from '../src/core/stations'
import { record } from '../src/core/record'
import { testDem, testEphemeris, testGrid } from '../src/core/testdata'

const g = await testDem()
const eph = await testEphemeris()
const grid = testGrid('connecting-ridge')
const rnd = mulberry32(7)

function naive(lon: number, lat: number, h: number, nAz: number, step = 10, sMax = 300_000) {
  const lo = (lon * Math.PI) / 180
  const la = (lat * Math.PI) / 180
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
  const east = [-Math.sin(lo), Math.cos(lo), 0]
  const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]]
  const [sx, sy] = unitToXY(up[0], up[1], up[2])
  const z0 = bilinearXY(g, sx, sy)
  const rho0 = R_MOON_M + z0 + h
  const out = new Float32Array(nAz)
  for (let i = 0; i < nAz; i++) {
    const a = (2 * Math.PI * i) / nAz
    const d = [0, 1, 2].map((k) => north[k] * Math.cos(a) + east[k] * Math.sin(a))
    let best = -90
    for (let s = 2; s <= sMax; s += s < 2000 ? 1 : step) {
      const th = s / R_MOON_M
      const [x, y] = unitToXY(up[0] * Math.cos(th) + d[0] * Math.sin(th), up[1] * Math.cos(th) + d[1] * Math.sin(th), up[2] * Math.cos(th) + d[2] * Math.sin(th))
      const z = bilinearXY(g, x, y)
      if (Number.isNaN(z)) continue
      const e = Math.atan2((R_MOON_M + z) * Math.cos(th) - rho0, (R_MOON_M + z) * Math.sin(th)) * R2D
      if (e > best) best = e
    }
    out[i] = best
  }
  return out
}

// V7: 12 candidates, 72 azimuths each
let v7 = 0
let quant = 0
for (let k = 0; k < 12; k++) {
  const i = Math.floor(rnd() * grid.n)
  const prod = computeHorizon([g], grid.lon[i], grid.lat[i], 10, { nAz: 360, bands: false })!
  const nv = naive(grid.lon[i], grid.lat[i], 10, 72)
  const q = candidateMask(grid, i, 1)
  for (let j = 0; j < 72; j++) {
    v7 = Math.max(v7, Math.abs(prod.mask.mid[j * 5] - nv[j]))
    quant = Math.max(quant, Math.abs(q.mid[j * 5] - prod.mask.mid[j * 5]))
  }
  console.log('V7 candidate', k, v7.toFixed(4), quant.toFixed(4))
}
record('V7', {
  test: 'Candidate-grid horizon march (360 azimuths, 1 % step capped at 120 m, golden-section refinement) vs a naive fixed-step march (1 m to 2 km, then 10 m to 300 km, no refinement), 12 seeded candidates x 72 azimuths, h = 10 m, LOLA 240 m; the uint8 storage quantisation is reported separately',
  criterion: '<= 0.01 deg',
  measured: { max_deg: v7, storage_quantisation_max_deg: quant },
  summary: `max ${v7.toFixed(4)}° (storage quantisation ≤ ${quant.toFixed(3)}°, accounted for in V7b)`,
  pass: v7 <= 0.01,
})

// V7b: 200 candidates
const t0 = Date.UTC(2026, 11, 11)
const t1 = t0 + 14 * DAY
const r = rankCandidates({ grid, heightIndex: 1, eph, t0, t1, stations: DSN, lander: LANDERS.medium, constraints: DEFAULT_CONSTRAINTS, weights: PERSONAS.balanced, minSeparationKm: 1 })
let worst = 0
let sum = 0
const n = Number(process.argv[2] ?? 200)
for (let k = 0; k < n; k++) {
  const i = Math.floor(rnd() * grid.n)
  const full = computeHorizon([g], grid.lon[i], grid.lat[i], 10, { nAz: 1440, bands: false })!
  const a = analyseSite(eph, { lon: grid.lon[i], lat: grid.lat[i], z0: full.z0, h: 10 }, full.mask, { ...defaultScenario(t0, 14), stations: [] }, { hourly: false })
  const d = Math.abs(a.litFrac.value - r.all[i].lit) * 100
  worst = Math.max(worst, d)
  sum += d
  if (k % 20 === 0) console.log('V7b', k, worst.toFixed(2))
}
record('V7b', {
  test: `Sunlit time over 14 days (2026-12-11, h = 10 m): fast path (360-azimuth uint8 masks, straight-horizon 1 % criterion, hourly samples) vs full 1440-azimuth masks with exact 200-strip disk fractions and events, ${n} seeded candidates (Connecting Ridge)`,
  criterion: '<= 2 percentage points',
  measured: { max_pp: worst, mean_pp: sum / n, n },
  summary: `max ${worst.toFixed(2)} pp, mean ${(sum / n).toFixed(2)} pp (n=${n})`,
  pass: worst <= 2,
})
