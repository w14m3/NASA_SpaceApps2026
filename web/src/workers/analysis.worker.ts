/// <reference lib="webworker" />
// Analysis worker: live horizons, window analysis, Top 3 ranking, polar raster layers. Same core as the tests.
import { analyseSite, defaultScenario, type Scenario, type SiteAnalysis } from '../core/analysis'
import { candidateMask, parseCandidates, type CandidateGrid } from '../core/candidates'
import { DAY, D2R, R2D, R_MOON_M } from '../core/constants'
import { bilinearXY, type DemGrid } from '../core/dem'
import { browserGunzip, loadDem } from '../core/demload'
import { loadEphemeris, type Ephemeris } from '../core/ephem'
import { computeHorizon } from '../core/horizon'
import type { Mask } from '../core/mask'
import { destination, xyToLonLat } from '../core/projection'
import { whoBlocks } from '../core/whoblocks'
import { route } from '../core/traverse'
import { HERO_REGIONS } from '../core/regions'
import { ellipseMonteCarlo, LANDERS, planeFit, SLOPE_UNCERTAINTY_DEG, tipOver, type Ellipse } from '../core/safety'
import { DSN, moonFromStation, stationFrame, type Station } from '../core/stations'
import { diskFraction } from '../core/disk'
import { bestLandingDate, DEFAULT_CONSTRAINTS, explain, PERSONAS, rankCandidates, strengths, type Constraints, type RankResult } from '../core/top3'
import { azel, siteFrame, type SiteSpec } from '../core/topo'
import { DEFAULT_ARRAY, integrate, LEVEL_ATTITUDE, sunTrack, type ArraySpec, type Attitude } from '../core/energy'
import { gaps, intervals, longest } from '../core/events'
import { bodyFn, DEFAULT_THRESHOLDS } from '../core/analysis'

// absolute base URL of the app, sent by the main thread before the first call (relative builds work at any prefix)
let BASE_URL = self.location.origin + '/'
const fetcher = (p: string) => fetch(new URL(p, BASE_URL).href)

let ephP: Promise<Ephemeris> | null = null
const eph = () => (ephP ??= loadEphemeris(fetcher))
let demP: Promise<DemGrid> | null = null
const dem = () => (demP ??= loadDem(fetcher, browserGunzip))
const grids = new Map<string, Promise<CandidateGrid>>()
function grid(id: string) {
  if (!grids.has(id)) {
    const region = HERO_REGIONS.find((r) => r.id === id)!
    grids.set(
      id,
      (async () => {
        const meta = await (await fetcher(`data/candidates/${id}.json`)).json()
        const buf = await browserGunzip(await (await fetcher(`data/candidates/${id}.bin.gz`)).arrayBuffer())
        return parseCandidates(region, meta, buf)
      })(),
    )
  }
  return grids.get(id)!
}

export interface ScenarioArgs {
  t0: number
  t1: number
  stations?: Station[]
  array?: ArraySpec
  attitude?: Attitude
  loadW?: number
}

function scenario(a: ScenarioArgs): Scenario {
  const sc = defaultScenario(a.t0)
  sc.t1 = a.t1
  if (a.stations) sc.stations = a.stations
  if (a.array) sc.array = a.array
  if (a.attitude) sc.attitude = a.attitude
  if (a.loadW !== undefined) sc.loadW = a.loadW
  return sc
}

