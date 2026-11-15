// Top 3 recommendation engine (contract §6.11, §7.11): fast hourly scoring of every candidate of a hero region,
// hard constraints, published 0–100 scores, weighted geometric mean, diversity by minimum separation, generated
// explanations. All numbers come from the core; formulas are in docs/METHODS.md §9.
import { DAY, D2R, HOUR, R2D, R_EARTH_KM, R_SUN_KM, SYNODIC_MS } from './constants'
import { candidateMaskAt, type CandidateGrid } from './candidates'
import { circleSegmentFraction } from './disk'
import type { Ephemeris, Vec3 } from './ephem'
import { greatCircle } from './projection'
import { tipOver, type LanderPreset, SLOPE_UNCERTAINTY_DEG } from './safety'
import { moonFromStation, stationFrame, type Station } from './stations'
import { siteFrame } from './topo'

export interface Constraints {
  maxSlope: number // deg
  minSafeArea: number // 0..1, share of candidates within 500 m under maxSlope
  minMargin: number // deg (tip-over static margin)
  minSunlit: number // 0..1
  maxNightH: number // h
  minDte: number // 0..1
  excludeZeroIllumination: boolean
}

/** Default constraints — editable, labelled assumptions in the UI. */
export const DEFAULT_CONSTRAINTS: Constraints = {
  maxSlope: 8,
  minSafeArea: 0.5,
  minMargin: 10,
  minSunlit: 0.3,
  maxNightH: 240,
  minDte: 0.1,
  excludeZeroIllumination: true,
}

export interface Weights {
  safety: number
  power: number
  link: number
  robustness: number
  science: number
}

export const PERSONAS: Record<string, Weights> = {
  balanced: { safety: 1, power: 1, link: 1, robustness: 0.5, science: 0 },
  crewSafety: { safety: 3, power: 1, link: 1, robustness: 1, science: 0 },
  longPower: { safety: 1, power: 3, link: 1, robustness: 1, science: 0 },
  scienceIce: { safety: 1, power: 1, link: 1, robustness: 0.5, science: 2 },
}

export interface CandidateScore {
  i: number
  lon: number
  lat: number
  z0: number
  slope: number
  margin: number
  vCrit: number
  safeArea: number
  lit: number
  nightH: number
  earth: number
  dte: number
  dteGapH: number
  zeroIllum: boolean
  distZeroKm: number
  scores: { safety: number; power: number; link: number; robustness: number; science: number }
  combined: number
  feasible: boolean
  failed: string[]
  nearShare: number
}

const HALF_SYNODIC_H = SYNODIC_MS / 2 / HOUR

/** Centre offset (in disk radii) at which 1 % of a disk clears a straight horizon (solved once, circle segment). */
export const LIT_OFFSET = (() => {
  let a = -1
  let b = 0
  for (let k = 0; k < 60; k++) {
    const m = (a + b) / 2
    if (circleSegmentFraction(m, 1) < 0.01) a = m
    else b = m
  }
  return (a + b) / 2
})()

export function powerScore(lit: number, nightH: number) {
  return 100 * (0.6 * lit + 0.4 * (1 - Math.min(1, nightH / HALF_SYNODIC_H)))
}
export function linkScore(dte: number, gapH: number) {
  return 100 * (0.6 * dte + 0.4 * (1 - Math.min(1, gapH / HALF_SYNODIC_H)))
}
export function safetyScore(margin: number, vCrit: number, safeArea: number, p: LanderPreset) {
  const c = (x: number) => Math.max(0, Math.min(1, x))
  return 100 * (0.5 * c(margin / (2 * p.minMargin)) + 0.25 * c(vCrit / (2 * p.vDesign)) + 0.25 * c(safeArea))
}
export function combinedScore(s: CandidateScore['scores'], w: Weights) {
  const keys = Object.keys(w) as (keyof Weights)[]
  let sw = 0
  let acc = 0
  for (const k of keys) {
    if (!w[k]) continue
    const v = Math.max(0, s[k]) / 100
    if (v <= 0) return 0 // a zero anywhere sinks the site
    acc += w[k] * Math.log(v)
    sw += w[k]
  }
  return sw ? 100 * Math.exp(acc / sw) : 0
}

/** Shared hourly ephemeris samples for a window (Sun, Earth MOON_ME vectors; any-station visibility). */
export interface HourlyEphem {
  t0: number
  n: number
  sun: Float64Array // 3n
  earth: Float64Array
  station: Uint8Array // 1 if ≥ 1 station sees the Moon
}

