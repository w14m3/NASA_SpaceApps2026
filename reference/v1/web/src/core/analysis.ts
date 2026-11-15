// Window analysis for one site: time series, exact events, metrics, scores, energy.
import { Ephemeris } from './ephem'
import { siteFrame, type SiteFrame } from './geom'
import {
  DEFAULT_THRESHOLDS,
  gaps,
  intervals,
  longest,
  nextChange,
  sample,
  totalDuration,
  visFn,
  type Interval,
  type Mask,
  type MaskBand,
  type Sample,
} from './visibility'

export const HOUR = 3600_000
export const DAY = 86400_000
/** mean synodic month, hours */
export const SYNODIC_H = 29.530589 * 24

export type PanelKind = 'flat' | 'track' | 'vertS' | 'vertN' | 'vertE' | 'vertW'
export const PANEL_LABEL: Record<PanelKind, string> = {
  flat: 'Flat, horizontal',
  track: 'Vertical, Sun-tracking (azimuth)',
  vertN: 'Vertical, fixed facing north',
  vertE: 'Vertical, fixed facing east',
  vertS: 'Vertical, fixed facing south',
  vertW: 'Vertical, fixed facing west',
}
const FIXED_AZ: Partial<Record<PanelKind, number>> = { vertN: 0, vertE: 90, vertS: 180, vertW: 270 }

/** cos(incidence) between the panel normal and the Sun direction; panels are one-sided. */
export function cosIncidence(kind: PanelKind, sunAz: number, sunEl: number): number {
  const el = (sunEl * Math.PI) / 180
  if (kind === 'flat') return Math.max(0, Math.sin(el))
  if (kind === 'track') return Math.max(0, Math.cos(el))
  const d = ((sunAz - FIXED_AZ[kind]!) * Math.PI) / 180
  return Math.max(0, Math.cos(el) * Math.cos(d))
}

/** Incident power on the panel, W per m^2 of panel (illumination only, no conversion losses). */
export function incident(kind: PanelKind, s: Sample): number {
  return s.flux * s.sunFrac * cosIncidence(kind, s.sun.az, s.sun.el)
}

/** Trapezoid integral of y over t (ms), with y given at increasing t; returns y-units * hours. */
export function integrateHours(t: ArrayLike<number>, y: ArrayLike<number>): number {
  let s = 0
  for (let i = 1; i < t.length; i++) s += 0.5 * (y[i] + y[i - 1]) * (t[i] - t[i - 1])
  return s / HOUR
}

export interface Uncertain {
  value: number | null
  /** half-width from re-running with the lower/upper horizon masks; null when unknown */
  pm: number | null
}

export interface Analysis {
  t0: number
  t1: number
  series: Sample[]
  sunIv: Interval[]
  earthIv: Interval[]
  bothIv: Interval[]
  litFrac: number
  litFracBand: [number, number]
  earthFrac: number
  earthFracBand: [number, number]
  longestLit: Interval | null
  longestDark: Interval | null
  longestLinkGap: Interval | null
  meanSunFrac: number
  /** incident energy over the window, Wh per m^2 of panel, for every panel kind */
  energyWhM2: Record<PanelKind, number>
  /** capacity factor vs a panel permanently normal to the Sun at 1360.8 W/m^2 */
  capacity: Record<PanelKind, number>
  powerScore: number
  linkScore: number
  combined: number
  scanStepMs: number
}

function overlap(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i].start, b[j].start)
    const e = Math.min(a[i].end, b[j].end)
    if (e > s) out.push({ start: s, end: e, openStart: false, openEnd: false })
    if (a[i].end < b[j].end) i++
    else j++
  }
  return out
}