/** Energy optimiser (contract §6.8): layouts × azimuths at the given masks; baseline = best fixed vertical at 2 m. */
function optimiseEnergy(e: Ephemeris, site: SiteSpec, masks: Record<string, Mask>, t0: number, t1: number, base: ArraySpec, att: Attitude, objective: 'total' | 'worst') {
  const out: { h: number; layout: string; azimuth: number; wh: number; worstDayWh: number; darkH: number }[] = []
  for (const [hs, mask] of Object.entries(masks)) {
    const h = Number(hs)
    const f = siteFrame({ ...site, h })
    const track = sunTrack(e, f, mask, t0, t1)
    const g = bodyFn(e, f, mask, 'SUN', DEFAULT_THRESHOLDS, 'mid')
    const iv = intervals(g, t0, t1)
    const dk = longest(gaps(iv, t0, t1))
    const darkH = dk ? (dk.end - dk.start) / 3_600_000 : 0
    const evalSpec = (spec: ArraySpec) => {
      const r = integrate(spec, att, track)
      // worst 24 h window of energy (resilience objective)
      let worst = Infinity
      const hw = r.hourlyW
      let run = 0
      for (let i = 0; i < hw.length; i++) {
        run += hw[i]
        if (i >= 24) run -= hw[i - 24]
        if (i >= 23) worst = Math.min(worst, run)
      }
      return { wh: r.electricWh, worstDayWh: Number.isFinite(worst) ? worst : r.electricWh }
    }
    for (let az = 0; az < 360; az += 15) {
      const v = evalSpec({ ...base, layout: 'vertical', azimuth: az })
      out.push({ h, layout: 'vertical', azimuth: az, ...v, darkH })
    }
    for (const layout of ['flat', 'box4', 'track', 'twoAxis'] as const) {
      const v = evalSpec({ ...base, layout, azimuth: 0 })
      out.push({ h, layout, azimuth: 0, ...v, darkH })
    }
  }
  const key = (o: (typeof out)[number]) => (objective === 'total' ? o.wh : o.worstDayWh)
  const at2 = out.filter((o) => o.h === Math.min(...Object.keys(masks).map(Number)))
  const baseline = at2.filter((o) => o.layout === 'vertical').sort((a, b) => b.wh - a.wh || a.azimuth - b.azimuth)[0]
  const flat2 = at2.find((o) => o.layout === 'flat')
  const fixedOnly = out.filter((o) => o.layout === 'vertical' || o.layout === 'box4' || o.layout === 'flat')
  const best = [...out].sort((a, b) => key(b) - key(a) || a.h - b.h)[0]
  const bestFixed = [...fixedOnly].sort((a, b) => key(b) - key(a) || a.h - b.h)[0]
  return { options: out, baseline, flat2, best, bestFixed }
}