export function hourlyEphem(eph: Ephemeris, t0: number, t1: number, stations: Station[]): HourlyEphem {
  const n = Math.max(1, Math.floor((t1 - t0) / HOUR))
  const sun = new Float64Array(3 * n)
  const earth = new Float64Array(3 * n)
  const station = new Uint8Array(n)
  const sf = stations.map(stationFrame)
  const v: Vec3 = [0, 0, 0]
  for (let k = 0; k < n; k++) {
    const t = t0 + (k + 0.5) * HOUR
    eph.position('SUN', t, v)
    sun.set(v, 3 * k)
    eph.position('EARTH', t, v)
    earth.set(v, 3 * k)
    station[k] = sf.some((f, j) => moonFromStation(eph, f, t).el >= stations[j].minEl) ? 1 : 0
  }
  return { t0, n, sun, earth, station }
}

interface Track {
  lit: Uint8Array
  earthIn: Uint8Array
}

/** Hourly lit / Earth-in-view flags of one candidate (Sun lit when ≥ 1 % of the disk clears a locally flat horizon). */
function candidateTrack(g: CandidateGrid, i: number, hi: number, he: HourlyEphem, h: number): Track {
  const f = siteFrame({ lon: g.lon[i], lat: g.lat[i], z0: g.z0[i], h })
  const lit = new Uint8Array(he.n)
  const earthIn = new Uint8Array(he.n)
  for (let k = 0; k < he.n; k++) {
    for (let b = 0; b < 2; b++) {
      const a = b === 0 ? he.sun : he.earth
      const dx = a[3 * k] - f.pos[0]
      const dy = a[3 * k + 1] - f.pos[1]
      const dz = a[3 * k + 2] - f.pos[2]
      const r = Math.hypot(dx, dy, dz)
      const el = Math.asin((dx * f.up[0] + dy * f.up[1] + dz * f.up[2]) / r) * R2D
      let az = Math.atan2(dx * f.east[0] + dy * f.east[1] + dz * f.east[2], dx * f.north[0] + dy * f.north[1] + dz * f.north[2]) * R2D
      if (az < 0) az += 360
      const m = candidateMaskAt(g, i, hi, az)
      if (b === 0) {
        const rad = Math.asin(R_SUN_KM / r) * R2D
        // ≥ 1 % of the disk above a locally straight horizon  ⇔  centre offset > LIT_OFFSET · radius
        lit[k] = el - m > LIT_OFFSET * rad ? 1 : 0
      } else {
        void R_EARTH_KM
        earthIn[k] = el - m >= 0 ? 1 : 0
      }
    }
  }
  return { lit, earthIn }
}

function stats(flags: Uint8Array, from: number, to: number) {
  let on = 0
  let run = 0
  let maxOff = 0
  for (let k = from; k < to; k++) {
    if (flags[k]) {
      on++
      run = 0
    } else if (++run > maxOff) maxOff = run
  }
  return { frac: on / Math.max(1, to - from), maxOffH: maxOff }
}

function andFlags(a: Uint8Array, b: Uint8Array) {
  const o = new Uint8Array(a.length)
  for (let k = 0; k < a.length; k++) o[k] = a[k] & b[k]
  return o
}

export interface RankInput {
  grid: CandidateGrid
  heightIndex: number
  eph: Ephemeris
  /** analysis window [t0, t1]; hourly samples are taken on [t0 − 3 d, t1 + 3 d] for the slip robustness term */
  t0: number
  t1: number
  stations: Station[]
  lander: LanderPreset
  constraints: Constraints
  weights: Weights
  minSeparationKm: number
  onProgress?: (f: number) => void
}

export interface RankResult {
  all: CandidateScore[]
  feasibleCount: number
  top: CandidateScore[]
  median: Partial<Record<keyof CandidateScore, number>>
  failedCounts: Record<string, number>
}

