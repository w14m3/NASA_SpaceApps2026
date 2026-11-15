// Window analysis for one site and one scenario: events, metrics with ± from the horizon uncertainty band,
// direct-to-Earth windows with ground stations, energy, link geometry and the thermal proxy. Pure functions; runs in
// a Web Worker in the app and in Node for tests and the build-time default scenario.
import { AU_KM, DAY, HOUR, SYNODIC_MS } from './constants'
import { diskFraction } from './disk'
import type { Ephemeris } from './ephem'
import { gaps, intersect, intervals, longest, nextChange, totalDuration, union, type Interval } from './events'
import { DEFAULT_ARRAY, DEFAULT_BATTERY, LEVEL_ATTITUDE, integrate, storageForDarkness, sunTrack, survival, type ArraySpec, type Attitude, type Battery } from './energy'
import { BANDS, fsplDb, lightTimeS, pointingEnvelope, type PointingEnvelope } from './link'
import { maskAt, type Band, type Mask } from './mask'
import { DSN, moonFromStation, stationFrame, type Station } from './stations'
import { plateEquilibriumK, heaterEnergyWh, DEFAULT_THERMAL } from './thermal'
import { azel, separation, siteFrame, type AzEl, type SiteFrame, type SiteSpec } from './topo'

export interface Thresholds {
  /** Sun counts as lit at ≥ this visible fraction of its disk */
  sunFrac: number
  /** Earth counts as in view at ≥ this visible fraction of its disk */
  earthFrac: number
  /** solar-interference flag below this Sun–Earth separation, deg (editable assumption) */
  sunEarthSepDeg: number
}
export const DEFAULT_THRESHOLDS: Thresholds = { sunFrac: 0.01, earthFrac: 0.5, sunEarthSepDeg: 5 }

export interface Scenario {
  t0: number
  t1: number
  thresholds: Thresholds
  stations: Station[]
  array: ArraySpec
  attitude: Attitude
  battery: Battery
  loadW: number
  thermal: { absorptivity: number; emissivity: number; heaterW: number }
}

export function defaultScenario(t0: number, days = 29.5): Scenario {
  return {
    t0,
    t1: t0 + days * DAY,
    thresholds: DEFAULT_THRESHOLDS,
    stations: DSN,
    array: DEFAULT_ARRAY,
    attitude: LEVEL_ATTITUDE,
    battery: DEFAULT_BATTERY,
    loadW: 100,
    thermal: DEFAULT_THERMAL,
  }
}

export interface Uncertain {
  value: number
  /** [pessimistic, optimistic] from the upper and lower horizon masks */
  band: [number, number]
}

export interface HourSample {
  t: number
  sunAz: number
  sunEl: number
  sunFrac: number
  earthAz: number
  earthEl: number
  earthFrac: number
  earthMargin: number
  /** stations that see the Moon at this hour (indices into scenario.stations) */
  stations: number
  dte: boolean
  powerW: number
  sep: number
}

export interface SiteAnalysis {
  t0: number
  t1: number
  scanStepMs: number
  sun: Interval[]
  earth: Interval[]
  stationWindows: Interval[][]
  anyStation: Interval[]
  dte: Interval[]
  sunAndDte: Interval[]
  litFrac: Uncertain
  earthFrac: Uncertain
  dteFrac: Uncertain
  longestDarkH: Uncertain
  longestDark: Interval | null
  longestLitH: number
  longestDteGapH: number
  longestDteGap: Interval | null
  energy: { electricWh: number; incidentWhM2: number; capacityFactor: number; perLunarDayWh: number }
  storage: { wh: number; massKg: number }
  survival: { emptyAtHour: number; minSoc: number; soc: Float32Array }
  link: {
    rangeKm: [number, number]
    lightTimeS: [number, number]
    fsplDb: { band: string; min: number; max: number }[]
    envelope: PointingEnvelope | null
    interferenceHours: number
    minSepDeg: number
  }
  thermal: { coldSoakH: number; heaterWh: number }
  hourly: HourSample[]
  peakSunEl: number
  meanSunFracWhenUp: number
}

function frac(iv: Interval[], span: number) {
  return totalDuration(iv) / span
}

export function bodyFn(eph: Ephemeris, f: SiteFrame, mask: Mask, body: 'SUN' | 'EARTH', thr: Thresholds, band: Band) {
  const th = body === 'SUN' ? thr.sunFrac : thr.earthFrac
  return (t: number) => diskFraction(mask, azel(eph, body, t, f), band) - th
}

export function stationFn(eph: Ephemeris, st: Station) {
  const sf = stationFrame(st)
  return (t: number) => moonFromStation(eph, sf, t).el - st.minEl
}

