// Browser-core validation: SPICE parity, V8 (event times), V9 (disk occlusion).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Ephemeris, type EphemMeta } from './ephem'
import { azel, siteFrame, sphereDip } from './geom'
import { diskFraction, flatMask, intervals, visFn, DEFAULT_THRESHOLDS, type Mask } from './visibility'
import fixture from './__fixtures__/azel.json'

const pub = resolve(__dirname, '../../public/data')
const outDir = resolve(__dirname, '../../../data/validation')
mkdirSync(outDir, { recursive: true })
const record = (name: string, payload: unknown) =>
  writeFileSync(resolve(outDir, `${name}.json`), JSON.stringify(payload, null, 2) + '\n')

function loadEph(): Ephemeris {
  const meta = JSON.parse(readFileSync(resolve(pub, 'ephem.json'), 'utf8')) as EphemMeta
  const buf = readFileSync(resolve(pub, 'ephem.bin'))
  return new Ephemeris(meta, new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)))
}

describe('ephemeris parity with SPICE', () => {
  it('browser az/el matches rigorous SPICE topocentric az/el to < 0.001 deg', () => {
    const eph = loadEph()
    let worst = 0
    for (const r of fixture as any[]) {
      const f = siteFrame({ lon: r.lon, lat: r.lat, z0: r.z0, h: r.h })
      for (const body of ['SUN', 'EARTH'] as const) {
        const a = azel(eph, body, r.unix_ms, f)
        const dAz = (((a.az - r[body].az + 540) % 360) - 180) * Math.cos((a.el * Math.PI) / 180)
        worst = Math.max(worst, Math.hypot(dAz, a.el - r[body].el))
        expect(Math.abs(a.range - r[body].range) / r[body].range).toBeLessThan(1e-6)
      }
    }
    record('browser_parity', { pairs: (fixture as any[]).length * 2, max_deg: worst, tolerance_deg: 0.001 })
    expect(worst).toBeLessThan(0.001)
  })
})

describe('V9 disk occlusion vs analytic circle segment', () => {
  it('flat horizon cutting the disk at height d matches the segment area to 1e-4', () => {
    const rad = 0.2666
    let worst = 0
    for (const d of [-0.95, -0.6, -0.2, 0, 0.3, 0.7, 0.95]) {
      // horizon at elevation 0, disk centre at el = d*rad: visible part is above the chord
      const m = flatMask(0, 3600)
      const got = diskFraction(m, { az: 123.4, el: d * rad, range: 1, rad }, 'mid', 4000)
      // area above chord at signed distance -d from the centre: 1 - segment(below)
      const x = -d
      const below = (Math.acos(-x) - -x * Math.sqrt(1 - x * x)) / Math.PI // fraction below the chord
      const expected = 1 - below
      worst = Math.max(worst, Math.abs(got - expected))
    }
    // production setting (200 strips) must also be within 1e-3
    const m = flatMask(0, 3600)
    const p200 = diskFraction(m, { az: 10, el: 0.1, range: 1, rad }, 'mid', 200)
    const x = -0.1 / rad
    const exp200 = 1 - (Math.acos(-x) - -x * Math.sqrt(1 - x * x)) / Math.PI
    record('V9', { tolerance: 1e-4, max_abs_err_4000_strips: worst, abs_err_200_strips: Math.abs(p200 - exp200) })
    expect(worst).toBeLessThan(1e-4)
    expect(Math.abs(p200 - exp200)).toBeLessThan(1e-3)
  })
})

describe('V8 event times vs brute-force 1 s scan', () => {
  it('rise/set times agree within 5 s on a rugged synthetic mask', () => {
    const eph = loadEph()
    const f = siteFrame({ lon: -130, lat: -89.5, z0: 0, h: 2 })
    // rugged mask: peaks and notches around the smooth-sphere dip
    const n = 1440
    const mid = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI
      mid[i] = sphereDip(2) + 1.2 + 1.5 * Math.sin(3 * a) + 0.8 * Math.sin(17 * a + 1) + 0.3 * Math.sin(61 * a)
    }
    const mask: Mask = { n, mid, lo: mid, hi: mid, kind: 'synthetic' }
    const t0 = Date.UTC(2026, 10, 14)
    const t1 = t0 + 12 * 86400_000
    let worst = 0
    let count = 0
    for (const body of ['SUN', 'EARTH'] as const) {
      const g = visFn(eph, f, mask, body, DEFAULT_THRESHOLDS, 'mid')
      const iv = intervals(g, t0, t1)
      // brute force at 1 s
      const brute: number[] = []
      let prev = g(t0) > 0
      for (let t = t0 + 1000; t <= t1; t += 1000) {
        const cur = g(t) > 0
        if (cur !== prev) brute.push(t - 500)
        prev = cur
      }
      const found: number[] = []
      for (const i of iv) {
        if (!i.openStart) found.push(i.start)
        if (!i.openEnd) found.push(i.end)
      }
      expect(found.length).toBe(brute.length)
      for (let k = 0; k < brute.length; k++) worst = Math.max(worst, Math.abs(found[k] - brute[k]))
      count += brute.length
    }
    record('V8', { tolerance_s: 5, events: count, max_abs_err_s: worst / 1000 })
    expect(count).toBeGreaterThan(4)
    expect(worst).toBeLessThanOrEqual(5000)
  }, 120_000)
})

import { integrateHours, cosIncidence } from './analysis'

describe('V10 energy integrator vs closed form', () => {
  it('trapezoid on the app sampling (901 points) reproduces a clipped sinusoid to 0.1 %', () => {
    // one-sided fixed vertical panel while the Sun circles the horizon at constant elevation:
    // P(t) = S cos(el) max(0, cos(az(t) - az0)); closed form over k full turns = k * S cos(el) * 2 / (2 pi) * T
    const S = 1361
    const el = 1.5
    const T = 29.530589 * 24 // hours per turn
    const turns = 3
    const n = 900
    const t: number[] = []
    const y: number[] = []
    for (let i = 0; i <= n; i++) {
      const hours = (turns * T * i) / n
      t.push(hours * 3600_000)
      y.push(S * cosIncidence('vertE', (360 * hours) / T + 17, el))
    }
    const got = integrateHours(t, y)
    const expected = (turns * S * Math.cos((el * Math.PI) / 180) * T) / Math.PI
    const rel = Math.abs(got - expected) / expected
    record('V10', { tolerance_rel: 1e-3, rel_err: rel, got_wh_m2: got, expected_wh_m2: expected })
    expect(rel).toBeLessThan(1e-3)
  })
})
