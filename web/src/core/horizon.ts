// Terrain horizon mask (contract §7.5) with uncertainty band and confidence (§7.6).
// For azimuth α march along the great circle from the site; at arc length s (θ = s/R) the terrain radius is
// ρ = R + z(s) and the observer radius ρ₀ = R + z₀ + h:   ε(s) = atan2(ρ cos θ − ρ₀, ρ sin θ), mask = max ε.
// Lunar curvature is included (flat terrain gives the dip −acos(R/ρ₀)). Grids are a cascade, finest first.
// Radial step: 1 % of the distance near the site, capped at half a pixel of the active grid (a plain half-pixel
// step fails convergence for low masts, see reference/v1 DECISIONS 7).
import { R2D, R_MOON_M } from './constants'
import { bilinearXY, type DemGrid } from './dem'
import type { Mask } from './mask'
import { lonLatToXY, unitToXY } from './projection'

export interface HorizonOptions {
  nAz?: number
  sMax?: number // m
  /** multiply the step (V6 convergence test uses 0.5) */
  stepScale?: number
  /** compute lo/hi uncertainty bands */
  bands?: boolean
  /** golden-section refinement of each maximum between neighbouring steps (default true; DECISIONS D5) */
  refine?: boolean
}

export interface HorizonResult {
  mask: Mask
  z0: number
  /** RMS residual of a plane fit within 3 pixels of the site, m (sub-pixel relief term δ_rough) */
  rough: number
  /** fraction of all ray steps that fell outside every grid */
  voidFrac: number
  /** number of azimuths whose ray left the data before s_max */
  raysLeavingData: number
}

/** Plane-fit RMS residual of the finest grid within ±3 pixels of (x, y). */
export function localRoughness(g: DemGrid, x: number, y: number, k = 3): number {
  const xs: number[] = []
  const ys: number[] = []
  const zs: number[] = []
  for (let j = -k; j <= k; j++)
    for (let i = -k; i <= k; i++) {
      const z = bilinearXY(g, x + i * g.px, y + j * g.px)
      if (!Number.isNaN(z)) {
        xs.push(i * g.px)
        ys.push(j * g.px)
        zs.push(z)
      }
    }
  const n = zs.length
  if (n < 6) return 0
  // least squares z = a + b x + c y on a symmetric stencil: normal equations decouple
  let sx2 = 0
  let sy2 = 0
  let sxy = 0
  let sxz = 0
  let syz = 0
  let sz = 0
  for (let i = 0; i < n; i++) {
    sx2 += xs[i] * xs[i]
    sy2 += ys[i] * ys[i]
    sxy += xs[i] * ys[i]
    sxz += xs[i] * zs[i]
    syz += ys[i] * zs[i]
    sz += zs[i]
  }
  const a = sz / n
  const det = sx2 * sy2 - sxy * sxy
  const b = (sxz * sy2 - syz * sxy) / det
  const c = (syz * sx2 - sxz * sxy) / det
  let ss = 0
  for (let i = 0; i < n; i++) {
    const r = zs[i] - (a + b * xs[i] + c * ys[i])
    ss += r * r
  }
  return Math.sqrt(ss / n)
}