export function analyseSite(eph: Ephemeris, site: SiteSpec, mask: Mask, sc: Scenario, opts: { hourly?: boolean } = {}): SiteAnalysis {
  const { t0, t1 } = sc
  const span = t1 - t0
  const f = siteFrame(site)
  const step = span > 120 * DAY ? 30 * 60_000 : 10 * 60_000
  const iv = (body: 'SUN' | 'EARTH', band: Band) => intervals(bodyFn(eph, f, mask, body, sc.thresholds, band), t0, t1, step)
  const sameBands = mask.lo === mask.hi
  const sun = iv('SUN', 'mid')
  const earth = iv('EARTH', 'mid')
  // upper mask (hi) = pessimistic visibility, lower mask (lo) = optimistic
  const sunHi = sameBands ? sun : iv('SUN', 'hi')
  const sunLo = sameBands ? sun : iv('SUN', 'lo')
  const earthHi = sameBands ? earth : iv('EARTH', 'hi')
  const earthLo = sameBands ? earth : iv('EARTH', 'lo')
  const stationWindows = sc.stations.map((st) => intervals(stationFn(eph, st), t0, t1, step))
  let anyStation: Interval[] = []
  for (const w of stationWindows) anyStation = union(anyStation, w)
  const dte = intersect(earth, anyStation)
  const dteHi = intersect(earthHi, anyStation)
  const dteLo = intersect(earthLo, anyStation)
  const darkH = (s: Interval[]) => {
    const l = longest(gaps(s, t0, t1))
    return l ? (l.end - l.start) / HOUR : 0
  }
  const longestDark = longest(gaps(sun, t0, t1))
  const dteGap = longest(gaps(dte, t0, t1))
  const ll = longest(sun)

  const track = sunTrack(eph, f, mask, t0, t1, 'mid')
  const en = integrate(sc.array, sc.attitude, track)
  const darkHours = darkH(sun)
  const stor = storageForDarkness(sc.loadW, darkHours, sc.battery)
  const surv = survival(en.hourlyW, sc.loadW, sc.battery)

  // hourly samples: charts, libration loop, pointing envelope, interference flag
  const hourly: HourSample[] = []
  const earthDirs: { az: number; el: number }[] = []
  const sfs = sc.stations.map(stationFrame)
  let rmin = Infinity
  let rmax = -Infinity
  let interf = 0
  let minSep = 180
  let peakEl = -90
  let sumF = 0
  let nUp = 0
  const nh = Math.max(1, Math.floor(span / HOUR))
  for (let i = 0; i <= nh; i++) {
    const t = t0 + i * HOUR
    if (t > t1) break
    const s: AzEl = azel(eph, 'SUN', t, f)
    const e: AzEl = azel(eph, 'EARTH', t, f)
    const sf = diskFraction(mask, s)
    const ef = diskFraction(mask, e)
    let mask_ = 0
    for (let k = 0; k < sfs.length; k++) if (moonFromStation(eph, sfs[k], t).el >= sc.stations[k].minEl) mask_ |= 1 << k
    const inView = ef >= sc.thresholds.earthFrac
    const sep = separation(s, e)
    if (inView) {
      earthDirs.push({ az: e.az, el: e.el })
      if (sep < sc.thresholds.sunEarthSepDeg && sf > 0) interf++
      minSep = Math.min(minSep, sep)
    }
    rmin = Math.min(rmin, e.range)
    rmax = Math.max(rmax, e.range)
    peakEl = Math.max(peakEl, s.el)
    if (sf > 0) {
      sumF += sf
      nUp++
    }
    if (opts.hourly !== false)
      hourly.push({
        t,
        sunAz: s.az,
        sunEl: s.el,
        sunFrac: sf,
        earthAz: e.az,
        earthEl: e.el,
        earthFrac: ef,
        earthMargin: e.el - maskAt(mask, e.az),
        stations: mask_,
        dte: inView && mask_ !== 0,
        powerW: en.hourlyW[Math.min(en.hourlyW.length - 1, i)] ?? 0,
        sep,
      })
  }
  const unc = (mid: Interval[], hi: Interval[], lo: Interval[]): Uncertain => ({ value: frac(mid, span), band: [frac(hi, span), frac(lo, span)] })
  return {
    t0,
    t1,
    scanStepMs: step,
    sun,
    earth,
    stationWindows,
    anyStation,
    dte,
    sunAndDte: intersect(sun, dte),
    litFrac: unc(sun, sunHi, sunLo),
    earthFrac: unc(earth, earthHi, earthLo),
    dteFrac: unc(dte, dteHi, dteLo),
    longestDarkH: { value: darkHours, band: [darkH(sunHi), darkH(sunLo)] },
    longestDark,
    longestLitH: ll ? (ll.end - ll.start) / HOUR : 0,
    longestDteGapH: dteGap ? (dteGap.end - dteGap.start) / HOUR : 0,
    longestDteGap: dteGap,
    energy: { electricWh: en.electricWh, incidentWhM2: en.incidentWhM2, capacityFactor: en.capacityFactor, perLunarDayWh: (en.electricWh * SYNODIC_MS) / span },
    storage: stor,
    survival: { emptyAtHour: surv.emptyAtHour, minSoc: surv.minSoc, soc: surv.soc },
    link: {
      rangeKm: [rmin, rmax],
      lightTimeS: [lightTimeS(rmin), lightTimeS(rmax)],
      fsplDb: BANDS.map((b) => ({ band: b.id, min: fsplDb(rmin, b.ghz), max: fsplDb(rmax, b.ghz) })),
      envelope: pointingEnvelope(earthDirs),
      interferenceHours: interf,
      minSepDeg: minSep,
    },
    thermal: { coldSoakH: darkHours, heaterWh: heaterEnergyWh(sc.thermal.heaterW, darkHours) },
    hourly,
    peakSunEl: peakEl,
    meanSunFracWhenUp: nUp ? sumF / nUp : 0,
  }
}

