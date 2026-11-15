// Solar-energy model (contract §6.8, §7.8). Illumination is not electrical power: incident power on the panel is
// converted with an efficiency, an area and system losses that are user assumptions, shown as such.
//   S(t) = S0 (1 au / d☉)²,  P_inc = S · f☉ · max(0, n̂·ŝ),  P_el = η · A · P_inc · (1 − losses)
import { AU_KM, D2R, HOUR, S0_W_M2 } from './constants'
import { diskFraction } from './disk'
import type { Ephemeris } from './ephem'
import type { Band, Mask } from './mask'
import { azel, type SiteFrame } from './topo'

export type LayoutKind = 'flat' | 'vertical' | 'box4' | 'track' | 'tilted' | 'twoAxis'

export interface ArraySpec {
  layout: LayoutKind
  /** azimuth of the panel normal, deg from north (vertical / tilted) */
  azimuth: number
  /** tilt of the panel from horizontal, deg (tilted) */
  tilt: number
  areaM2: number
  efficiency: number // 0..1
  losses: number // 0..1
}

export interface Attitude {
  /** lander tilt from vertical, deg */
  tilt: number
  /** azimuth toward which the lander leans, deg */
  toward: number
}

export interface SunSample {
  t: number
  az: number
  el: number
  /** visible fraction of the solar disk */
  f: number
  /** irradiance at the Moon, W/m² */
  s: number
}

type V = [number, number, number] // local (north, east, up)

function rotateAttitude(n: V, att: Attitude): V {
  if (!att.tilt) return n
  // rotate about the horizontal axis perpendicular to `toward` so that 'up' leans toward `toward` by `tilt`
  const t = att.tilt * D2R
  const a = att.toward * D2R
  const k: V = [-Math.sin(a), Math.cos(a), 0] // up × leanDir
  const c = Math.cos(t)
  const s = Math.sin(t)
  const kd = k[0] * n[0] + k[1] * n[1] + k[2] * n[2]
  const kx: V = [k[1] * n[2] - k[2] * n[1], k[2] * n[0] - k[0] * n[2], k[0] * n[1] - k[1] * n[0]]
  return [n[0] * c + kx[0] * s + k[0] * kd * (1 - c), n[1] * c + kx[1] * s + k[1] * kd * (1 - c), n[2] * c + kx[2] * s + k[2] * kd * (1 - c)]
}

function facet(tiltDeg: number, azDeg: number): V {
  const b = tiltDeg * D2R
  const g = azDeg * D2R
  return [Math.sin(b) * Math.cos(g), Math.sin(b) * Math.sin(g), Math.cos(b)]
}

/** Facets (normal, share of the area) of a layout in the local frame, after the lander attitude. */
export function facets(spec: ArraySpec, att: Attitude): { n: V; share: number }[] {
  switch (spec.layout) {
    case 'flat':
      return [{ n: rotateAttitude(facet(0, 0), att), share: 1 }]
    case 'vertical':
      return [{ n: rotateAttitude(facet(90, spec.azimuth), att), share: 1 }]
    case 'tilted':
      return [{ n: rotateAttitude(facet(spec.tilt, spec.azimuth), att), share: 1 }]
    case 'box4':
      return [0, 90, 180, 270].map((a) => ({ n: rotateAttitude(facet(90, a + spec.azimuth), att), share: 0.25 }))
    default:
      return []
  }
}

/** Effective cos(incidence) of the whole array (area-weighted, one-sided facets). */
export function arrayCos(spec: ArraySpec, att: Attitude, sunAz: number, sunEl: number, fac?: { n: V; share: number }[]): number {
  if (spec.layout === 'twoAxis') return 1
  const e = sunEl * D2R
  const a = sunAz * D2R
  const s: V = [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)]
  if (spec.layout === 'track') {
    // vertical panel on an azimuth-tracking gimbal kept vertical in the local frame: cos i = cos(el)
    return Math.max(0, Math.cos(e))
  }
  let c = 0
  for (const f of fac ?? facets(spec, att)) c += f.share * Math.max(0, f.n[0] * s[0] + f.n[1] * s[1] + f.n[2] * s[2])
  return c
}

/**
 * Sun track at the site on [t0, t1] for one mask band: base step `stepMs` (10 min), refined to 1 min wherever the
 * visible fraction is partial or changes between base samples (so the energy integral captures every event).
 */
export function sunTrack(eph: Ephemeris, f: SiteFrame, mask: Mask, t0: number, t1: number, band: Band = 'mid', stepMs = 600_000, fineMs = 60_000): SunSample[] {
  const at = (t: number): SunSample => {
    const p = azel(eph, 'SUN', t, f)
    const d = p.range / AU_KM
    return { t, az: p.az, el: p.el, f: diskFraction(mask, p, band), s: S0_W_M2 / (d * d) }
  }
  const out: SunSample[] = [at(t0)]
  for (let t = t0 + stepMs; ; t += stepMs) {
    const tt = Math.min(t, t1)
    const b = at(tt)
    const a = out[out.length - 1]
    const partial = (a.f > 0 && a.f < 1) || (b.f > 0 && b.f < 1) || a.f !== b.f
    if (partial && tt - a.t > fineMs) {
      for (let u = a.t + fineMs; u < tt - 1; u += fineMs) out.push(at(u))
    }
    out.push(b)
    if (tt >= t1) break
  }
  return out
}