const api = {
  async init(a: { base: string }) {
    BASE_URL = a.base
    return true
  },
  async liveMask(a: { lon: number; lat: number; h: number; nAz: number }) {
    const g = await dem()
    const r = computeHorizon([g], a.lon, a.lat, a.h, { nAz: a.nAz })
    if (!r) return null
    return { mask: r.mask, z0: r.z0, voidFrac: r.voidFrac, rays: r.raysLeavingData, rough: r.rough }
  },
  async analyse(a: { site: SiteSpec; mask: Mask; sc: ScenarioArgs }): Promise<SiteAnalysis> {
    return analyseSite(await eph(), a.site, a.mask, scenario(a.sc))
  },
  async heightAt(a: { lon: number; lat: number }) {
    const g = await dem()
    const pf = planeFit(g, a.lon, a.lat, 720)
    return { z: bilinearXY(g, ...lonLatXY(a.lon, a.lat)), slope: pf?.slope ?? NaN, downhill: pf?.downhill ?? NaN, rough: pf?.roughness ?? NaN }
  },
  async safety(a: { lon: number; lat: number; lander: 'small' | 'medium' | 'large'; ellipse: Ellipse; maxSlope: number; seed: number }) {
    const g = await dem()
    const p = LANDERS[a.lander]
    const baseline = 720
    const pf = planeFit(g, a.lon, a.lat, baseline)
    if (!pf) return null
    const tip = tipOver(p, pf.slope, SLOPE_UNCERTAINTY_DEG)
    const mc = ellipseMonteCarlo(g, a.lon, a.lat, a.ellipse, p, a.maxSlope, SLOPE_UNCERTAINTY_DEG, baseline, 500, a.seed)
    return { fit: pf, tip, mc, lander: p, demLabel: g.label }
  },
  async candidateInfo(a: { region: string; i: number }) {
    const g = await grid(a.region)
    return { lon: g.lon[a.i], lat: g.lat[a.i], z0: g.z0[a.i], slope: g.slope[a.i] }
  },
  async regionMeta(a: { region: string }) {
    const g = await grid(a.region)
    return { n: g.n, nx: g.nx, x: g.x, y: g.y, lon: g.lon, lat: g.lat, slope: g.slope, spacing: g.region.spacingM, heights: g.heights }
  },
  async rank(a: { region: string; h: number; t0: number; t1: number; lander: 'small' | 'medium' | 'large'; persona: string; constraints?: Partial<Constraints>; minSepKm?: number; stations?: Station[]; refine?: number }, progress?: (f: number) => void) {
    const e = await eph()
    const g = await grid(a.region)
    const hi = Math.max(0, g.heights.indexOf(a.h === 2 ? 2 : 10))
    const constraints = { ...DEFAULT_CONSTRAINTS, ...(a.constraints ?? {}) }
    const stations = a.stations ?? DSN
    const r: RankResult = rankCandidates({
      grid: g,
      heightIndex: hi,
      eph: e,
      t0: a.t0,
      t1: a.t1,
      stations,
      lander: LANDERS[a.lander],
      constraints,
      weights: PERSONAS[a.persona] ?? PERSONAS.balanced,
      minSeparationKm: a.minSepKm ?? 1,
      onProgress: (f) => progress?.(f * 0.7),
    })
    // mast gain layer: lit fraction at 10 m minus at 2 m (both heights are in the grid)
    let gain: Float32Array | null = null
    if (g.heights.length > 1) {
      const other = rankCandidates({ grid: g, heightIndex: hi === 0 ? 1 : 0, eph: e, t0: a.t0, t1: a.t1, stations, lander: LANDERS[a.lander], constraints, weights: PERSONAS.balanced, minSeparationKm: 1 })
      gain = new Float32Array(g.n)
      for (let i = 0; i < g.n; i++) {
        const hi10 = hi === 1 ? r.all[i].lit : other.all[i].lit
        const lo2 = hi === 1 ? other.all[i].lit : r.all[i].lit
        gain[i] = (hi10 - lo2) * 100
      }
    }
    progress?.(0.85)
    const labels = strengths(r.top)
    const top = r.top.map((o, k) => {
      const ex = explain(o, r.median)
      const best = bestLandingDate(g, o.i, hi, e, a.t0 - 7 * DAY, a.t1 - a.t0, 14, stations)
      return { ...o, label: labels[k], reasons: ex.reasons, risk: ex.risk, bestStart: best.bestStart, dateScores: best.scores }
    })
    progress?.(1)
    const layer = (f: (o: (typeof r.all)[number]) => number) => Float32Array.from(r.all, f)
    return {
      top,
      feasibleCount: r.feasibleCount,
      total: g.n,
      failedCounts: r.failedCounts,
      median: r.median,
      constraints,
      heightUsed: g.heights[hi],
      layers: {
        lit: layer((o) => o.lit * 100),
        night: layer((o) => o.nightH),
        earth: layer((o) => o.earth * 100),
        dte: layer((o) => o.dte * 100),
        slope: layer((o) => o.slope),
        viability: layer((o) => (o.feasible ? o.combined : 0)),
        combined: layer((o) => o.combined),
        zero: layer((o) => (o.zeroIllum ? 1 : 0)),
        gain: gain ?? layer(() => NaN),
        feasible: layer((o) => (o.feasible ? 1 : 0)),
        power: layer((o) => o.scores.power),
        link: layer((o) => o.scores.link),
        safety: layer((o) => o.scores.safety),
      },
    }
  },
  /** Who blocks the Sun (§7.13) for every night of at least one hour in the window. */
  async whoBlocks(a: { site: SiteSpec; mask: Mask; t0: number; t1: number }) {
    const e = await eph()
    const f = siteFrame(a.site)
    const iv = intervals(bodyFn(e, f, a.mask, 'SUN', DEFAULT_THRESHOLDS, 'mid'), a.t0, a.t1)
    return whoBlocks(e, f, a.mask, a.site.z0 + a.site.h, iv, a.t0, a.t1)
  },
  /** Illumination compass (§6.12): sunlit fraction at 8 neighbours r metres away (LOLA 240 m live masks). */
  async compass(a: { lon: number; lat: number; h: number; t0: number; t1: number; r: number }) {
    const e = await eph()
    const g = await dem()
    const out: { az: number; lon: number; lat: number; lit: number }[] = []
    const sunlit = (lon: number, lat: number) => {
      const hz = computeHorizon([g], lon, lat, a.h, { nAz: 360, bands: false })
      if (!hz) return NaN
      const f = siteFrame({ lon, lat, z0: hz.z0, h: a.h })
      let on = 0
      let n = 0
      for (let t = a.t0 + 1_800_000; t < a.t1; t += 3_600_000) {
        if (diskFraction(hz.mask, azel(e, 'SUN', t, f)) >= 0.01) on++
        n++
      }
      return n ? on / n : NaN
    }
    const centre = sunlit(a.lon, a.lat)
    for (let k = 0; k < 8; k++) {
      const [lon, lat] = destination(a.lon, a.lat, k * 45, a.r)
      out.push({ az: k * 45, lon, lat, lit: sunlit(lon, lat) })
    }
    return { centre, r: a.r, neighbours: out }
  },
  /** Moon Directions (§7.12): least-effort route on the LOLA 240 m slope grid between two points. */
  async route(a: { from: { lon: number; lat: number }; to: { lon: number; lat: number }; sMax: number; sRef: number; t: number }) {
    const g = await dem()
    const e = await eph()
    const [x0, y0] = lonLatXY(a.from.lon, a.from.lat)
    const [x1, y1] = lonLatXY(a.to.lon, a.to.lat)
    const margin = 3000
    const minx = Math.min(x0, x1) - margin
    const maxy = Math.max(y0, y1) + margin
    const px = g.px
    const nx = Math.ceil((Math.max(x0, x1) + margin - minx) / px) + 1
    const ny = Math.ceil((maxy - (Math.min(y0, y1) - margin)) / px) + 1
    if (nx * ny > 400_000) return { error: 'too far (route box larger than 400,000 cells)' }
    const slope = new Float32Array(nx * ny)
    const z = new Float32Array(nx * ny)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const x = minx + i * px
        const y = maxy - j * px
        z[j * nx + i] = bilinearXY(g, x, y)
      }
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i
        if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) {
          slope[c] = NaN
          continue
        }
        const x = minx + i * px
        const y = maxy - j * px
        const [, lat] = xyToLonLat(x, y)
        const k = 2 / (1 - Math.sin(lat * D2R)) // map metres per true metre
        const dzdx = ((z[c + 1] - z[c - 1]) / (2 * px)) * k
        const dzdy = ((z[c - nx] - z[c + nx]) / (2 * px)) * k
        slope[c] = Math.atan(Math.hypot(dzdx, dzdy)) * R2D
      }
    const cell = (x: number, y: number) => Math.round((maxy - y) / px) * nx + Math.round((x - minx) / px)
    const k0 = 2 / (1 - Math.sin(((a.from.lat + a.to.lat) / 2) * D2R))
    const r = route({ nx, ny, px: px / k0, slope }, cell(x0, y0), cell(x1, y1), a.sMax, a.sRef)
    if (!r) return { error: 'no route below the slope limit' }
    // per node: lon/lat, elevation, sunlit at time t (one ray toward the Sun azimuth, 150 km)
    const sun = e.position('SUN', a.t)
    const sr = Math.hypot(sun[0], sun[1], sun[2])
    const nodes = r.path.map((c) => {
      const x = minx + (c % nx) * px
      const y = maxy - Math.floor(c / nx) * px
      const [lon, lat] = xyToLonLat(x, y)
      const f = siteFrame({ lon, lat, z0: z[c], h: 2 })
      const el = Math.asin((sun[0] * f.up[0] + sun[1] * f.up[1] + sun[2] * f.up[2]) / sr) * R2D
      let az = Math.atan2(sun[0] * f.east[0] + sun[1] * f.east[1] + sun[2] * f.east[2], sun[0] * f.north[0] + sun[1] * f.north[1] + sun[2] * f.north[2]) * R2D
      if (az < 0) az += 360
      const hz = rayMax(g, x, y, lon, az, z[c] + 2)
      return { lon, lat, z: z[c], slope: slope[c], lit: el + 0.2666 > hz }
    })
    return { lengthM: r.lengthM, maxSlope: r.maxSlope, meanSlope: r.meanSlope, cost: r.cost, nodes, cell: px, sunlitFrac: nodes.filter((n) => n.lit).length / nodes.length }
  },
  async optimise(a: { site: SiteSpec; masks: Record<string, Mask>; t0: number; t1: number; array?: ArraySpec; attitude?: Attitude; objective: 'total' | 'worst' }) {
    return optimiseEnergy(await eph(), a.site, a.masks, a.t0, a.t1, a.array ?? DEFAULT_ARRAY, a.attitude ?? LEVEL_ATTITUDE, a.objective)
  },
  async candidateMasks(a: { region: string; i: number }) {
    const g = await grid(a.region)
    return g.heights.map((_, hi) => candidateMask(g, a.i, hi))
  },
  /** Season view: hourly Sun visible fraction and DTE flag over `days` from t0 (12-month heatmap). */
  async season(a: { site: SiteSpec; mask: Mask; t0: number; days: number; stations?: Station[] }) {
    const e = await eph()
    const f = siteFrame(a.site)
    const n = Math.round(a.days * 24)
    const sun = new Float32Array(n)
    const dte = new Uint8Array(n)
    const st = (a.stations ?? DSN).map((s) => ({ s, f: stationFrame(s) }))
    for (let k = 0; k < n; k++) {
      const t = a.t0 + (k + 0.5) * 3_600_000
      sun[k] = diskFraction(a.mask, azel(e, 'SUN', t, f))
      const ef = diskFraction(a.mask, azel(e, 'EARTH', t, f))
      dte[k] = ef >= 0.5 && st.some((x) => moonFromStation(e, x.f, t).el >= x.s.minEl) ? 1 : 0
    }
    return { t0: a.t0, n, sun, dte }
  },
  /** Street View: per azimuth, the highest terrain elevation within distance bands (silhouettes shaded by distance). */
  async streetBands(a: { lon: number; lat: number; h: number; nAz: number }) {
    const g = await dem()
    const edges = [0, 1000, 3000, 10_000, 30_000, 300_000]
    const nb = edges.length - 1
    const out = new Float32Array(nb * a.nAz).fill(-90)
    const lon = a.lon * D2R
    const lat = a.lat * D2R
    const up = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
    const east = [-Math.sin(lon), Math.cos(lon), 0]
    const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]]
    const [sx, sy] = lonLatXY(a.lon, a.lat)
    const z0 = bilinearXY(g, sx, sy)
    if (Number.isNaN(z0)) return null
    const rho0 = R_MOON_M + z0 + a.h
    for (let i = 0; i < a.nAz; i++) {
      const az = (2 * Math.PI * i) / a.nAz
      const d0 = north[0] * Math.cos(az) + east[0] * Math.sin(az)
      const d1 = north[1] * Math.cos(az) + east[1] * Math.sin(az)
      const d2 = north[2] * Math.cos(az) + east[2] * Math.sin(az)
      let b = 0
      for (let s = 20; s < 300_000; s += Math.min(120, Math.max(10, 0.01 * s))) {
        while (s > edges[b + 1]) b++
        const th = s / R_MOON_M
        const ct = Math.cos(th)
        const st = Math.sin(th)
        const p2 = up[2] * ct + d2 * st
        const k = (2 * R_MOON_M) / (1 - p2)
        const z = bilinearXY(g, k * (up[1] * ct + d1 * st), k * (up[0] * ct + d0 * st))
        if (Number.isNaN(z)) break
        const eps = Math.atan2((R_MOON_M + z) * ct - rho0, (R_MOON_M + z) * st) * R2D
        if (eps > out[b * a.nAz + i]) out[b * a.nAz + i] = eps
      }
    }
    return { edges, nb, nAz: a.nAz, bands: out, z0 }
  },
  /** Terrain patch in local east/north metres around a site (curvature drop included), for the 3D view. */
  async demPatch(a: { lon: number; lat: number; halfKm: number; n: number }) {
    const g = await dem()
    const [x0, y0] = lonLatXY(a.lon, a.lat)
    const lo = a.lon * D2R
    const k = 2 / (1 - Math.sin(a.lat * D2R))
    const nx = Math.sin(lo)
    const ny = Math.cos(lo)
    const ex = Math.cos(lo)
    const ey = -Math.sin(lo)
    const z = new Float32Array(a.n * a.n)
    const half = a.halfKm * 1000
    const zc = bilinearXY(g, x0, y0)
    for (let j = 0; j < a.n; j++)
      for (let i = 0; i < a.n; i++) {
        const E = -half + (2 * half * i) / (a.n - 1)
        const N = half - (2 * half * j) / (a.n - 1)
        const v = bilinearXY(g, x0 + k * (E * ex + N * nx), y0 + k * (E * ey + N * ny))
        z[j * a.n + i] = (Number.isNaN(v) ? zc : v) - zc - (E * E + N * N) / (2 * R_MOON_M)
      }
    return { n: a.n, half, z, zc, px: g.px, label: g.label }
  },
  /** Instantaneous terrain shadow over the polar cap for the Sun direction at time t (horizon sweep per pixel). */
  async lighting(a: { t: number; size: number }) {
    const e = await eph()
    const g = await dem()
    const N = a.size
    const half = (g.nx * g.px) / 2
    const step = (2 * half) / N
    const sun = e.position('SUN', a.t)
    const out = new Uint8Array(N * N)
    const sr = Math.hypot(sun[0], sun[1], sun[2])
    const s = [sun[0] / sr, sun[1] / sr, sun[2] / sr]
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const x = -half + (c + 0.5) * step
        const y = half - (r + 0.5) * step
        const [lon, lat] = xyToLonLat(x, y)
        const f = siteFrame({ lon, lat, z0: 0, h: 0 })
        const el = Math.asin(s[0] * f.up[0] + s[1] * f.up[1] + s[2] * f.up[2]) * R2D
        let az = Math.atan2(s[0] * f.east[0] + s[1] * f.east[1] + s[2] * f.east[2], s[0] * f.north[0] + s[1] * f.north[1] + s[2] * f.north[2]) * R2D
        if (az < 0) az += 360
        const z0 = bilinearXY(g, x, y)
        if (Number.isNaN(z0)) {
          out[r * N + c] = 0
          continue
        }
        // march toward the Sun azimuth up to 150 km, coarse steps growing with distance
        const ca = Math.cos(az * D2R)
        const sa = Math.sin(az * D2R)
        const lo = lon * D2R
        // local north/east in map coordinates (south polar stereographic)
        const nx = Math.sin(lo)
        const ny = Math.cos(lo)
        const ex = Math.cos(lo)
        const ey = -Math.sin(lo)
        const dx = ca * nx + sa * ex
        const dy = ca * ny + sa * ey
        let maxEl = -90
        for (let d = step; d < 150_000; d += Math.max(step, d * 0.02)) {
          const z = bilinearXY(g, x + dx * d, y + dy * d)
          if (Number.isNaN(z)) break
          const th = d / R_MOON_M
          const rho = R_MOON_M + z
          const eps = Math.atan2(rho * Math.cos(th) - (R_MOON_M + z0 + 2), rho * Math.sin(th)) * R2D
          if (eps > maxEl) maxEl = eps
          if (maxEl > el + 0.3) break
        }
        const rad = 0.2666
        const frac = Math.max(0, Math.min(1, (el - maxEl + rad) / (2 * rad)))
        out[r * N + c] = Math.round(frac * 255)
      }
    return { N, half, data: out, sunEl: 0 }
  },
}

