// Horizon masks, disk-visibility fractions, time series and rise/set events.
import { Ephemeris, AU_KM, SOLAR_CONSTANT, type Body } from './ephem'
import { azel, sunEarthSeparation, type AzEl, type SiteFrame } from './geom'

/** Horizon elevation (deg) per azimuth; index i is azimuth 360*i/n clockwise from north. */
export interface Mask {
  n: number
  mid: Float32Array
  lo: Float32Array
  hi: Float32Array
  /** distance (km) of the terrain point that defines the horizon; absent for the smooth sphere */
  dist?: Float32Array
  /** 'dem80' | 'dem240' | 'sphere' */
  kind: string
}

export type MaskBand = 'mid' | 'lo' | 'hi'

export function flatMask(dipDeg: number, n = 360): Mask {
  const a = new Float32Array(n).fill(dipDeg)
  return { n, mid: a, lo: a, hi: a, kind: 'sphere' }
}

export function maskAt(m: Mask, azDeg: number, band: MaskBand = 'mid'): number {
  const arr = m[band]
  let x = (azDeg / 360) * m.n
  x -= Math.floor(x / m.n) * m.n
  const i = Math.floor(x)
  const f = x - i
  return arr[i] * (1 - f) + arr[(i + 1) % m.n] * f
}

/**
 * Fraction of a uniform disk above the mask (2-D quadrature in vertical strips).
 * Azimuth offsets are divided by cos(el) so strips have equal great-circle width.
 */