/** Incident power on the array per m² of panel (W/m²) at one sample. */
export function incidentWm2(spec: ArraySpec, att: Attitude, s: SunSample, fac?: { n: V; share: number }[]): number {
  if (s.f <= 0) return 0
  return s.s * s.f * arrayCos(spec, att, s.az, s.el, fac)
}

export function electricW(spec: ArraySpec, incident: number): number {
  return spec.efficiency * spec.areaM2 * incident * (1 - spec.losses)
}

export interface EnergyResult {
  /** incident energy, Wh per m² of panel */
  incidentWhM2: number
  /** electrical energy of the array, Wh */
  electricWh: number
  /** capacity factor E / (η A S0 T) */
  capacityFactor: number
  /** hourly mean electrical power, W (for charts and the survival model) */
  hourlyW: Float32Array
}

/** Trapezoid integral over the adaptive track (event-aware sampling; V10). */
export function integrate(spec: ArraySpec, att: Attitude, track: SunSample[]): EnergyResult {
  const fac = facets(spec, att)
  const t0 = track[0].t
  const t1 = track[track.length - 1].t
  const nh = Math.max(1, Math.ceil((t1 - t0) / HOUR))
  const hourly = new Float64Array(nh)
  let e = 0
  let prev = incidentWm2(spec, att, track[0], fac)
  for (let i = 1; i < track.length; i++) {
    const p = incidentWm2(spec, att, track[i], fac)
    const dt = track[i].t - track[i - 1].t
    const area = 0.5 * (p + prev) * dt
    e += area
    // distribute into hourly bins by midpoint
    const hb = Math.min(nh - 1, Math.floor((0.5 * (track[i].t + track[i - 1].t) - t0) / HOUR))
    hourly[hb] += area
    prev = p
  }
  const incidentWhM2 = e / HOUR
  const k = spec.efficiency * spec.areaM2 * (1 - spec.losses)
  const hourlyW = new Float32Array(nh)
  for (let i = 0; i < nh; i++) hourlyW[i] = (hourly[i] / HOUR) * k
  const hours = (t1 - t0) / HOUR
  return {
    incidentWhM2,
    electricWh: incidentWhM2 * k,
    capacityFactor: incidentWhM2 / (S0_W_M2 * hours),
    hourlyW,
  }
}

export interface Battery {
  capacityWh: number
  depthOfDischarge: number // 0..1
  roundTrip: number // 0..1
  specificWhKg: number
}

/** Storage needed to cross the longest dark interval: E = P_load · T_dark / (DoD · η_batt). */
export function storageForDarkness(loadW: number, darkHours: number, b: Battery) {
  const wh = (loadW * darkHours) / (b.depthOfDischarge * b.roundTrip)
  return { wh, massKg: wh / b.specificWhKg }
}

export interface Survival {
  /** state of charge at the start of each hour, 0..1 of usable capacity */
  soc: Float32Array
  /** first hour index at which the battery is empty, or -1 */
  emptyAtHour: number
  minSoc: number
}

/** Hourly energy balance: charge with √η on the way in and out (round-trip η), clamp to the usable capacity. */
export function survival(hourlyW: Float32Array, loadW: number, b: Battery, startSoc = 1): Survival {
  const usable = b.capacityWh * b.depthOfDischarge
  const eta = Math.sqrt(b.roundTrip)
  const soc = new Float32Array(hourlyW.length + 1)
  let e = usable * startSoc
  soc[0] = startSoc
  let empty = -1
  let minS = startSoc
  for (let i = 0; i < hourlyW.length; i++) {
    const net = hourlyW[i] - loadW
    e += net > 0 ? net * eta : net / eta
    if (e >= usable) e = usable
    if (e <= 0) {
      e = 0
      if (empty < 0) empty = i + 1
    }
    soc[i + 1] = usable > 0 ? e / usable : 0
    minS = Math.min(minS, soc[i + 1])
  }
  return { soc, emptyAtHour: empty, minSoc: minS }
}

export const DEFAULT_ARRAY: ArraySpec = { layout: 'vertical', azimuth: 0, tilt: 90, areaM2: 2, efficiency: 0.3, losses: 0.15 }
export const DEFAULT_BATTERY: Battery = { capacityWh: 2000, depthOfDischarge: 0.8, roundTrip: 0.9, specificWhKg: 150 }
export const LEVEL_ATTITUDE: Attitude = { tilt: 0, toward: 0 }