function rayMax(g: DemGrid, x: number, y: number, lonDeg: number, azDeg: number, zObs: number) {
  const lo = lonDeg * D2R
  const ca = Math.cos(azDeg * D2R)
  const sa = Math.sin(azDeg * D2R)
  const dx = ca * Math.sin(lo) + sa * Math.cos(lo)
  const dy = ca * Math.cos(lo) - sa * Math.sin(lo)
  let best = -90
  for (let d = g.px / 2; d < 150_000; d += Math.max(g.px / 2, d * 0.01)) {
    const z = bilinearXY(g, x + dx * d, y + dy * d)
    if (Number.isNaN(z)) break
    const th = d / R_MOON_M
    const e = Math.atan2((R_MOON_M + z) * Math.cos(th) - (R_MOON_M + zObs), (R_MOON_M + z) * Math.sin(th)) * R2D
    if (e > best) best = e
  }
  return best
}

function lonLatXY(lon: number, lat: number): [number, number] {
  const la = lat * D2R
  const lo = lon * D2R
  const k = (2 * R_MOON_M * Math.cos(la)) / (1 - Math.sin(la))
  return [k * Math.sin(lo), k * Math.cos(lo)]
}

export type Api = typeof api

self.onmessage = async (e: MessageEvent) => {
  const { id, method, arg } = e.data as { id: number; method: keyof Api; arg: never }
  try {
    const fn = api[method] as (a: never, p?: (f: number) => void) => Promise<unknown>
    const result = await fn(arg, (progress: number) => (self as unknown as Worker).postMessage({ id, progress }))
    ;(self as unknown as Worker).postMessage({ id, result })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, error: String((err as Error)?.stack ?? err) })
  }
}
