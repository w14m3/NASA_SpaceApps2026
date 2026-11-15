import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { R2D, R_MOON_M } from './constants'
import { bilinearXY, heightAt, pixelToXY, xyToPixel, type DemGrid } from './dem'
import { computeHorizon, confidenceGrade } from './horizon'
import { maskAt, maskFromV1, type V1MaskFile } from './mask'
import { lonLatToXY, xyToLonLat } from './projection'
import { sphereDip } from './topo'
import { record } from './record'
import { ROOT, testDem } from './testdata'
// v1 browser horizon algorithm, imported read-only as the O2b oracle
import { computeMask as v1ComputeMask } from '../../../reference/v1/web/src/core/horizon'

/** Synthetic Float32 grid centred on the pole (odd size so a pixel centre sits on the pole). */
function synth(px: number, half: number, f: (x: number, y: number) => number, err = 0): DemGrid {
  const n = 2 * Math.round(half / px) + 1
  const z = new Float32Array(n * n)
  const x0 = -n * px * 0.5
  const y0 = n * px * 0.5
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) z[r * n + c] = f(x0 + (c + 0.5) * px, y0 - (r + 0.5) * px)
  return { name: 'synthetic', label: 'synthetic', z, nx: n, ny: n, x0, y0, px, scale: 1, err }
}

/** Exact elevation of a terrain profile z(s) seen from height h above z0, dense 1-D maximisation. */
function exactMax(zf: (s: number) => number, z0: number, h: number, sMax: number) {
  const rho0 = R_MOON_M + z0 + h
  const eps = (s: number) => {
    const th = s / R_MOON_M
    const rho = R_MOON_M + zf(s)
    return Math.atan2(rho * Math.cos(th) - rho0, rho * Math.sin(th))
  }
  let best = -Infinity
  let bs = 0
  for (let s = 1; s <= sMax; s += 1) {
    const e = eps(s)
    if (e > best) {
      best = e
      bs = s
    }
  }
  let a = bs - 1
  let b = bs + 1
  for (let k = 0; k < 60; k++) {
    const c = a + (b - a) / 3
    const d = b - (b - a) / 3
    if (eps(c) > eps(d)) b = d
    else a = c
  }
  return Math.max(best, eps((a + b) / 2)) * R2D
}

describe('horizon (synthetic, V4/V5)', () => {
  it('V4 smooth sphere dip at 4 heights, ring wall and cone vs exact profiles <= 1e-4 deg', () => {
    const flat = synth(100, 20_000, () => 0)
    let sphereErr = 0
    for (const h of [1, 2, 10, 30]) {
      const r = computeHorizon([flat], 0, -90, h, { nAz: 36, sMax: 19_000, bands: false })!
      for (let i = 0; i < r.mask.n; i++) sphereErr = Math.max(sphereErr, Math.abs(r.mask.mid[i] - sphereDip(h)))
    }
    // Gaussian ring wall centred on the site (radial profile in map distance from the pole: equal to arc length
    // within 1e-5 relative at these distances; the exact profile uses the same map-distance definition)
    const A = 300
    const s0 = 15_000
    const w = 3_000
    const ringZ = (rm: number) => A * Math.exp(-((rm - s0) ** 2) / (2 * w * w))
    const ring = synth(20, 30_000, (x, y) => ringZ(Math.hypot(x, y)))
    const rr = computeHorizon([ring], 0, -90, 10, { nAz: 24, sMax: 29_000, bands: false })!
    const mapDist = (s: number) => 2 * R_MOON_M * Math.tan(s / (2 * R_MOON_M)) // map radius of arc length s from the pole
    const exactRing = exactMax((s) => ringZ(mapDist(s)), 0, 10, 29_000)
    let ringErr = 0
    for (let i = 0; i < rr.mask.n; i++) ringErr = Math.max(ringErr, Math.abs(rr.mask.mid[i] - exactRing))
    // Cone with its apex on a pixel centre of the row through the pole, seen along azimuth 90 deg
    const H = 400
    const X0 = 8_000
    const W = 2_000
    const coneZ = (x: number, y: number) => H * Math.max(0, 1 - Math.hypot(x - X0, y) / W)
    const cone = synth(20, 12_000, coneZ)
    const rc = computeHorizon([cone], 0, -90, 2, { nAz: 4, sMax: 11_000, bands: false })!
    const exactCone = exactMax((s) => coneZ(mapDist(s), 0), 0, 2, 11_000)
    const coneErr = Math.abs(rc.mask.mid[1] - exactCone)
    const pass = sphereErr <= 1e-4 && ringErr <= 1e-4 && coneErr <= 1e-4
    record('V4', {
      test: 'Synthetic terrain: smooth-sphere dip at h = 1, 2, 10, 30 m; Gaussian ring wall (300 m, r = 15 km, 20 m grid); cone apex (400 m at 8 km)',
      criterion: '<= 1e-4 deg',
      measured: { sphere_max_deg: sphereErr, ring_max_deg: ringErr, cone_deg: coneErr },
      summary: `sphere ${sphereErr.toExponential(1)}°, ring ${ringErr.toExponential(1)}°, cone ${coneErr.toExponential(1)}°`,
      pass,
    })
    expect(sphereErr).toBeLessThanOrEqual(1e-4)
    expect(ringErr).toBeLessThanOrEqual(1e-4)
    expect(coneErr).toBeLessThanOrEqual(1e-4)
  })

  it('V5 azimuth wrap on the 180 deg meridian and rays leaving the DEM are flagged, not fatal', () => {
    // smooth hill north of a site at (180E, 89.5S); the grid covers only +-25 km so most rays leave it
    const [hx, hy] = lonLatToXY(180, -89.2)
    const g = synth(50, 40_000, (x, y) => 600 * Math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * 4000 ** 2)))
    const r = computeHorizon([g], 180, -89.5, 10, { nAz: 720, sMax: 100_000, bands: false })!
    const m = r.mask
    // seam: the step across 359.5 -> 0 must be no larger than the typical neighbour step
    let maxStep = 0
    for (let i = 1; i < m.n; i++) maxStep = Math.max(maxStep, Math.abs(m.mid[i] - m.mid[i - 1]))
    const seam = Math.abs(m.mid[0] - m.mid[m.n - 1])
    // exact elevation of the hill top along azimuth 0 (the hill is due north of the site in local terms)
    const pass = seam <= maxStep + 1e-6 && r.raysLeavingData > 0 && Number.isFinite(m.mid[0])
    record('V5', {
      test: 'Azimuth wrap for a site on the 180° meridian (89.5°S) with a hill across north; rays leaving a 80 km grid',
      criterion: 'no seam (step at 0° no larger than elsewhere); voids flagged, not fatal',
      measured: { seam_deg: seam, max_neighbour_step_deg: maxStep, rays_leaving_data: r.raysLeavingData, void_fraction: r.voidFrac },
      summary: `seam ${seam.toExponential(1)}° (max neighbour step ${maxStep.toExponential(1)}°), ${r.raysLeavingData}/720 rays flagged`,
      pass,
    })
    expect(pass).toBe(true)
    // the hill is at azimuth ~0 (north) in the local frame of a site on the 180 meridian toward the pole
    let iMax = 0
    for (let i = 0; i < m.n; i++) if (m.mid[i] > m.mid[iMax]) iMax = i
    expect(Math.min(iMax, m.n - iMax)).toBeLessThan(4)
  })

  it('confidence grade follows near_share thresholds (A needs a 5 m DEM)', () => {
    expect(confidenceGrade(0.05, 5)).toBe('A')
    expect(confidenceGrade(0.05, 240)).toBe('B')
    expect(confidenceGrade(0.2, 240)).toBe('B')
    expect(confidenceGrade(0.3, 240)).toBe('C')
  })
})