export function diskFraction(m: Mask, p: AzEl, band: MaskBand = 'mid', strips = 200): number {
  const cosEl = Math.max(0.05, Math.cos((p.el * Math.PI) / 180))
  // fast exits
  let lo = Infinity
  let hi = -Infinity
  for (let k = -1; k <= 1; k++) {
    const v = maskAt(m, p.az + (k * p.rad) / cosEl, band)
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (p.el - p.rad > hi + 0.5) return 1
  if (p.el + p.rad < lo - 0.5) return 0
  let vis = 0
  let tot = 0
  for (let s = 0; s < strips; s++) {
    const x = (-1 + (2 * (s + 0.5)) / strips) * p.rad
    const half = Math.sqrt(p.rad * p.rad - x * x)
    const mk = maskAt(m, p.az + x / cosEl, band)
    const v = Math.min(2 * half, Math.max(0, p.el + half - mk))
    vis += v
    tot += 2 * half
  }
  return vis / tot
}

export interface Sample {
  t: number
  sun: AzEl
  earth: AzEl
  sunFrac: number
  earthFrac: number
  /** Earth centre elevation minus mask, deg */
  earthMargin: number
  /** Sun upper-limb elevation minus mask at the Sun's azimuth, deg */
  sunLimbMargin: number
  sep: number
  /** solar flux at the Moon, W/m^2 (inverse-square from 1360.8 at 1 au) */
  flux: number
}

export function sample(eph: Ephemeris, f: SiteFrame, m: Mask, t: number, band: MaskBand = 'mid'): Sample {
  const sun = azel(eph, 'SUN', t, f)
  const earth = azel(eph, 'EARTH', t, f)
  const d = sun.range / AU_KM
  return {
    t,
    sun,
    earth,
    sunFrac: diskFraction(m, sun, band),
    earthFrac: diskFraction(m, earth, band),
    earthMargin: earth.el - maskAt(m, earth.az, band),
    sunLimbMargin: sun.el + sun.rad - maskAt(m, sun.az, band),
    sep: sunEarthSeparation(sun, earth),
    flux: SOLAR_CONSTANT / (d * d),
  }
}

export interface Thresholds {
  /** Sun counts as "lit" when at least this fraction of the disk is visible */
  sunFrac: number
  /** Earth counts as "in view" when at least this fraction of its disk is visible */
  earthFrac: number
}
export const DEFAULT_THRESHOLDS: Thresholds = { sunFrac: 0.01, earthFrac: 0.5 }

/** Signed visibility function: > 0 when the body counts as visible. */
export function visFn(eph: Ephemeris, f: SiteFrame, m: Mask, body: Body, thr: Thresholds, band: MaskBand) {
  const th = body === 'SUN' ? thr.sunFrac : thr.earthFrac
  return (t: number) => diskFraction(m, azel(eph, body, t, f), band) - th
}

export interface Interval {
  start: number
  end: number
  /** true when the interval is cut by the analysis window rather than by an event */
  openStart: boolean
  openEnd: boolean
}

/** Refine a sign change of g inside [a, b] to tolMs by bisection (g(a), g(b) have opposite sign). */
export function refine(g: (t: number) => number, a: number, b: number, ga: number, tolMs = 1000): number {
  while (b - a > tolMs) {
    const mid = 0.5 * (a + b)
    const gm = g(mid)
    if (gm > 0 === ga > 0) {
      a = mid
      ga = gm
    } else b = mid
  }
  return 0.5 * (a + b)
}

/**
 * Visible intervals of g > 0 on [t0, t1]: coarse scan (stepMs <= 10 min) then
 * bisection to 1 s. Grazing events shorter than the scan step are caught by
 * probing local extrema of g between scan points.
 */
export function intervals(g: (t: number) => number, t0: number, t1: number, stepMs = 600_000): Interval[] {
  const out: Interval[] = []
  let prevT = t0
  let prevG = g(t0)
  let prevPrevG = prevG
  let cur: Interval | null = prevG > 0 ? { start: t0, end: t1, openStart: true, openEnd: true } : null
  const cross = (a: number, b: number, ga: number, gb: number) => {
    const tc = refine(g, a, b, ga)
    if (gb > 0) cur = { start: tc, end: t1, openStart: false, openEnd: true }
    else if (cur) {
      cur.end = tc
      cur.openEnd = false
      out.push(cur)
      cur = null
    }
  }
  for (let t = t0 + stepMs; prevT < t1; t += stepMs) {
    const tt = Math.min(t, t1)
    const gt = g(tt)
    if (gt > 0 !== prevG > 0) {
      cross(prevT, tt, prevG, gt)
    } else {
      // same sign at both ends: look for a grazing excursion through zero in between
      const towardZero = prevG > 0 ? prevG < prevPrevG || gt > prevG : prevG > prevPrevG || gt < prevG
      if (towardZero && Math.abs(prevG) < 0.2 && tt - prevT > 2000) {
        const n = 20
        let a = prevT
        let ga = prevG
        for (let i = 1; i <= n; i++) {
          const b = prevT + ((tt - prevT) * i) / n
          const gb = i === n ? gt : g(b)
          if (gb > 0 !== ga > 0) cross(a, b, ga, gb)
          a = b
          ga = gb
        }
      }
    }
    prevPrevG = prevG
    prevG = gt
    prevT = tt
  }
  if (cur) out.push(cur)
  return out
}

export function totalDuration(iv: Interval[]): number {
  let s = 0
  for (const i of iv) s += i.end - i.start
  return s
}

/** Gaps between visible intervals inside [t0, t1]. */
export function gaps(iv: Interval[], t0: number, t1: number): Interval[] {
  const out: Interval[] = []
  let a = t0
  let open = true
  for (const i of iv) {
    if (i.start > a) out.push({ start: a, end: i.start, openStart: open, openEnd: false })
    a = i.end
    open = false
  }
  if (a < t1) out.push({ start: a, end: t1, openStart: open, openEnd: true })
  return out
}

export function longest(iv: Interval[]): Interval | null {
  let best: Interval | null = null
  for (const i of iv) if (!best || i.end - i.start > best.end - best.start) best = i
  return best
}

/** Next change of state after t (ms), searching up to horizonMs ahead; null if none. */
export function nextChange(g: (t: number) => number, t: number, horizonMs: number, stepMs = 600_000): number | null {
  let a = t
  let ga = g(t)
  const s0 = ga > 0
  for (let b = t + stepMs; b <= t + horizonMs; b += stepMs) {
    const gb = g(b)
    if (gb > 0 !== s0) return refine(g, a, b, ga)
    a = b
    ga = gb
  }
  return null
}
