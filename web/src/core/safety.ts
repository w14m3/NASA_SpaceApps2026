// Landing-surface screening (contract §6.10, §7.10). Screening estimates at the DEM baseline, not certification.
// Ignores leg stroke and crush cores, plume–surface interaction, soil failure and rocks smaller than the pixel.
import { D2R, G_MOON, R2D } from './constants'
import { bilinearXY, type DemGrid } from './dem'
import { destination, lonLatToXY, scaleFactor } from './projection'
import { gaussian, mulberry32 } from './rng'

export interface PlaneFit {
  /** slope of the least-squares plane, deg */
  slope: number
  /** azimuth of steepest descent, deg clockwise from local north */
  downhill: number
  /** RMS residual about the plane, m */
  roughness: number
  /** largest |residual|, m */
  maxStep: number
  /** diameter of the fitting disk, m (the slope baseline) */
  baseline: number
  n: number
}

/**
 * Least-squares plane z = a + b·E + c·N through DEM heights sampled on a regular sub-pixel grid inside a disk of
 * diameter `baseline` (true metres) centred on (lon, lat). Map offsets are converted to true local east/north with
 * the projection's point scale factor and meridian convergence.
 */
export function planeFit(g: DemGrid, lon: number, lat: number, baseline: number): PlaneFit | null {
  const [x0, y0] = lonLatToXY(lon, lat)
  const k = scaleFactor(lat)
  const lo = lon * D2R
  // local unit vectors in map coordinates (south polar stereographic): north = radially outward
  const nx = Math.sin(lo)
  const ny = Math.cos(lo)
  const ex = Math.cos(lo)
  const ey = -Math.sin(lo)
  const rTrue = baseline / 2
  const step = Math.max(g.px / 4, baseline / 40)
  const E: number[] = []
  const N: number[] = []
  const Z: number[] = []
  for (let de = -rTrue; de <= rTrue + 1e-9; de += step)
    for (let dn = -rTrue; dn <= rTrue + 1e-9; dn += step) {
      if (de * de + dn * dn > rTrue * rTrue) continue
      const x = x0 + k * (de * ex + dn * nx)
      const y = y0 + k * (de * ey + dn * ny)
      const z = bilinearXY(g, x, y)
      if (Number.isNaN(z)) continue
      E.push(de)
      N.push(dn)
      Z.push(z)
    }
  const n = Z.length
  if (n < 6) return null
  let me = 0
  let mn = 0
  let mz = 0
  for (let i = 0; i < n; i++) {
    me += E[i]
    mn += N[i]
    mz += Z[i]
  }
  me /= n
  mn /= n
  mz /= n
  let see = 0
  let snn = 0
  let sen = 0
  let sez = 0
  let snz = 0
  for (let i = 0; i < n; i++) {
    const e = E[i] - me
    const nn = N[i] - mn
    const z = Z[i] - mz
    see += e * e
    snn += nn * nn
    sen += e * nn
    sez += e * z
    snz += nn * z
  }
  const det = see * snn - sen * sen
  const b = (sez * snn - snz * sen) / det // dz/dE
  const c = (snz * see - sez * sen) / det // dz/dN
  let ss = 0
  let mx = 0
  for (let i = 0; i < n; i++) {
    const r = Z[i] - mz - b * (E[i] - me) - c * (N[i] - mn)
    ss += r * r
    mx = Math.max(mx, Math.abs(r))
  }
  const slope = Math.atan(Math.hypot(b, c)) * R2D
  const downhill = ((Math.atan2(-b, -c) * R2D) % 360 + 360) % 360
  return { slope, downhill, roughness: Math.sqrt(ss / n), maxStep: mx, baseline, n }
}

export interface LanderPreset {
  id: 'small' | 'medium' | 'large'
  legs: number
  /** radius of the footpad circle, m */
  padRadius: number
  /** centre-of-gravity height above the pad plane, m */
  cgHeight: number
  /** radius of gyration about the CG, m */
  gyration: number
  /** footprint diameter used for the plane fit (≥ 1.5 DEM pixels in practice), m */
  footprint: number
  /** design lateral touchdown velocity, m/s */
  vDesign: number
  /** minimum static tip-over margin, deg */
  minMargin: number
  /** attitude dispersion at touchdown, deg */
  attitudeDispersion: number
}

