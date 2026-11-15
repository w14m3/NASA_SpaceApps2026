// Async data hooks: resolved sites, window analyses and the Top 3 ranking, cached by key.
import { useEffect, useState } from 'react'
import { DAY } from '../core/constants'
import type { SiteAnalysis } from '../core/analysis'
import type { Ephemeris } from '../core/ephem'
import { DSN, DEFAULT_MIN_EL, type Station } from '../core/stations'
import type { ArraySpec } from '../core/energy'
import { DEFAULT_ARRAY } from '../core/energy'
import { curatedSites, ephemeris, resolveSite, type CuratedSite, type ResolvedSite } from './data'
import { rpc } from './workerClient'
import { refToString, useStore, type AppState, type SiteRef } from './store'

export function useAsync<T>(key: string | null, fn: () => Promise<T>): { data: T | null; error: string | null; loading: boolean } {
  const [st, setSt] = useState<{ key: string | null; data: T | null; error: string | null }>({ key: null, data: null, error: null })
  useEffect(() => {
    if (key === null) return
    let alive = true
    fn().then(
      (d) => alive && setSt({ key, data: d, error: null }),
      (e) => alive && setSt({ key, data: null, error: String(e?.message ?? e) }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const fresh = st.key === key
  return { data: fresh ? st.data : st.data, error: fresh ? st.error : null, loading: !fresh }
}

export function useEphemeris(): Ephemeris | null {
  return useAsync('eph', ephemeris).data
}

export function useSites(): CuratedSite[] {
  return useAsync('sites', curatedSites).data ?? []
}

const siteCache = new Map<string, Promise<ResolvedSite>>()
export function resolveCached(ref: SiteRef, h: number) {
  const k = refToString(ref) + '@' + h
  if (!siteCache.has(k)) siteCache.set(k, resolveSite(ref, h))
  return siteCache.get(k)!
}

export function useResolved(ref: SiteRef, h: number) {
  const k = refToString(ref) + '@' + h
  return useAsync(k, () => resolveCached(ref, h))
}

/** Effective mast height for a site: curated 80 m masks exist at 2 m and 10 m only. */
export function effectiveHeight(ref: SiteRef, h: number, sites: CuratedSite[]): number {
  if (ref.kind === 'curated') {
    const c = sites.find((s) => s.id === ref.id)
    if (c?.mask) return h <= 6 ? 2 : 10
  }
  return h
}

export function stationsFor(s: Pick<AppState, 'station' | 'minEl'>): Station[] {
  const list: Station[] = DSN.map((d) => ({ ...d, minEl: s.minEl ?? DEFAULT_MIN_EL }))
  if (s.station) {
    const [lat, lon, hm, me] = s.station.split(',').map(Number)
    if ([lat, lon].every(Number.isFinite))
      list.push({ id: 'USER', name: 'User station', lat, lon, heightM: Number.isFinite(hm) ? hm : 0, minEl: Number.isFinite(me) ? me : s.minEl, source: 'user input', custom: true })
  }
  return list
}

export function arrayFor(s: Pick<AppState, 'layout' | 'panelAz'>, optimisedAz?: number): ArraySpec {
  return { ...DEFAULT_ARRAY, layout: s.layout, azimuth: s.panelAz >= 0 ? s.panelAz : optimisedAz ?? 0 }
}

const anaCache = new Map<string, Promise<SiteAnalysis>>()
export function analyseCached(site: ResolvedSite, t0: number, t1: number, stations: Station[], array: ArraySpec, loadW: number) {
  const k = `${site.key}|${t0}|${t1}|${JSON.stringify(stations.map((s) => [s.id, s.lat, s.lon, s.minEl]))}|${JSON.stringify(array)}|${loadW}`
  if (!anaCache.has(k)) {
    if (anaCache.size > 40) anaCache.clear()
    anaCache.set(k, rpc.analyse({ site: { lon: site.lon, lat: site.lat, z0: site.z0, h: site.h }, mask: site.mask, sc: { t0, t1, stations, array, loadW } }))
  }
  return { key: k, promise: anaCache.get(k)! }
}

export function useWindow() {
  const landing = useStore((s) => s.landing)
  const dur = useStore((s) => s.durDays)
  return { t0: landing, t1: landing + dur * DAY }
}

export function useAnalysis(site: ResolvedSite | null) {
  const { t0, t1 } = useWindow()
  const station = useStore((s) => s.station)
  const minEl = useStore((s) => s.minEl)
  const layout = useStore((s) => s.layout)
  const panelAz = useStore((s) => s.panelAz)
  const loadW = useStore((s) => s.loadW)
  const stations = stationsFor({ station, minEl })
  const array = arrayFor({ layout, panelAz }, site?.lat !== undefined ? optimalAzGuess() : 0)
  const job = site ? analyseCached(site, t0, t1, stations, array, loadW) : null
  return useAsync(job?.key ?? null, () => job!.promise)
}

function optimalAzGuess() {
  return 0
}

export type Top3Result = Awaited<ReturnType<typeof rpc.rank>>
const rankCache = new Map<string, Promise<Top3Result>>()

export function useTop3() {
  const region = useStore((s) => s.region)
  const h = useStore((s) => s.h)
  const lander = useStore((s) => s.lander)
  const persona = useStore((s) => s.persona)
  const station = useStore((s) => s.station)
  const minEl = useStore((s) => s.minEl)
  const relax = useStore((s) => s.relax)
  const cons = useStore((s) => s.cons)
  const { t0, t1 } = useWindow()
  const [progress, setProgress] = useState(0)
  const key = `${region}|${h <= 6 ? 2 : 10}|${lander}|${persona}|${t0}|${t1}|${station}|${minEl}|${relax}|${cons}`
  const res = useAsync(key, () => {
    if (!rankCache.has(key)) {
      if (rankCache.size > 12) rankCache.clear()
      setProgress(0)
      rankCache.set(key, rpc.rank({ region, h: h <= 6 ? 2 : 10, t0, t1, lander, persona, stations: stationsFor({ station, minEl }), constraints: { ...parseCons(cons), ...relaxed(relax) } }, setProgress))
    }
    return rankCache.get(key)!
  })
  return { ...res, progress }
}

export function parseCons(cons: string): Record<string, number | boolean> {
  const c: Record<string, number | boolean> = {}
  for (const kv of cons.split(',').filter(Boolean)) {
    const [k, v] = kv.split('=')
    if (k === 'excludeZeroIllumination') c[k] = v === '1'
    else if (Number.isFinite(Number(v))) c[k] = Number(v)
  }
  return c
}

export function relaxed(relax: string) {
  const c: Record<string, number | boolean> = {}
  for (const k of relax.split(',').filter(Boolean)) {
    if (k === 'slope') c.maxSlope = 12
    if (k === 'safeArea') c.minSafeArea = 0.25
    if (k === 'margin') c.minMargin = 5
    if (k === 'sunlit') c.minSunlit = 0.1
    if (k === 'night') c.maxNightH = 400
    if (k === 'dte') c.minDte = 0.02
    if (k === 'zeroIllumination') c.excludeZeroIllumination = false
  }
  return c
}
