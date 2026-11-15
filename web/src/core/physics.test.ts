import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DAY, HOUR, S0_W_M2 } from './constants'
import { circleSegmentFraction, diskFraction } from './disk'
import { intervals, totalDuration } from './events'
import { DEFAULT_ARRAY, integrate, LEVEL_ATTITUDE, sunTrack, survival, type SunSample } from './energy'
import { flatMask, maskFromV1, type Mask, type V1MaskFile } from './mask'
import { bodyFn, DEFAULT_THRESHOLDS } from './analysis'
import { plateEquilibriumK } from './thermal'
import { LANDERS, planeFit, tipOver } from './safety'
import { lonLatToXY } from './projection'
import { siteFrame } from './topo'
import type { DemGrid } from './dem'
import { record } from './record'
import { ROOT, testEphemeris } from './testdata'

function v1Mask(id: string, h: '2' | '10'): { mask: Mask; lon: number; lat: number; z0: number } {
  const file = JSON.parse(readFileSync(join(ROOT, `reference/v1/web/public/data/masks/${id}.json`), 'utf8')) as V1MaskFile
  const site = (JSON.parse(readFileSync(join(ROOT, 'reference/v1/web/public/data/sites.json'), 'utf8')) as { id: string; lon: number; lat: number }[]).find((s) => s.id === id)!
  return { mask: maskFromV1(file, h), lon: site.lon, lat: site.lat, z0: file.z0 }
}

describe('disk occlusion and events', () => {
  it('V9 Sun-disk occlusion vs analytic circle segment <= 1e-4', () => {
    const r = 0.2666
    let worst = 0
    for (const d of [-0.25, -0.18, -0.1, -0.03, 0, 0.04, 0.11, 0.2, 0.26]) {
      const m = flatMask(0, 3600)
      const f = diskFraction(m, { az: 123, el: d, range: 1.5e8, rad: r }, 'mid', 200)
      worst = Math.max(worst, Math.abs(f - circleSegmentFraction(d, r)))
    }
    record('V9', {
      test: 'Visible fraction of the solar disk above a straight horizon (production quadrature, 200 strips) vs the analytic circle segment, 9 offsets',
      criterion: '<= 1e-4',
      measured: { max_abs: worst },
      summary: `max ${worst.toExponential(1)}`,
      pass: worst <= 1e-4,
    })
    expect(worst).toBeLessThanOrEqual(1e-4)
  })

  it('V8 rise/set event times vs brute-force 1 s scan <= 5 s (real 80 m-based mask, Malapert M1 at 2 m, 12 days)', async () => {
    const eph = await testEphemeris()
    const { mask, lon, lat, z0 } = v1Mask('poi_bussey2010_M1_malapert', '10')
    const f = siteFrame({ lon, lat, z0, h: 10 })
    const g = bodyFn(eph, f, mask, 'SUN', DEFAULT_THRESHOLDS, 'mid')
    // find a 12-day span with several events
    let t0 = Date.UTC(2027, 0, 1)
    let iv = intervals(g, t0, t0 + 12 * DAY)
    for (let k = 0; k < 30 && iv.filter((i) => !i.openStart).length + iv.filter((i) => !i.openEnd).length < 4; k++) {
      t0 += 6 * DAY
      iv = intervals(g, t0, t0 + 12 * DAY)
    }
    const events = iv.flatMap((i) => [...(i.openStart ? [] : [i.start]), ...(i.openEnd ? [] : [i.end])])
    let worst = 0
    for (const e of events) {
      // brute force: 1 s scan over ±15 min around the event
      let prev = g(e - 900_000) > 0
      let found = NaN
      for (let t = e - 900_000 + 1000; t <= e + 900_000; t += 1000) {
        const cur = g(t) > 0
        if (cur !== prev) {
          if (Number.isNaN(found) || Math.abs(t - e) < Math.abs(found - e)) found = t - 500
          prev = cur
        }
      }
      worst = Math.max(worst, Math.abs(found - e) / 1000)
    }
    record('V8', {
      test: `Rise/set times from the 10-min scan + bisection vs a brute-force 1 s scan (Malapert M1, 10 m, 80 m-based mask, ${events.length} events in 12 days)`,
      criterion: '<= 5 s',
      measured: { events: events.length, max_s: worst },
      summary: `max ${worst.toFixed(2)} s over ${events.length} events`,
      pass: worst <= 5 && events.length >= 2,
    })
    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(worst).toBeLessThanOrEqual(5)
  })
})