export function analyse(
  eph: Ephemeris,
  site: { lon: number; lat: number; z0: number; h: number },
  mask: Mask,
  t0: number,
  t1: number,
  nSeries = 900,
): Analysis {
  const f = siteFrame(site)
  const span = t1 - t0
  const scanStepMs = span > 120 * DAY ? 30 * 60_000 : 10 * 60_000
  const series: Sample[] = []
  for (let i = 0; i <= nSeries; i++) series.push(sample(eph, f, mask, t0 + (span * i) / nSeries))

  const iv = (body: 'SUN' | 'EARTH', band: MaskBand) =>
    intervals(visFn(eph, f, mask, body, DEFAULT_THRESHOLDS, band), t0, t1, scanStepMs)
  const sunIv = iv('SUN', 'mid')
  const earthIv = iv('EARTH', 'mid')
  const same = mask.lo === mask.hi
  // higher mask (hi) -> less visibility, lower mask (lo) -> more
  const litBand: [number, number] = same
    ? [totalDuration(sunIv) / span, totalDuration(sunIv) / span]
    : [totalDuration(iv('SUN', 'hi')) / span, totalDuration(iv('SUN', 'lo')) / span]
  const earthBand: [number, number] = same
    ? [totalDuration(earthIv) / span, totalDuration(earthIv) / span]
    : [totalDuration(iv('EARTH', 'hi')) / span, totalDuration(iv('EARTH', 'lo')) / span]

  const litFrac = totalDuration(sunIv) / span
  const earthFrac = totalDuration(earthIv) / span
  const longestDark = longest(gaps(sunIv, t0, t1))
  const longestLinkGap = longest(gaps(earthIv, t0, t1))

  const ts = series.map((s) => s.t)
  const kinds: PanelKind[] = ['flat', 'track', 'vertN', 'vertE', 'vertS', 'vertW']
  const energyWhM2 = {} as Record<PanelKind, number>
  const capacity = {} as Record<PanelKind, number>
  for (const k of kinds) {
    energyWhM2[k] = integrateHours(
      ts,
      series.map((s) => incident(k, s)),
    )
    capacity[k] = energyWhM2[k] / (1360.8 * (span / HOUR))
  }
  const cap = (iv: Interval | null) => Math.min(1, (iv ? (iv.end - iv.start) / HOUR : 0) / (SYNODIC_H / 2))
  const powerScore = 100 * (0.6 * litFrac + 0.4 * (1 - cap(longestDark)))
  const linkScore = 100 * (0.6 * earthFrac + 0.4 * (1 - cap(longestLinkGap)))
  return {
    t0,
    t1,
    series,
    sunIv,
    earthIv,
    bothIv: overlap(sunIv, earthIv),
    litFrac,
    litFracBand: litBand,
    earthFrac,
    earthFracBand: earthBand,
    longestLit: longest(sunIv),
    longestDark,
    longestLinkGap,
    meanSunFrac: series.reduce((a, s) => a + s.sunFrac, 0) / series.length,
    energyWhM2,
    capacity,
    powerScore,
    linkScore,
    combined: Math.sqrt(powerScore * linkScore),
    scanStepMs,
  }
}

export interface Countdown {
  /** is the body visible now (nominal mask) */
  now: boolean
  /** time of the next state change, ms; null if none within the search horizon */
  next: number | null
  /** +/- from the lower/upper masks, ms; null when not available */
  pm: number | null
}

export function countdown(
  eph: Ephemeris,
  f: SiteFrame,
  mask: Mask,
  body: 'SUN' | 'EARTH',
  t: number,
  horizonMs = 60 * DAY,
): Countdown {
  const g = visFn(eph, f, mask, body, DEFAULT_THRESHOLDS, 'mid')
  const now = g(t) > 0
  const next = nextChange(g, t, horizonMs)
  let pm: number | null = null
  if (next !== null && mask.lo !== mask.hi) {
    const alt: number[] = []
    for (const band of ['lo', 'hi'] as const) {
      const gb = visFn(eph, f, mask, body, DEFAULT_THRESHOLDS, band)
      if (gb(t) > 0 === now) {
        const n = nextChange(gb, t, horizonMs)
        if (n !== null) alt.push(Math.abs(n - next))
      }
    }
    if (alt.length) pm = Math.max(...alt)
  }
  return { now, next, pm }
}

export function fmtDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  const a = Math.abs(ms)
  if (a < 90_000) return `${Math.round(a / 1000)} s`
  if (a < 2 * HOUR) return `${Math.round(a / 60_000)} min`
  if (a < 3 * DAY) return `${(a / HOUR).toFixed(1)} h`
  return `${(a / DAY).toFixed(1)} d`
}

export function fmtUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

export interface QuickScore {
  start: number
  lit: number
  earth: number
  darkH: number
  gapH: number
  power: number
  link: number
  combined: number
}

/**
 * Same scores as analyse(), from hourly samples only (no event refinement), so that dozens of
 * candidate start dates can be ranked interactively. Durations are quantised to the 1 h step.
 */
export function quickScore(
  eph: Ephemeris,
  site: { lon: number; lat: number; z0: number; h: number },
  mask: Mask,
  start: number,
  days: number,
): QuickScore {
  const f = siteFrame(site)
  const n = Math.round(days * 24)
  let lit = 0
  let earth = 0
  let dark = 0
  let gap = 0
  let maxDark = 0
  let maxGap = 0
  for (let i = 0; i < n; i++) {
    const s = sample(eph, f, mask, start + (i + 0.5) * HOUR)
    if (s.sunFrac >= DEFAULT_THRESHOLDS.sunFrac) {
      lit++
      dark = 0
    } else if (++dark > maxDark) maxDark = dark
    if (s.earthFrac >= DEFAULT_THRESHOLDS.earthFrac) {
      earth++
      gap = 0
    } else if (++gap > maxGap) maxGap = gap
  }
  const cap = (h: number) => Math.min(1, h / (SYNODIC_H / 2))
  const power = 100 * (0.6 * (lit / n) + 0.4 * (1 - cap(maxDark)))
  const link = 100 * (0.6 * (earth / n) + 0.4 * (1 - cap(maxGap)))
  return { start, lit: lit / n, earth: earth / n, darkH: maxDark, gapH: maxGap, power, link, combined: Math.sqrt(power * link) }
}
