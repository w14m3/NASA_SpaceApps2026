import { describe, expect, it } from 'vitest'
import { azel, siteFrame, sphereDip, subPoint } from './topo'
import { readJson, testEphemeris } from './testdata'
import { record } from './record'

interface V1Row {
  lon: number
  lat: number
  z0: number
  h: number
  unix_ms: number
  SUN: { az: number; el: number }
  EARTH: { az: number; el: number }
}
interface HRow {
  body: 'SUN' | 'EARTH'
  lon: number
  lat: number
  alt_km: number
  jd_ut: number
  az: number
  el: number
}

function angDist(az1: number, el1: number, az2: number, el2: number) {
  const r = Math.PI / 180
  const c = Math.sin(el1 * r) * Math.sin(el2 * r) + Math.cos(el1 * r) * Math.cos(el2 * r) * Math.cos((az1 - az2) * r)
  return Math.acos(Math.min(1, c)) / r
}

describe('ephemeris oracles', () => {
  it('O1 browser ephemeris vs v1 SPICE topocentric az/el fixture (300 rows x 2 bodies) <= 0.001 deg', async () => {
    const eph = await testEphemeris()
    const rows = readJson<V1Row[]>('web/src/core/__fixtures__/v1_spice_azel.json')
    let maxEl = 0
    let maxAng = 0
    for (const r of rows) {
      const f = siteFrame({ lon: r.lon, lat: r.lat, z0: r.z0, h: r.h })
      for (const b of ['SUN', 'EARTH'] as const) {
        const p = azel(eph, b, r.unix_ms, f)
        maxEl = Math.max(maxEl, Math.abs(p.el - r[b].el))
        maxAng = Math.max(maxAng, angDist(p.az, p.el, r[b].az, r[b].el))
      }
    }
    const pass = maxAng <= 1e-3
    record('O1', {
      test: 'Runtime ephemeris + topocentric geometry vs reference/v1 rigorous SPICE az/el fixture (300 site/time rows, Sun and Earth)',
      criterion: '<= 0.001 deg',
      measured: { max_angular_deg: maxAng, max_el_deg: maxEl, rows: rows.length },
      summary: `max ${maxAng.toExponential(1)} deg`,
      pass,
    })
    expect(maxAng).toBeLessThanOrEqual(1e-3)
  })

  it('V2 runtime ephemeris vs cached JPL Horizons az/el (lunar-surface observers) <= 0.005 deg', async () => {
    const eph = await testEphemeris()
    const { rows } = readJson<{ rows: HRow[] }>('web/src/core/__fixtures__/horizons_azel.json')
    const stats = { SUN: { max: 0, ss: 0, n: 0 }, EARTH: { max: 0, ss: 0, n: 0 } }
    for (const r of rows) {
      const t = (r.jd_ut - 2440587.5) * 86_400_000
      if (!eph.covers(t)) continue
      const f = siteFrame({ lon: r.lon, lat: r.lat, z0: r.alt_km * 1000, h: 0 })
      const p = azel(eph, r.body, t, f)
      const d = angDist(p.az, p.el, r.az, r.el)
      const s = stats[r.body]
      s.max = Math.max(s.max, d)
      s.ss += d * d
      s.n++
    }
    const out = Object.fromEntries(
      Object.entries(stats).map(([k, s]) => [k, { max_deg: s.max, rms_deg: Math.sqrt(s.ss / s.n), n: s.n }]),
    )
    const worst = Math.max(stats.SUN.max, stats.EARTH.max)
    record('V2', {
      test: 'Runtime ephemeris (SPICE DE440 piece) + site geometry vs JPL Horizons apparent az/el from lunar-surface sites, 2013 cached responses (DE441, MEAN_ME, airless), re-run offline',
      criterion: '<= 0.005 deg',
      measured: out,
      summary: `Sun max ${stats.SUN.max.toExponential(1)} deg, Earth max ${stats.EARTH.max.toExponential(1)} deg (n=${stats.SUN.n + stats.EARTH.n})`,
      pass: worst <= 5e-3 && stats.SUN.n + stats.EARTH.n >= 1000,
    })
    expect(stats.SUN.n + stats.EARTH.n).toBeGreaterThanOrEqual(1000)
    expect(worst).toBeLessThanOrEqual(5e-3)
  })

  it('pieces join without a seam at 2026-01-01 (DE421 -> SPICE DE440)', async () => {
    const eph = await testEphemeris()
    const t = Date.UTC(2026, 0, 1)
    expect(eph.sourceAt(t - 1)).toBe('de421')
    expect(eph.sourceAt(t + 1)).toBe('de440')
    const a = eph.pieces[0].eval(1, t, [0, 0, 0])
    const b = eph.pieces[1].eval(1, t, [0, 0, 0])
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
    expect(d / Math.hypot(...b)).toBeLessThan(1e-6) // < 0.4 km at 400,000 km
  })

  it('covers 2017-01-01 to 2031-01-03 and reports UT1-UTC below 0.9 s', async () => {
    const eph = await testEphemeris()
    expect(eph.startMs).toBeLessThanOrEqual(Date.UTC(2017, 0, 1))
    expect(eph.endMs).toBeGreaterThanOrEqual(Date.UTC(2031, 0, 2))
    for (const y of [2017, 2020, 2023, 2026, 2030]) expect(Math.abs(eph.dut1(Date.UTC(y, 5, 1)))).toBeLessThan(0.9)
  })

  it('libration: the sub-Earth point wanders about ±6.7° in latitude and ±7.9° in longitude (one year)', async () => {
    const eph = await testEphemeris()
    let maxLat = 0
    let maxLon = 0
    for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2028, 0, 1); t += 3_600_000) {
      const p = subPoint(eph, 'EARTH', t)
      maxLat = Math.max(maxLat, Math.abs(p.lat))
      maxLon = Math.max(maxLon, Math.abs(p.lon))
    }
    expect(maxLat).toBeGreaterThan(6.4)
    expect(maxLat).toBeLessThan(7.0)
    expect(maxLon).toBeGreaterThan(7.0)
    expect(maxLon).toBeLessThan(8.5)
  })

  it('smooth-sphere dip for a 10 m mast matches the small-angle form sqrt(2h/R)', () => {
    const approx = (-Math.sqrt((2 * 10) / 1_737_400) * 180) / Math.PI
    expect(Math.abs(sphereDip(10) - approx)).toBeLessThan(1e-6)
    expect(sphereDip(10)).toBeCloseTo(-0.1944, 4)
  })
})