export function computeHorizon(
  grids: DemGrid[],
  lonDeg: number,
  latDeg: number,
  h: number,
  opts: HorizonOptions = {},
): HorizonResult | null {
  const nAz = opts.nAz ?? 720
  const sMax = opts.sMax ?? 300_000
  const stepScale = opts.stepScale ?? 1
  const bands = opts.bands ?? true
  const refineMax = opts.refine ?? true
  const [sx, sy] = lonLatToXY(lonDeg, latDeg)
  let z0 = NaN
  let g0: DemGrid | null = null
  for (const g of grids) {
    z0 = bilinearXY(g, sx, sy)
    if (!Number.isNaN(z0)) {
      g0 = g
      break
    }
  }
  if (!g0) return null
  const rough = localRoughness(g0, sx, sy)
  const lon = (lonDeg * Math.PI) / 180
  const lat = (latDeg * Math.PI) / 180
  const up = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
  const east = [-Math.sin(lon), Math.cos(lon), 0]
  const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]]
  const rho0 = R_MOON_M + z0 + h
  const mid = new Float32Array(nAz)
  const lo = new Float32Array(nAz)
  const hi = new Float32Array(nAz)
  const dist = new Float32Array(nAz)
  let near = 0
  let nSteps = 0
  let nVoid = 0
  let leaving = 0
  const sigSite = g0.err
  for (let i = 0; i < nAz; i++) {
    const a = (2 * Math.PI * i) / nAz
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const d0 = north[0] * ca + east[0] * sa
    const d1 = north[1] * ca + east[1] * sa
    const d2 = north[2] * ca + east[2] * sa
    let best = -Math.PI / 2
    let bestLo = -Math.PI / 2
    let bestHi = -Math.PI / 2
    let bestS = 0
    let bestPx = g0.px
    let lastValid = 0
    let s = 2 * stepScale
    while (s <= sMax) {
      const th = s / R_MOON_M
      const ct = Math.cos(th)
      const st = Math.sin(th)
      const [x, y] = unitToXY(up[0] * ct + d0 * st, up[1] * ct + d1 * st, up[2] * ct + d2 * st)
      let z = NaN
      let g: DemGrid | null = null
      for (const gg of grids) {
        z = bilinearXY(gg, x, y)
        if (!Number.isNaN(z)) {
          g = gg
          break
        }
      }
      nSteps++
      const px = g ? g.px : grids[grids.length - 1].px
      if (g) {
        lastValid = s
        const rho = R_MOON_M + z
        const eps = Math.atan2(rho * ct - rho0, rho * st)
        if (eps > best) {
          best = eps
          bestS = s
          bestPx = px
        }
        if (bands) {
          // δ(s) = sqrt(δ_corr² + δ_rough²), δ_corr = (σ_terrain + σ_site)·min(1, s / 2 px)  (§7.6)
          const dc = (g.err + sigSite) * Math.min(1, s / (2 * px))
          const d = Math.sqrt(dc * dc + rough * rough)
          const eh = Math.atan2((rho + d) * ct - rho0, (rho + d) * st)
          if (eh > bestHi) bestHi = eh
          const el = Math.atan2((rho - d) * ct - rho0, (rho - d) * st)
          if (el > bestLo) bestLo = el
        }
      } else nVoid++
      s += Math.min(0.5 * px, Math.max(0.5, 0.01 * s)) * stepScale
    }
    if (lastValid < sMax - 1000) leaving++
    if (refineMax && bestS > 0) {
      // refine the maximum between the neighbouring steps (golden section): removes the step-discretisation error
      // at kinks of the bilinear surface (cone apex, ridge crests)
      const stepAt = Math.min(0.5 * bestPx, Math.max(0.5, 0.01 * bestS)) * stepScale
      const f = (ss: number) => {
        const th = ss / R_MOON_M
        const ct = Math.cos(th)
        const st = Math.sin(th)
        const [x, y] = unitToXY(up[0] * ct + d0 * st, up[1] * ct + d1 * st, up[2] * ct + d2 * st)
        for (const gg of grids) {
          const z = bilinearXY(gg, x, y)
          if (!Number.isNaN(z)) return Math.atan2((R_MOON_M + z) * ct - rho0, (R_MOON_M + z) * st)
        }
        return -Math.PI / 2
      }
      let a = Math.max(1, bestS - stepAt)
      let b = bestS + stepAt
      const gr = 0.6180339887498949
      let c = b - gr * (b - a)
      let d = a + gr * (b - a)
      let fc = f(c)
      let fd = f(d)
      for (let it = 0; it < 40 && b - a > 1e-3; it++) {
        if (fc > fd) {
          b = d
          d = c
          fd = fc
          c = b - gr * (b - a)
          fc = f(c)
        } else {
          a = c
          c = d
          fc = fd
          d = a + gr * (b - a)
          fd = f(d)
        }
      }
      const refined = Math.max(fc, fd)
      if (refined > best) {
        if (bands) {
          bestHi += refined - best
          bestLo += refined - best
        }
        best = refined
      }
    }
    mid[i] = best * R2D
    lo[i] = (bands ? bestLo : best) * R2D
    hi[i] = (bands ? bestHi : best) * R2D
    dist[i] = bestS / 1000
    if (bestS < 3 * bestPx) near++
  }
  const nearShare = near / nAz
  return {
    mask: { n: nAz, mid, lo, hi, dist, kind: grids.map((g) => g.label).join(' + '), nearShare, finestPx: g0.px },
    z0,
    rough,
    voidFrac: nSteps ? nVoid / nSteps : 1,
    raysLeavingData: leaving,
  }
}

/** Confidence grade per §7.6: A (near_share < 10 % and a 5 m DEM), B (< 25 %), C otherwise. */
export function confidenceGrade(nearShare: number, finestPx: number): 'A' | 'B' | 'C' {
  if (nearShare < 0.1 && finestPx <= 5) return 'A'
  if (nearShare < 0.25) return 'B'
  return 'C'
}