export function rankCandidates(inp: RankInput): RankResult {
  const { grid: g, heightIndex: hi, constraints: c, lander } = inp
  const h = g.heights[hi]
  const slip = 3 * DAY
  const he = hourlyEphem(inp.eph, inp.t0 - slip, inp.t1 + slip, inp.stations)
  const nWin = Math.floor((inp.t1 - inp.t0) / HOUR)
  const s0 = Math.round(slip / HOUR)
  const tracks: Track[] = []
  for (let i = 0; i < g.n; i++) {
    tracks.push(candidateTrack(g, i, hi, he, h))
    if (inp.onProgress && i % 400 === 0) inp.onProgress((0.8 * i) / g.n)
  }
  // zero-illumination cells over the window (proxy for permanently shadowed regions at this resolution and window)
  const zero = tracks.map((t) => stats(t.lit, s0, s0 + nWin).frac === 0)
  const zeroIdx = zero.flatMap((z, i) => (z ? [i] : []))
  const out: CandidateScore[] = []
  const spacing = g.region.spacingM
  const rad = Math.ceil(500 / spacing)
  for (let i = 0; i < g.n; i++) {
    const t = tracks[i]
    const dteFlags = andFlags(t.earthIn, he.station)
    const win = (off: number) => {
      const L = stats(t.lit, s0 + off, s0 + off + nWin)
      const D = stats(dteFlags, s0 + off, s0 + off + nWin)
      const E = stats(t.earthIn, s0 + off, s0 + off + nWin)
      return { lit: L.frac, night: L.maxOffH, dte: D.frac, gap: D.maxOffH, earth: E.frac }
    }
    const w0 = win(0)
    const slope = g.slope[i]
    const tip = tipOver(lander, Number.isFinite(slope) ? slope : 90, SLOPE_UNCERTAINTY_DEG)
    // safe-area fraction: candidates within 500 m under the slope limit
    const ix = i % g.nx
    const iy = Math.floor(i / g.nx)
    let ok = 0
    let tot = 0
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++) {
        if ((dx * dx + dy * dy) * spacing * spacing > 500 * 500) continue
        const x = ix + dx
        const y = iy + dy
        if (x < 0 || y < 0 || x >= g.nx || y >= g.nx) continue
        tot++
        if (g.slope[y * g.nx + x] <= c.maxSlope) ok++
      }
    const safeArea = tot ? ok / tot : 0
    let distZero = Infinity
    for (const z of zeroIdx) distZero = Math.min(distZero, Math.hypot(g.x[z] - g.x[i], g.y[z] - g.y[i]) / 1000)
    const power = powerScore(w0.lit, w0.night)
    const link = linkScore(w0.dte, w0.gap)
    const safety = safetyScore(tip.margin, tip.vCrit, safeArea, lander)
    const science = Number.isFinite(distZero) ? 100 * Math.max(0, 1 - distZero / 5) : 0
    const base = { safety, power, link, robustness: 100, science }
    const comb0 = combinedScore(base, { ...inp.weights, robustness: 0 })
    let worstDelta = 0
    for (const off of [-s0, s0]) {
      const w = win(off)
      const sc = { ...base, power: powerScore(w.lit, w.night), link: linkScore(w.dte, w.gap) }
      worstDelta = Math.max(worstDelta, Math.abs(combinedScore(sc, { ...inp.weights, robustness: 0 }) - comb0))
    }
    const scores = { ...base, robustness: Math.max(0, 100 - worstDelta) }
    const failed: string[] = []
    if (!(slope <= c.maxSlope)) failed.push('slope')
    if (safeArea < c.minSafeArea) failed.push('safeArea')
    if (tip.margin < c.minMargin) failed.push('margin')
    if (c.excludeZeroIllumination && zero[i]) failed.push('zeroIllumination')
    if (w0.lit < c.minSunlit) failed.push('sunlit')
    if (w0.night > c.maxNightH) failed.push('night')
    if (w0.dte < c.minDte) failed.push('dte')
    out.push({
      i,
      lon: g.lon[i],
      lat: g.lat[i],
      z0: g.z0[i],
      slope,
      margin: tip.margin,
      vCrit: tip.vCrit,
      safeArea,
      lit: w0.lit,
      nightH: w0.night,
      earth: w0.earth,
      dte: w0.dte,
      dteGapH: w0.gap,
      zeroIllum: zero[i],
      distZeroKm: distZero,
      scores,
      combined: combinedScore(scores, inp.weights),
      feasible: failed.length === 0,
      failed,
      nearShare: g.near[hi][i] / 100,
    })
  }
  inp.onProgress?.(0.9)
  const feasible = out.filter((o) => o.feasible)
  const top = pickDiverse(feasible, inp.minSeparationKm)
  const failedCounts: Record<string, number> = {}
  for (const o of out) for (const f of o.failed) failedCounts[f] = (failedCounts[f] ?? 0) + 1
  const med = (k: keyof CandidateScore) => {
    const v = feasible.map((o) => o[k] as number).filter(Number.isFinite).sort((a, b) => a - b)
    return v.length ? v[Math.floor(v.length / 2)] : NaN
  }
  const median: RankResult['median'] = {}
  for (const k of ['lit', 'nightH', 'dte', 'dteGapH', 'slope', 'margin', 'safeArea', 'combined'] as const) median[k] = med(k)
  inp.onProgress?.(1)
  return { all: out, feasibleCount: feasible.length, top, median, failedCounts }
}