describe('energy', () => {
  it('V10 energy integrator vs closed form and vs a 1-minute reference on real terrain over 365 days <= 0.1 %', async () => {
    // (a) closed form: constant irradiance, full disk, flat panel with sin(el) = 0.5·(1 + sin(2πt/P)) clipped at 0
    const P = 10 * DAY
    const tr: SunSample[] = []
    const t0 = 0
    for (let t = 0; t <= 30 * DAY; t += 600_000) {
      const se = Math.sin((2 * Math.PI * t) / P)
      tr.push({ t, az: 0, el: (Math.asin(Math.max(0, se) * 0.5) * 180) / Math.PI, f: se > 0 ? 1 : 0, s: S0_W_M2 })
    }
    const flat = { ...DEFAULT_ARRAY, layout: 'flat' as const }
    const num = integrate(flat, LEVEL_ATTITUDE, tr).incidentWhM2
    // ∫ 0.5·max(0, sin) over 3 periods = 0.5 · 3 · P/π
    const exact = (S0_W_M2 * 0.5 * 3 * (P / Math.PI)) / HOUR
    const errClosed = Math.abs(num - exact) / exact
    // (b) real terrain, 365 days, vertical Sun-tracking and fixed north-facing panels vs 1-minute trapezoid
    const eph = await testEphemeris()
    const { mask, lon, lat, z0 } = v1Mask('poi_site001_connecting_ridge', '10')
    const f = siteFrame({ lon, lat, z0, h: 10 })
    const a = Date.UTC(2027, 0, 1)
    const b = a + 365 * DAY
    const adaptive = sunTrack(eph, f, mask, a, b)
    const ref = sunTrack(eph, f, mask, a, b, 'mid', 60_000, 60_000)
    const errs: Record<string, number> = {}
    for (const layout of ['track', 'vertical', 'flat'] as const) {
      const spec = { ...DEFAULT_ARRAY, layout, azimuth: 0 }
      const e1 = integrate(spec, LEVEL_ATTITUDE, adaptive).incidentWhM2
      const e2 = integrate(spec, LEVEL_ATTITUDE, ref).incidentWhM2
      errs[layout] = Math.abs(e1 - e2) / e2
    }
    const worst = Math.max(errClosed, ...Object.values(errs))
    record('V10', {
      test: 'Energy: (a) event-aware trapezoid vs closed form (clipped sinusoid, 30 d); (b) on real terrain (Connecting Ridge site 001, 10 m, 80 m-based mask, 365 days) vs a 1-minute reference, three layouts',
      criterion: '<= 0.1 %',
      measured: { closed_form_rel: errClosed, terrain_rel: errs, adaptive_samples: adaptive.length, reference_samples: ref.length },
      summary: `closed form ${(errClosed * 100).toExponential(1)} %, terrain max ${(Math.max(...Object.values(errs)) * 100).toExponential(1)} % with ${adaptive.length} vs ${ref.length} samples`,
      pass: worst <= 1e-3,
    })
    expect(worst).toBeLessThanOrEqual(1e-3)
  })

  it('survival model drains a battery at the load rate in darkness and charges in sunlight', () => {
    const b = { capacityWh: 1000, depthOfDischarge: 1, roundTrip: 1, specificWhKg: 100 }
    const s = survival(new Float32Array([0, 0, 0, 0, 0]), 300, b)
    expect(s.emptyAtHour).toBe(4)
    const s2 = survival(new Float32Array([500, 500]), 100, b, 0)
    expect(s2.soc[2]).toBeCloseTo(0.8, 6)
  })

  it('thermal plate equilibrium: 1361 W/m², α = ε gives 394 K; shadow gives null (heaters, no invented value)', () => {
    expect(plateEquilibriumK(1, 1, 1361, 1)!).toBeCloseTo(394.0, 0)
    expect(plateEquilibriumK(0.9, 0.85, 1361, 0)).toBeNull()
  })
})

