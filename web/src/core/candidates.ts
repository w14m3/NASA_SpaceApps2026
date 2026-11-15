// Candidate grid artifact (built by web/scripts/build-candidates.ts with the same horizon code as the browser).
import { CANDIDATE_NAZ, MASK_STEP_DEG, type HeroRegion } from './regions'
import { lonLatToXY, xyToLonLat } from './projection'
import type { Mask } from './mask'

export interface CandidateGrid {
  region: HeroRegion
  n: number
  nx: number
  lon: Float32Array
  lat: Float32Array
  x: Float32Array
  y: Float32Array
  z0: Float32Array
  slope: Float32Array
  downhill: Float32Array
  rough: Float32Array
  heights: number[]
  /** per height: offset (0.1° units) and masks uint8 [n × 360] */
  offset: Int16Array[]
  masks: Uint8Array[]
  near: Uint8Array[] // percent
  slopeBaselineM: number
  demLabel: string
}

export function gridPoints(r: HeroRegion) {
  const [cx, cy] = lonLatToXY(r.lon, r.lat)
  const nx = Math.round((r.sizeKm * 1000) / r.spacingM) + 1
  const half = ((nx - 1) * r.spacingM) / 2
  const pts: { x: number; y: number; lon: number; lat: number }[] = []
  for (let j = 0; j < nx; j++)
    for (let i = 0; i < nx; i++) {
      const x = cx - half + i * r.spacingM
      const y = cy + half - j * r.spacingM
      const [lon, lat] = xyToLonLat(x, y)
      pts.push({ x, y, lon, lat })
    }
  return { nx, pts }
}

/** Decode one candidate's mask at height index hi into a Mask (mid only; lo/hi bands are not stored). */
export function candidateMask(g: CandidateGrid, i: number, hi: number): Mask {
  const mid = new Float32Array(CANDIDATE_NAZ)
  const off = g.offset[hi][i] * MASK_STEP_DEG
  const m = g.masks[hi]
  for (let k = 0; k < CANDIDATE_NAZ; k++) mid[k] = off + m[i * CANDIDATE_NAZ + k] * MASK_STEP_DEG
  return { n: CANDIDATE_NAZ, mid, lo: mid, hi: mid, kind: `${g.demLabel}, 360 azimuths (candidate grid)`, nearShare: g.near[hi][i] / 100, finestPx: 240 }
}

/** Fast mask lookup without allocation (deg). */
export function candidateMaskAt(g: CandidateGrid, i: number, hi: number, az: number): number {
  let x = (az / 360) * CANDIDATE_NAZ
  x -= Math.floor(x / CANDIDATE_NAZ) * CANDIDATE_NAZ
  const k = Math.floor(x)
  const f = x - k
  const m = g.masks[hi]
  const b = i * CANDIDATE_NAZ
  const v = m[b + k] * (1 - f) + m[b + ((k + 1) % CANDIDATE_NAZ)] * f
  return (g.offset[hi][i] + v) * MASK_STEP_DEG
}

export function parseCandidates(region: HeroRegion, meta: { n: number; nx: number; heights: number[]; slope_baseline_m: number; dem_label: string }, buf: ArrayBuffer): CandidateGrid {
  const n = meta.n
  let o = 0
  const f32 = () => {
    const a = new Float32Array(buf, o, n)
    o += n * 4
    return a
  }
  const lon = f32()
  const lat = f32()
  const x = f32()
  const y = f32()
  const z0 = f32()
  const slope = f32()
  const downhill = f32()
  const rough = f32()
  const offset: Int16Array[] = []
  const masks: Uint8Array[] = []
  const near: Uint8Array[] = []
  for (let h = 0; h < meta.heights.length; h++) {
    offset.push(new Int16Array(buf.slice(o, o + n * 2)))
    o += n * 2
    masks.push(new Uint8Array(buf, o, n * CANDIDATE_NAZ))
    o += n * CANDIDATE_NAZ
    near.push(new Uint8Array(buf, o, n))
    o += n
    o = Math.ceil(o / 4) * 4
  }
  return { region, n, nx: meta.nx, lon, lat, x, y, z0, slope, downhill, rough, heights: meta.heights, offset, masks, near, slopeBaselineM: meta.slope_baseline_m, demLabel: meta.dem_label }
}
