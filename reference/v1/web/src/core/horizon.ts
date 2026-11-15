// In-browser horizon mask for custom sites, from the 240 m south-polar DEM.
// Same algorithm as pipeline/lunarnav/horizon.py (great-circle march, half-pixel steps).
import type { Mask } from './visibility'

export const R_M = 1_737_400

export interface DemGrid {
  /** heights in units of `scale` metres, row-major, north-up; NODATA = -32768 */
  z: Int16Array
  n: number // square grid n x n
  x0: number // m, outer edge of column 0
  y0: number // m, outer edge of row 0
  px: number // m
  scale: number // m per count
  /** nominal 1-sigma height error, m (assumption shown in the UI) */
  err: number
}

const NODATA = -32768

function bilinear(g: DemGrid, x: number, y: number): number {
  const c = (x - g.x0) / g.px - 0.5
  const r = (g.y0 - y) / g.px - 0.5
  const c0 = Math.floor(c)
  const r0 = Math.floor(r)
  if (c0 < 0 || r0 < 0 || c0 + 1 >= g.n || r0 + 1 >= g.n) return NaN
  const i = r0 * g.n + c0
  const a = g.z[i]
  const b = g.z[i + 1]
  const d = g.z[i + g.n]
  const e = g.z[i + g.n + 1]
  if (a === NODATA || b === NODATA || d === NODATA || e === NODATA) return NaN
  const fc = c - c0
  const fr = r - r0
  return ((a * (1 - fc) + b * fc) * (1 - fr) + (d * (1 - fc) + e * fc) * fr) * g.scale
}

/** South polar stereographic (sphere R_M, true scale at the pole, lon0 = 0). */
export function lonLatToXY(lonDeg: number, latDeg: number): [number, number] {
  const lon = (lonDeg * Math.PI) / 180
  const lat = (latDeg * Math.PI) / 180
  const k = (2 * R_M * Math.cos(lat)) / (1 - Math.sin(lat))
  return [k * Math.sin(lon), k * Math.cos(lon)]
}

export function xyToLonLat(x: number, y: number): [number, number] {
  const r = Math.hypot(x, y)
  const lat = 2 * Math.atan(r / (2 * R_M)) - Math.PI / 2
  return [(Math.atan2(x, y) * 180) / Math.PI, (lat * 180) / Math.PI]
}

export function demHeight(g: DemGrid, lonDeg: number, latDeg: number): number {
  const [x, y] = lonLatToXY(lonDeg, latDeg)
  return bilinear(g, x, y)
}

export interface MaskResult {
  mask: Mask
  z0: number
  /** largest fraction of a ray that fell outside DEM coverage */
  maxVoid: number
}

export function computeMask(
  g: DemGrid,
  lonDeg: number,
  latDeg: number,
  h: number,
  nAz = 720,
  sMax = 300_000,
): MaskResult | null {
  const z0 = demHeight(g, lonDeg, latDeg)
  if (Number.isNaN(z0)) return null
  const lon = (lonDeg * Math.PI) / 180
  const lat = (latDeg * Math.PI) / 180
  const up = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
  const east = [-Math.sin(lon), Math.cos(lon), 0]
  const north = [
    up[1] * east[2] - up[2] * east[1],
    up[2] * east[0] - up[0] * east[2],
    up[0] * east[1] - up[1] * east[0],
  ]
  const rho0 = R_M + z0 + h
  const e = g.err
  const mid = new Float32Array(nAz)
  const lo = new Float32Array(nAz)
  const hi = new Float32Array(nAz)
  const dist = new Float32Array(nAz)
  const step = g.px * 0.5
  let maxVoid = 0
  const R2D = 180 / Math.PI
  for (let i = 0; i < nAz; i++) {
    const a = (2 * Math.PI * i) / nAz
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const d0 = north[0] * ca + east[0] * sa
    const d1 = north[1] * ca + east[1] * sa
    const d2 = north[2] * ca + east[2] * sa
    let best = -Math.PI / 2
    let bestHi = -Math.PI / 2
    let bestLo = -Math.PI / 2
    let bestS = 0
    let nSteps = 0
    let nVoid = 0
    // near field: 1 % of the distance per step (kinks of the bilinear surface), capped at half a pixel
    for (let s = 2; s <= sMax; s += Math.min(step, Math.max(0.5, 0.01 * s))) {
      const th = s / R_M
      const ct = Math.cos(th)
      const st = Math.sin(th)
      const p0 = up[0] * ct + d0 * st
      const p1 = up[1] * ct + d1 * st
      const p2 = up[2] * ct + d2 * st
      const k = (2 * R_M) / (1 - p2)
      const z = bilinear(g, k * p1, k * p0)
      nSteps++
      if (Number.isNaN(z)) {
        nVoid++
        continue
      }
      const rho = R_M + z
      const eps = Math.atan2(rho * ct - rho0, rho * st)
      if (eps > best) {
        best = eps
        bestS = s
      }
      // relative height error ramps from 0 at the observer to 2e beyond two pixels (see horizon.py)
      const d = 2 * e * Math.min(1, s / (2 * g.px))
      const eh = Math.atan2((rho + d) * ct - rho0, (rho + d) * st)
      if (eh > bestHi) bestHi = eh
      const el = Math.atan2((rho - d) * ct - rho0, (rho - d) * st)
      if (el > bestLo) bestLo = el
    }
    mid[i] = best * R2D
    lo[i] = bestLo * R2D
    hi[i] = bestHi * R2D
    dist[i] = bestS / 1000
    if (nSteps > 0) maxVoid = Math.max(maxVoid, nVoid / nSteps)
  }
  return { mask: { n: nAz, mid, lo, hi, dist, kind: 'dem240' }, z0, maxVoid }
}