/** Generic, illustrative presets — every value is an assumption, editable in the UI (contract R13). */
export const LANDERS: Record<LanderPreset['id'], LanderPreset> = {
  small: { id: 'small', legs: 4, padRadius: 1.5, cgHeight: 1.2, gyration: 0.8, footprint: 3, vDesign: 1.0, minMargin: 10, attitudeDispersion: 2 },
  medium: { id: 'medium', legs: 4, padRadius: 2.5, cgHeight: 2.5, gyration: 1.5, footprint: 5, vDesign: 1.0, minMargin: 10, attitudeDispersion: 2 },
  large: { id: 'large', legs: 4, padRadius: 4.5, cgHeight: 6.0, gyration: 3.0, footprint: 9, vDesign: 1.0, minMargin: 10, attitudeDispersion: 2 },
}

export interface TipOver {
  /** worst-case pivot distance r = R_p cos(π/n), m */
  pivot: number
  /** static tip angle atan(r/h), deg */
  tipAngle: number
  /** effective tilt τ = σ + δσ + attitude dispersion, deg */
  tilt: number
  /** static margin M = θ_tip − τ, deg */
  margin: number
  /** critical lateral touchdown velocity, m/s (0 when M ≤ 0) */
  vCrit: number
  verdict: 'green' | 'amber' | 'red'
}

/** v_crit = sqrt(2 g L (1 − cos M)(L² + k²)) / h, L = sqrt(r² + h²) (rigid body, first order). */
export function tipOver(p: LanderPreset, slopeDeg: number, slopeUncDeg: number, g = G_MOON): TipOver {
  const r = p.padRadius * Math.cos(Math.PI / p.legs)
  const h = p.cgHeight
  const tipAngle = Math.atan(r / h) * R2D
  const tilt = slopeDeg + slopeUncDeg + p.attitudeDispersion
  const margin = tipAngle - tilt
  const L = Math.hypot(r, h)
  const M = Math.max(0, margin) * D2R
  const vCrit = Math.sqrt(2 * g * L * (1 - Math.cos(M)) * (L * L + p.gyration * p.gyration)) / h
  const verdict = margin >= p.minMargin && vCrit >= p.vDesign ? 'green' : margin >= 0 ? 'amber' : 'red'
  return { pivot: r, tipAngle, tilt, margin, vCrit, verdict }
}

export interface Ellipse {
  /** 3-sigma semi-major / semi-minor axes, m */
  a: number
  b: number
  /** orientation of the major axis, deg from north */
  orientation: number
}

export interface EllipseResult {
  n: number
  seed: number
  pSafe: number
  slope: [number, number, number] // P10, P50, P90
  margin: [number, number, number]
  vCrit: [number, number, number]
  samples: { lon: number; lat: number; slope: number; safe: boolean }[]
}

function pct(a: number[], q: number): number {
  const s = [...a].sort((x, y) => x - y)
  const i = (s.length - 1) * q
  const lo = Math.floor(i)
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo)
}

/** Seeded landing-ellipse Monte Carlo (N = 500 default): P(safe) = share with M ≥ M_min and σ ≤ S_max. */
export function ellipseMonteCarlo(g: DemGrid, lon: number, lat: number, e: Ellipse, p: LanderPreset, sMax: number, slopeUnc: number, baseline: number, n = 500, seed = 1): EllipseResult {
  const rnd = mulberry32(seed)
  const gauss = gaussian(rnd)
  const slopes: number[] = []
  const margins: number[] = []
  const vs: number[] = []
  const samples: EllipseResult['samples'] = []
  let safe = 0
  for (let i = 0; i < n; i++) {
    const u = (gauss() * e.a) / 3
    const v = (gauss() * e.b) / 3
    const d = Math.hypot(u, v)
    const az = e.orientation + Math.atan2(v, u) * R2D
    const [lo, la] = destination(lon, lat, az, d)
    const f = planeFit(g, lo, la, baseline)
    if (!f) continue
    const t = tipOver(p, f.slope, slopeUnc)
    const ok = t.margin >= p.minMargin && f.slope <= sMax
    if (ok) safe++
    slopes.push(f.slope)
    margins.push(t.margin)
    vs.push(t.vCrit)
    samples.push({ lon: lo, lat: la, slope: f.slope, safe: ok })
  }
  const m = slopes.length || 1
  return {
    n: slopes.length,
    seed,
    pSafe: safe / m,
    slope: [pct(slopes, 0.1), pct(slopes, 0.5), pct(slopes, 0.9)],
    margin: [pct(margins, 0.1), pct(margins, 0.5), pct(margins, 0.9)],
    vCrit: [pct(vs, 0.1), pct(vs, 0.5), pct(vs, 0.9)],
    samples,
  }
}

/** Typical RMS slope uncertainty for LOLA-derived DEM slopes, used when the product gives none (labelled). */
export const SLOPE_UNCERTAINTY_DEG = 2
/** Default maximum slope: 8° (literature example, Barker et al. 2021, Planet. Space Sci. 203, 105119; editable). */
export const DEFAULT_MAX_SLOPE = 8
