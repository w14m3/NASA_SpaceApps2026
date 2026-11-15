// Earth connectivity geometry (contract §6.9, §7.9). Geometric feasibility only, not link closure.
import { C_KM_S, D2R, R2D } from './constants'

export const BANDS = [
  { id: 'S', ghz: 2.2 },
  { id: 'X', ghz: 8.4 },
  { id: 'Ka', ghz: 32 },
] as const

/** Free-space path loss, dB: 20·log10(4π d f / c). */
export function fsplDb(rangeKm: number, ghz: number): number {
  return 20 * Math.log10((4 * Math.PI * rangeKm * 1e3 * ghz * 1e9) / (C_KM_S * 1e3))
}

export function lightTimeS(rangeKm: number): number {
  return rangeKm / C_KM_S
}

type V = [number, number, number]
const unit = (az: number, el: number): V => {
  const a = az * D2R
  const e = el * D2R
  return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)]
}
const ang = (p: V, q: V) => Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))) * R2D

export interface PointingEnvelope {
  /** best fixed boresight (centre of the smallest cone holding every Earth direction) */
  az: number
  el: number
  /** half-angle of that cone, deg */
  halfAngle: number
  azRange: [number, number]
  elRange: [number, number]
  /** fraction of samples within half-angle β of the boresight, for β = 1..30 deg */
  within: { beta: number; frac: number }[]
}

/** Smallest enclosing cone of local directions (Bădoiu–Clarkson iteration on the unit sphere). */
export function pointingEnvelope(dirs: { az: number; el: number }[]): PointingEnvelope | null {
  if (!dirs.length) return null
  const us = dirs.map((d) => unit(d.az, d.el))
  let c: V = [0, 0, 0]
  for (const u of us) {
    c[0] += u[0]
    c[1] += u[1]
    c[2] += u[2]
  }
  let n = Math.hypot(...c)
  c = [c[0] / n, c[1] / n, c[2] / n]
  for (let it = 1; it < 400; it++) {
    let far = us[0]
    let fd = -1
    for (const u of us) {
      const d = ang(c, u)
      if (d > fd) {
        fd = d
        far = u
      }
    }
    const k = 1 / (it + 1)
    c = [c[0] + (far[0] - c[0]) * k, c[1] + (far[1] - c[1]) * k, c[2] + (far[2] - c[2]) * k]
    n = Math.hypot(...c)
    c = [c[0] / n, c[1] / n, c[2] / n]
  }
  let half = 0
  for (const u of us) half = Math.max(half, ang(c, u))
  const az = ((Math.atan2(c[1], c[0]) * R2D) % 360 + 360) % 360
  const el = Math.asin(c[2]) * R2D
  // azimuth range around the boresight azimuth (handles the 0/360 wrap)
  let amin = Infinity
  let amax = -Infinity
  let emin = Infinity
  let emax = -Infinity
  for (const d of dirs) {
    const da = ((d.az - az + 540) % 360) - 180
    amin = Math.min(amin, da)
    amax = Math.max(amax, da)
    emin = Math.min(emin, d.el)
    emax = Math.max(emax, d.el)
  }
  const within = [1, 2, 3, 5, 7, 10, 15, 20, 30].map((beta) => ({ beta, frac: us.filter((u) => ang(c, u) <= beta).length / us.length }))
  return { az, el, halfAngle: half, azRange: [az + amin, az + amax], elRange: [emin, emax], within }
}

/** Optional link budget (all user inputs): Eb/N0 margin in dB. */
export function linkMarginDb(p: { txPowerW: number; txGainDbi: number; rxGainDbi: number; rangeKm: number; ghz: number; systemTempK: number; dataRateBps: number; requiredEbN0Db: number; lossesDb: number }): number {
  const k = -228.6 // Boltzmann constant, dBW/K/Hz
  const eirp = 10 * Math.log10(p.txPowerW) + p.txGainDbi
  const prx = eirp - fsplDb(p.rangeKm, p.ghz) - p.lossesDb + p.rxGainDbi
  const n0 = k + 10 * Math.log10(p.systemTempK)
  const ebn0 = prx - n0 - 10 * Math.log10(p.dataRateBps)
  return ebn0 - p.requiredEbN0Db
}