/** Greedy by combined score (stable: ties broken by index) with a minimum separation between options. */
export function pickDiverse(cands: CandidateScore[], minKm: number, k = 3): CandidateScore[] {
  const sorted = [...cands].sort((a, b) => b.combined - a.combined || a.i - b.i)
  const out: CandidateScore[] = []
  for (const c of sorted) {
    if (out.every((o) => greatCircle(o.lon, o.lat, c.lon, c.lat) >= minKm * 1000)) out.push(c)
    if (out.length === k) break
  }
  return out
}

export type Strength = 'safest' | 'sunniest' | 'bestLink' | 'balance'

/** Label each option by its strongest point relative to the other two (each label used once). */
export function strengths(top: CandidateScore[]): Strength[] {
  const labels: Strength[] = new Array(top.length).fill('balance')
  if (!top.length) return labels
  const used = new Set<number>()
  const assign = (key: 'safety' | 'power' | 'link', label: Strength) => {
    let best = -1
    for (let j = 0; j < top.length; j++) if (!used.has(j) && (best < 0 || top[j].scores[key] > top[best].scores[key])) best = j
    if (best >= 0) {
      labels[best] = label
      used.add(best)
    }
  }
  // the best combined is "best balance"; the others take the dimension where they lead
  used.add(0)
  assign('safety', 'safest')
  assign('power', 'sunniest')
  assign('link', 'bestLink')
  return labels
}

export interface Reason {
  key: string
  /** values for the i18n template */
  v: Record<string, number | string>
  weight: number
}

/** Three reasons from the largest advantages vs the feasible-set median, plus the main risk. */
export function explain(o: CandidateScore, median: RankResult['median']): { reasons: Reason[]; risk: Reason } {
  const cand: Reason[] = []
  const m = median
  if (m.lit !== undefined) cand.push({ key: 'reason.lit', v: { lit: o.lit * 100, med: (m.lit ?? 0) * 100 }, weight: (o.lit - (m.lit ?? 0)) * 3 })
  if (m.nightH !== undefined) cand.push({ key: 'reason.night', v: { h: o.nightH, med: m.nightH ?? 0 }, weight: ((m.nightH ?? 0) - o.nightH) / 50 })
  if (m.dte !== undefined) cand.push({ key: 'reason.dte', v: { dte: o.dte * 100, med: (m.dte ?? 0) * 100 }, weight: (o.dte - (m.dte ?? 0)) * 3 })
  if (m.dteGapH !== undefined) cand.push({ key: 'reason.gap', v: { h: o.dteGapH, med: m.dteGapH ?? 0 }, weight: ((m.dteGapH ?? 0) - o.dteGapH) / 50 })
  if (m.slope !== undefined) cand.push({ key: 'reason.slope', v: { s: o.slope, med: m.slope ?? 0 }, weight: ((m.slope ?? 0) - o.slope) / 3 })
  if (m.margin !== undefined) cand.push({ key: 'reason.margin', v: { m: o.margin, v: o.vCrit }, weight: (o.margin - (m.margin ?? 0)) / 6 })
  if (Number.isFinite(o.distZeroKm)) cand.push({ key: 'reason.ice', v: { km: o.distZeroKm }, weight: o.distZeroKm < 2 ? 0.4 : 0 })
  const sorted = [...cand].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
  const reasons = sorted.slice(0, 3)
  const worst = sorted[sorted.length - 1]
  let risk: Reason = { ...worst, key: worst.key.replace('reason.', 'risk.') }
  if (o.nearShare > 0.25) risk = { key: 'risk.nearfield', v: { pct: o.nearShare * 100 }, weight: 1 }
  return { reasons, risk }
}

export function bestLandingDate(g: CandidateGrid, i: number, hi: number, eph: Ephemeris, start: number, durationMs: number, searchDays: number, stations: Station[], stepDays = 1) {
  const he = hourlyEphem(eph, start, start + (searchDays + 1) * DAY + durationMs, stations)
  const t = candidateTrack(g, i, hi, he, g.heights[hi])
  const dte = andFlags(t.earthIn, he.station)
  const nWin = Math.floor(durationMs / HOUR)
  let best = { day: 0, score: -1 }
  const res: { day: number; power: number; link: number; score: number }[] = []
  for (let d = 0; d <= searchDays; d += stepDays) {
    const o = Math.round((d * DAY) / HOUR)
    const L = stats(t.lit, o, o + nWin)
    const D = stats(dte, o, o + nWin)
    const p = powerScore(L.frac, L.maxOffH)
    const l = linkScore(D.frac, D.maxOffH)
    const s = Math.sqrt(p * l)
    res.push({ day: d, power: p, link: l, score: s })
    if (s > best.score) best = { day: d, score: s }
  }
  return { bestStart: start + best.day * DAY, scores: res }
}

void D2R