describe('horizon on LOLA 240 m (V1, V6, O2b, O2)', () => {
  const SITES: [string, number, number][] = [
    ['connecting ridge', -137.31, -89.45],
    ['shackleton rim 004', -155.73, -89.78],
    ['IM-2 Athena', 29.1957, -84.7906],
    ['Malapert M1', 2.7, -86.04],
  ]

  it('V1 round trip lat/lon <-> map <-> DEM pixel (5000 points) <= 1 m and <= 0.5 px', async () => {
    const g = await testDem()
    let maxM = 0
    let maxPx = 0
    let seed = 7
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    for (let i = 0; i < 5000; i++) {
      const lon = -180 + 360 * rnd()
      const lat = -90 + 10 * rnd()
      const [x, y] = lonLatToXY(lon, lat)
      const [lo2, la2] = xyToLonLat(x, y)
      const [x2, y2] = lonLatToXY(lo2, la2)
      maxM = Math.max(maxM, Math.hypot(x2 - x, y2 - y))
      const [c, r] = xyToPixel(g, x, y)
      const [x3, y3] = pixelToXY(g, c, r)
      maxPx = Math.max(maxPx, Math.hypot(x3 - x, y3 - y) / g.px)
    }
    record('V1', {
      test: 'Round trip lon/lat -> polar stereographic -> lon/lat -> map, and map -> DEM pixel -> map, 5000 random points 80-90 S',
      criterion: '<= 1 m and <= 0.5 px',
      measured: { max_m: maxM, max_px: maxPx },
      summary: `max ${maxM.toExponential(1)} m, ${maxPx.toExponential(1)} px`,
      pass: maxM <= 1 && maxPx <= 0.5,
    })
    expect(maxM).toBeLessThanOrEqual(1)
    expect(maxPx).toBeLessThanOrEqual(0.5)
    // the DEM decodes to the committed heights (spot value from v1: Shackleton rim site 004 z0 = 1733 m on 80 m DEM)
    expect(Math.abs(heightAt(g, -155.73, -89.78) - 1733)).toBeLessThan(150)
    expect(Number.isFinite(bilinearXY(g, 0, 0))).toBe(true)
  })

  it('V6 convergence on real terrain: halve azimuth step and ray step, double s_max <= 0.02 deg', async () => {
    const g = await testDem()
    const out: Record<string, number> = {}
    let worst = 0
    for (const [name, lon, lat] of SITES) {
      const a = computeHorizon([g], lon, lat, 10, { nAz: 720, sMax: 300_000, bands: false })!
      const b = computeHorizon([g], lon, lat, 10, { nAz: 1440, sMax: 600_000, stepScale: 0.5, bands: false })!
      let d = 0
      for (let i = 0; i < 720; i++) d = Math.max(d, Math.abs(a.mask.mid[i] - b.mask.mid[2 * i]))
      out[name] = d
      worst = Math.max(worst, d)
    }
    record('V6', {
      test: 'Convergence on LOLA 240 m terrain (4 sites, h = 10 m): 720 -> 1440 azimuths, ray step x0.5, s_max 300 -> 600 km',
      criterion: '<= 0.02 deg',
      measured: out,
      summary: Object.entries(out).map(([k, v]) => `${k} ${v.toFixed(4)}°`).join('; '),
      pass: worst <= 0.02,
    })
    expect(worst).toBeLessThanOrEqual(0.02)
  })

  it('O2b new horizon vs reference/v1 algorithm on the same 240 m DEM <= 0.05 deg', async () => {
    const g = await testDem()
    const v1grid = { z: g.z as Int16Array, n: g.nx, x0: g.x0, y0: g.y0, px: g.px, scale: g.scale, err: g.err }
    const out: Record<string, number> = {}
    const refinedGain: Record<string, number> = {}
    let worst = 0
    for (const [name, lon, lat] of SITES)
      for (const h of [2, 10]) {
        const a = computeHorizon([g], lon, lat, h, { nAz: 720, bands: false, refine: false })!
        const ar = computeHorizon([g], lon, lat, h, { nAz: 720, bands: false, refine: true })!
        const b = v1ComputeMask(v1grid, lon, lat, h, 720)!
        let d = 0
        let gain = 0
        for (let i = 0; i < 720; i++) {
          d = Math.max(d, Math.abs(a.mask.mid[i] - b.mask.mid[i]))
          gain = Math.max(gain, ar.mask.mid[i] - a.mask.mid[i])
        }
        out[`${name} h=${h}`] = d
        refinedGain[`${name} h=${h}`] = gain
        worst = Math.max(worst, d)
      }
    record('O2b', {
      test: 'Oracle: new horizon march (refinement off) vs the reference/v1 browser algorithm on the same LOLA 240 m DEM (4 sites x 2 heights, 720 azimuths). The production setting adds a golden-section refinement of each maximum, which only raises the horizon toward the exact maximum of the bilinear surface (V4 cone); its largest effect is reported',
      criterion: '<= 0.05 deg',
      measured: { base_vs_v1_deg: out, refinement_raises_by_deg: refinedGain },
      summary: `max ${worst.toFixed(4)}° (refinement adds up to ${Math.max(...Object.values(refinedGain)).toFixed(3)}°)`,
      pass: worst <= 0.05,
    })
    expect(worst).toBeLessThanOrEqual(0.05)
  })

  it('O2 report: live 240 m masks vs v1 80 m + 240 m precomputed masks (13 curated sites)', async () => {
    const g = await testDem()
    const dir = join(ROOT, 'reference/v1/web/public/data/masks')
    const out: Record<string, { h2: number; h10: number; rms10: number; z0_v1: number; z0_240: number }> = {}
    for (const f of readdirSync(dir)) {
      const v1 = JSON.parse(readFileSync(join(dir, f), 'utf8')) as V1MaskFile & { id: string }
      const site = (JSON.parse(readFileSync(join(ROOT, 'reference/v1/web/public/data/sites.json'), 'utf8')) as { id: string; lon: number; lat: number }[]).find((s) => s.id === v1.id)!
      const res: number[] = []
      let rms = 0
      let z0 = 0
      if (!computeHorizon([g], site.lon, site.lat, 10, { nAz: 4, sMax: 1000, bands: false })) continue // outside 80-90 S
      for (const h of ['2', '10']) {
        const m1 = maskFromV1(v1, h)
        const r = computeHorizon([g], site.lon, site.lat, Number(h), { nAz: 720, bands: false })!
        z0 = r.z0
        let d = 0
        let ss = 0
        for (let i = 0; i < 720; i++) {
          const e = Math.abs(r.mask.mid[i] - maskAt(m1, i / 2))
          d = Math.max(d, e)
          ss += e * e
        }
        res.push(d)
        rms = Math.sqrt(ss / 720)
      }
      out[v1.id] = { h2: res[0], h10: res[1], rms10: rms, z0_v1: v1.z0, z0_240: z0 }
    }
    const worst10 = Math.max(...Object.values(out).map((o) => o.h10))
    record('O2_240m', {
      test: 'Report only: live masks on the 240 m DEM vs v1 precomputed masks (80 m product + 240 m far field). Different DEM resolution, so not an algorithm check (see O2b)',
      criterion: 'informative; O2 proper needs the 80 m product (unreachable in this environment)',
      measured: out,
      summary: `max |Δ| at 10 m: ${worst10.toFixed(2)}°`,
      pass: true,
    })
    expect(Object.keys(out).length).toBeGreaterThanOrEqual(11)
  })
})
