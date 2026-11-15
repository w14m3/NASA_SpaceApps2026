// The selected site, its window analysis, and the instantaneous conditions at the mission time.
import { useEffect, useMemo, useState } from 'react'
import { defaultScenario, instant, siteCountdowns, type Instant } from '../core/analysis'
import type { ResolvedSite } from './data'
import { arrayFor, effectiveHeight, stationsFor, useAnalysis, useEphemeris, useResolved, useSites } from './hooks'
import { useStore } from './store'

export function useCurrentSite() {
  const sel = useStore((s) => s.sel)
  const h = useStore((s) => s.h)
  const sites = useSites()
  const hEff = effectiveHeight(sel, h, sites)
  const site = useResolved(sel, hEff)
  const analysis = useAnalysis(site.data && site.data.ref === sel ? site.data : site.data)
  return { site: site.data, siteError: site.error, siteLoading: site.loading, analysis: analysis.data, analysisLoading: analysis.loading, analysisError: analysis.error }
}

export function useScenarioObj() {
  const station = useStore((s) => s.station)
  const minEl = useStore((s) => s.minEl)
  const layout = useStore((s) => s.layout)
  const panelAz = useStore((s) => s.panelAz)
  const loadW = useStore((s) => s.loadW)
  const landing = useStore((s) => s.landing)
  const dur = useStore((s) => s.durDays)
  return useMemo(() => {
    const sc = defaultScenario(landing, dur)
    sc.stations = stationsFor({ station, minEl })
    sc.array = arrayFor({ layout, panelAz })
    sc.loadW = loadW
    return sc
  }, [station, minEl, layout, panelAz, loadW, landing, dur])
}

export function useInstant(site: ResolvedSite | null): Instant | null {
  const eph = useEphemeris()
  const t = useStore((s) => s.t)
  const sc = useScenarioObj()
  return useMemo(() => {
    if (!eph || !site || !eph.covers(t)) return null
    return instant(eph, { lon: site.lon, lat: site.lat, z0: site.z0, h: site.h }, site.mask, sc, t)
  }, [eph, site, t, sc])
}

export type Countdowns = ReturnType<typeof siteCountdowns>

export function useCountdowns(site: ResolvedSite | null): Countdowns | null {
  const eph = useEphemeris()
  const t = useStore((s) => s.t)
  const playing = useStore((s) => s.playing)
  const sc = useScenarioObj()
  const [cd, setCd] = useState<{ key: string; v: Countdowns } | null>(null)
  const key = site ? `${site.key}|${Math.round(t / 60_000)}` : ''
  useEffect(() => {
    if (!eph || !site || !eph.covers(t)) return
    const id = setTimeout(
      () => {
        const v = siteCountdowns(eph, { lon: site.lon, lat: site.lat, z0: site.z0, h: site.h }, site.mask, sc, t)
        setCd({ key, v })
      },
      playing ? 400 : 120,
    )
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, eph, sc])
  if (!cd || !site || !cd.key.startsWith(site.key)) return null
  // while time moves, shift the stored countdown targets rather than showing stale durations
  return cd.v
}