export interface Countdown {
  visible: boolean
  /** UTC ms of the next change of state; null if none within the search horizon */
  next: number | null
  /** ± from the lower/upper masks, ms */
  pm: number | null
}

export function countdown(g: (b: Band) => (t: number) => number, t: number, horizonMs = 45 * DAY, bands = true): Countdown {
  const gm = g('mid')
  const visible = gm(t) > 0
  const next = nextChange(gm, t, horizonMs)
  let pm: number | null = null
  if (next !== null && bands) {
    const d: number[] = []
    for (const b of ['lo', 'hi'] as const) {
      const gb = g(b)
      if (gb(t) > 0 === visible) {
        const n = nextChange(gb, t, horizonMs)
        if (n !== null) d.push(Math.abs(n - next))
      }
    }
    if (d.length) pm = Math.max(...d)
  }
  return { visible, next, pm }
}

export interface Instant {
  t: number
  sun: AzEl
  earth: AzEl
  sunFrac: number
  earthFrac: number
  sunMaskEl: number
  earthMaskEl: number
  sunAboveHorizon: number // Sun centre elevation above the terrain horizon at its azimuth, deg
  irradiance: number
  stationsUp: { id: string; el: number }[]
  dte: boolean
  plateK: number | null
  sep: number
}

export function instant(eph: Ephemeris, site: SiteSpec, mask: Mask, sc: Scenario, t: number): Instant {
  const f = siteFrame(site)
  const sun = azel(eph, 'SUN', t, f)
  const earth = azel(eph, 'EARTH', t, f)
  const sunFrac = diskFraction(mask, sun)
  const earthFrac = diskFraction(mask, earth)
  const d = sun.range / AU_KM
  const irr = 1360.8 / (d * d)
  const stationsUp = sc.stations.map((st) => ({ id: st.id, el: moonFromStation(eph, stationFrame(st), t).el, min: st.minEl })).filter((s) => s.el >= s.min).map(({ id, el }) => ({ id, el }))
  return {
    t,
    sun,
    earth,
    sunFrac,
    earthFrac,
    sunMaskEl: maskAt(mask, sun.az),
    earthMaskEl: maskAt(mask, earth.az),
    sunAboveHorizon: sun.el - maskAt(mask, sun.az),
    irradiance: irr,
    stationsUp,
    dte: earthFrac >= sc.thresholds.earthFrac && stationsUp.length > 0,
    plateK: plateEquilibriumK(sc.thermal.absorptivity, sc.thermal.emissivity, irr, sunFrac, 1),
    sep: separation(sun, earth),
  }
}

export function siteCountdowns(eph: Ephemeris, site: SiteSpec, mask: Mask, sc: Scenario, t: number) {
  const f = siteFrame(site)
  const bands = mask.lo !== mask.hi
  const sunG = (b: Band) => bodyFn(eph, f, mask, 'SUN', sc.thresholds, b)
  const earthG = (b: Band) => bodyFn(eph, f, mask, 'EARTH', sc.thresholds, b)
  const stFns = sc.stations.map((st) => stationFn(eph, st))
  const anySt = (tt: number) => Math.max(...stFns.map((g) => g(tt)))
  const dteG = (b: Band) => {
    const e = earthG(b)
    return (tt: number) => Math.min(e(tt), anySt(tt) / 10) // both must be positive; scaled to similar magnitude
  }
  return {
    sun: countdown(sunG, t, 45 * DAY, bands),
    earth: countdown(earthG, t, 45 * DAY, bands),
    dte: countdown(dteG, t, 10 * DAY, bands),
  }
}