describe('landing safety', () => {
  function planeGrid(px: number, gx: number, gy: number): DemGrid {
    const n = 201
    const z = new Float32Array(n * n)
    const x0 = 1_000_000 - (n * px) / 2
    const y0 = 1_000_000 + (n * px) / 2
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const x = x0 + (c + 0.5) * px
        const y = y0 - (r + 0.5) * px
        z[r * n + c] = gx * (x - 1_000_000) + gy * (y - 1_000_000)
      }
    return { name: 's', label: 's', z, nx: n, ny: n, x0, y0, px, scale: 1, err: 0 }
  }

  it('V15 plane fit on synthetic tilted planes and a cone: slope <= 0.01 deg, azimuth <= 0.1 deg', () => {
    // a site whose map position is (1e6, 1e6): lon 45 E. Plane tilted along map +y (radially outward = local north)
    const r = Math.hypot(1e6, 1e6)
    const lat = (2 * Math.atan(r / (2 * 1_737_400)) - Math.PI / 2) * (180 / Math.PI)
    const lon = 45
    const [x, y] = lonLatToXY(lon, lat)
    expect(Math.abs(x - 1e6) + Math.abs(y - 1e6)).toBeLessThan(1e-3)
    const k = 2 / (1 - Math.sin((lat * Math.PI) / 180)) // map metres per true metre
    let worstS = 0
    let worstA = 0
    for (const [slopeDeg, dirDeg] of [[5, 0], [8, 90], [12, 200], [20, 315]] as const) {
      // true gradient magnitude tan(slope) toward uphill = dir+180; convert to map gradient
      const gTrue = Math.tan((slopeDeg * Math.PI) / 180)
      const up = ((dirDeg + 180) * Math.PI) / 180
      const gn = gTrue * Math.cos(up)
      const ge = gTrue * Math.sin(up)
      const lo = (lon * Math.PI) / 180
      // map gradient = (true gradient) / k, rotated: north = (sin lo, cos lo), east = (cos lo, -sin lo)
      const gx = (gn * Math.sin(lo) + ge * Math.cos(lo)) / k
      const gy = (gn * Math.cos(lo) - ge * Math.sin(lo)) / k
      const g = planeGrid(20, gx, gy)
      const fit = planeFit(g, lon, lat, 400)!
      worstS = Math.max(worstS, Math.abs(fit.slope - slopeDeg))
      worstA = Math.max(worstA, Math.abs(((fit.downhill - dirDeg + 540) % 360) - 180))
    }
    // cone: away from the apex the fitted slope equals the cone slope
    const n = 401
    const px = 10
    const z = new Float32Array(n * n)
    const x0 = 1e6 - (n * px) / 2
    const y0 = 1e6 + (n * px) / 2
    const coneSlope = Math.tan((10 * Math.PI) / 180)
    for (let rr = 0; rr < n; rr++)
      for (let c = 0; c < n; c++) z[rr * n + c] = -coneSlope * Math.hypot(x0 + (c + 0.5) * px - 1e6, y0 - (rr + 0.5) * px - 1e6)
    const cone: DemGrid = { name: 'c', label: 'c', z, nx: n, ny: n, x0, y0, px, scale: 1, err: 0 }
    // point 1 km from the apex along map +y
    const r2 = Math.hypot(1e6, 1e6 + 1000)
    const lat2 = (2 * Math.atan(r2 / (2 * 1_737_400)) - Math.PI / 2) * (180 / Math.PI)
    const lon2 = (Math.atan2(1e6, 1e6 + 1000) * 180) / Math.PI
    const fc = planeFit(cone, lon2, lat2, 100)!
    const k2 = 2 / (1 - Math.sin((lat2 * Math.PI) / 180))
    const coneTrue = (Math.atan(coneSlope * k2) * 180) / Math.PI
    const coneErr = Math.abs(fc.slope - coneTrue)
    record('V15', {
      test: 'Least-squares plane fit through bilinear DEM samples: 4 synthetic tilted planes (5–20°, 4 directions, scale factor and meridian convergence applied) and a 10° cone 1 km from its apex',
      criterion: 'slope <= 0.01°, azimuth <= 0.1°',
      measured: { plane_slope_max_deg: worstS, plane_azimuth_max_deg: worstA, cone_slope_deg: coneErr },
      summary: `slope ${worstS.toExponential(1)}°, azimuth ${worstA.toExponential(1)}°, cone ${coneErr.toExponential(1)}°`,
      pass: worstS <= 0.01 && worstA <= 0.1 && coneErr <= 0.01,
    })
    expect(worstS).toBeLessThanOrEqual(0.01)
    expect(worstA).toBeLessThanOrEqual(0.1)
    expect(coneErr).toBeLessThanOrEqual(0.01)
  })

  it('V16 tip-over analytic cases: M = 0 gives v_crit = 0, flat-ground closed form, symmetry, units', () => {
    const p = LANDERS.medium
    const r = p.padRadius * Math.cos(Math.PI / p.legs)
    const tip = (Math.atan(r / p.cgHeight) * 180) / Math.PI
    // M = 0: slope such that tilt = tip angle
    const zero = tipOver(p, tip - p.attitudeDispersion, 0)
    const e1 = Math.abs(zero.vCrit)
    // flat ground, no dispersion: M = θ_tip; closed form
    const flat = tipOver({ ...p, attitudeDispersion: 0 }, 0, 0)
    const L = Math.hypot(r, p.cgHeight)
    const M = (tip * Math.PI) / 180
    const vExact = Math.sqrt(2 * 1.62 * L * (1 - Math.cos(M)) * (L * L + p.gyration ** 2)) / p.cgHeight
    const e2 = Math.abs(flat.vCrit - vExact)
    // symmetry: the same slope with or without the uncertainty term moved between σ and δσ gives the same result
    const e3 = Math.abs(tipOver(p, 3, 2).vCrit - tipOver(p, 5, 0).vCrit)
    // units: scaling all lengths by s scales v_crit by sqrt(s)
    const s = 4
    const big = tipOver({ ...p, padRadius: p.padRadius * s, cgHeight: p.cgHeight * s, gyration: p.gyration * s, attitudeDispersion: 0 }, 0, 0)
    const e4 = Math.abs(big.vCrit - flat.vCrit * Math.sqrt(s))
    const worst = Math.max(e1, e2, e3, e4)
    record('V16', {
      test: 'Tip-over screening model: M = 0 → v_crit = 0; flat-ground closed form; symmetry of σ vs δσ; length scaling v ∝ √s',
      criterion: 'exact to 1e-9',
      measured: { m0: e1, flat: e2, symmetry: e3, scaling: e4 },
      summary: `max ${worst.toExponential(1)} m/s`,
      pass: worst <= 1e-9,
    })
    expect(worst).toBeLessThanOrEqual(1e-9)
    expect(tipOver(p, 40, 2).verdict).toBe('red')
    expect(tipOver(p, 30, 2).verdict).toBe('amber')
  })

  it('interval totals are additive', () => {
    expect(totalDuration([{ start: 0, end: 10, openStart: false, openEnd: false }, { start: 20, end: 25, openStart: false, openEnd: false }])).toBe(15)
  })
})
