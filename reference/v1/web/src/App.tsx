import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { analyse, DAY, fmtUtc } from './core/analysis'
import { Timeline, type Row } from './components/Timeline'
import { Workbench, type SiteResult } from './components/Workbench'
import { Trust } from './components/Trust'
import { customSite, getMask, loadData, useAppState, useSites, type Data, type MaskEntry, type SiteInfo } from './state'

const Globe = lazy(() => import('./components/Globe'))
const PolarMap = lazy(() => import('./components/PolarMap'))

const SPEEDS: [string, number][] = [
  ['1 h/s', 3600],
  ['6 h/s', 21600],
  ['1 d/s', 86400],
  ['5 d/s', 432000],
]
const WINDOWS = [7, 14, 30, 90, 365]
const HEIGHTS = [2, 10]
const CATS: Record<string, string> = { poi: 'South-pole points of interest', clps: 'CLPS', apollo: 'Apollo', international: 'Other nations', custom: 'Custom' }

export default function App() {
  const [state, dispatch] = useAppState()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [masks, setMasks] = useState<Record<string, MaskEntry>>({})
  const [flyTo, setFlyTo] = useState<SiteInfo | null>(null)
  const [query, setQuery] = useState('')
  const set = (patch: Partial<typeof state>) => dispatch({ type: 'set', patch })

  useEffect(() => {
    loadData().then(setData, (e) => setError(String(e)))
  }, [])

  const sites = useSites(data, state)
  const siteList = useMemo(() => [...sites.values()], [sites])

  // keep time inside ephemeris coverage
  useEffect(() => {
    if (data && !data.eph.covers(state.t)) set({ t: Math.min(Math.max(state.t, data.eph.startMs), data.eph.endMs - 400 * DAY), playing: false })
  }, [data, state.t])

  // playback
  const last = useRef(0)
  useEffect(() => {
    if (!state.playing) return
    let raf = 0
    last.current = performance.now()
    const loop = (now: number) => {
      dispatch({ type: 'tick', dtMs: Math.min(100, now - last.current) })
      last.current = now
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [state.playing])

  // masks for pinned sites at the current instrument height
  useEffect(() => {
    if (!data) return
    let alive = true
    for (const id of state.pins) {
      const s = sites.get(id)
      const key = `${id}|${state.h}`
      if (!s || masks[key]) continue
      getMask(data.base, s, state.h).then((m) => alive && setMasks((prev) => ({ ...prev, [key]: m })))
    }
    return () => {
      alive = false
    }
  }, [data, state.pins, state.h, sites])

  // analysis window: starts at the day containing t; re-anchored only when t leaves it
  const anchor = useRef(0)
  if (state.t < anchor.current || state.t > anchor.current + state.windowDays * DAY || anchor.current === 0)
    anchor.current = Math.floor(state.t / DAY) * DAY
  const t0 = anchor.current
  const t1 = data ? Math.min(t0 + state.windowDays * DAY, data.eph.endMs) : t0 + state.windowDays * DAY

  const results: SiteResult[] = useMemo(() => {
    if (!data) return []
    const out: SiteResult[] = []
    for (const id of state.pins) {
      const site = sites.get(id)
      const entry = masks[`${id}|${state.h}`]
      if (!site || !entry) continue
      const a = analyse(data.eph, { lon: site.lon, lat: site.lat, z0: entry.z0, h: state.h }, entry.mask, t0, t1)
      out.push({ site, entry, a })
    }
    return out
  }, [data, state.pins, state.h, masks, sites, t0, t1])

  const rows: Row[] = results.map((r) => ({ id: r.site.id, name: r.site.name, a: r.a, active: r.site.id === state.active }))

  const select = (id: string) => {
    dispatch({ type: 'select', id })
    const s = sites.get(id)
    if (s) setFlyTo(s)
  }
  const pick = (lat: number, lon: number) => {
    const s = customSite(Number(lat.toFixed(4)), Number(lon.toFixed(4)))
    dispatch({ type: 'addCustom', site: s })
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const m = q.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/)
    const out: SiteInfo[] = []
    if (m) {
      const lat = Number(m[1])
      const lon = Number(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 360) out.push(customSite(lat, lon > 180 ? lon - 360 : lon))
    }
    return out.concat(siteList.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8))
  }, [query, siteList])

  if (error) return <div className="fatal">Could not load the data files: {error}. Run the pipeline (see README) and reload.</div>
  if (!data) return <div className="loading">Loading ephemeris and sites…</div>
  if (state.page === 'trust') return <Trust data={data} onBack={() => set({ page: 'app' })} />

  const mapSites = siteList
  const iso = new Date(state.t).toISOString().slice(0, 16)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>◐</span> Lunar Landing Site Navigator
        </div>
        <div className="search">
          <input
            type="search"
            placeholder="Find a site, or type lat, lon (e.g. -89.45, -137.3)"
            aria-label="Find a site or enter latitude, longitude"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length > 0 && (
            <ul className="results">
              {matches.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      if (s.category === 'custom') dispatch({ type: 'addCustom', site: s })
                      else dispatch({ type: 'select', id: s.id })
                      setFlyTo(s)
                      setQuery('')
                    }}
                  >
                    {s.name} <span className="muted">{s.lat.toFixed(2)}°, {s.lon.toFixed(2)}°</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="seg" role="group" aria-label="Map view">
          <button aria-pressed={state.view === 'globe'} onClick={() => set({ view: 'globe' })}>3D Moon</button>
          <button aria-pressed={state.view === 'polar'} onClick={() => set({ view: 'polar' })}>South pole</button>
        </div>
        <label className="check">
          <input type="checkbox" checked={state.expert} onChange={(e) => set({ expert: e.target.checked })} /> Expert
        </label>
        <button className="ghost" onClick={() => set({ page: 'trust' })}>Methods &amp; Trust</button>
      </header>

      <main className="stage">
        <div className="map">
          <Suspense fallback={<div className="loading">Loading map…</div>}>
            {state.view === 'globe' ? (
              <Globe eph={data.eph} t={state.t} sites={mapSites} pins={state.pins} active={state.active} onSelect={select} onPick={pick} flyTo={flyTo} />
            ) : (
              <PolarMap base={data.base} eph={data.eph} t={state.t} sites={mapSites} pins={state.pins} active={state.active} onSelect={select} onPick={pick} />
            )}
          </Suspense>
          <nav className="sitelist" aria-label="Curated sites">
            {Object.entries(CATS).map(([cat, label]) => {
              const list = siteList.filter((s) => s.category === cat)
              if (!list.length) return null
              return (
                <details key={cat} open={cat === 'poi' || cat === 'clps'}>
                  <summary>{label} <span className="muted">{list.length}</span></summary>
                  {list.map((s) => (
                    <button key={s.id} className={state.pins.includes(s.id) ? 'pinned' : ''} onClick={() => select(s.id)}>
                      {s.name}
                    </button>
                  ))}
                </details>
              )
            })}
          </nav>
        </div>
        <Workbench eph={data.eph} state={state} results={results} manifest={data.manifest} set={set} unpin={(id) => dispatch({ type: 'unpin', id })} select={select} />
      </main>

      <footer className="timebar">
        <div className="controls">
          <button className="play" aria-label={state.playing ? 'Pause' : 'Play'} onClick={() => set({ playing: !state.playing })}>
            {state.playing ? '❚❚' : '▶'}
          </button>
          <select aria-label="Playback speed" value={state.speed} onChange={(e) => set({ speed: Number(e.target.value) })}>
            {SPEEDS.map(([l, v]) => (<option key={v} value={v}>{l}</option>))}
          </select>
          <input
            type="datetime-local"
            aria-label="Date and time (UTC)"
            value={iso}
            min={new Date(data.eph.startMs).toISOString().slice(0, 16)}
            max={new Date(data.eph.endMs).toISOString().slice(0, 16)}
            onChange={(e) => {
              const v = Date.parse(e.target.value + ':00Z')
              if (!Number.isNaN(v)) set({ t: v, playing: false })
            }}
          />
          <span className="utc">UTC</span>
          <button className="ghost" onClick={() => set({ t: Date.now(), playing: false })}>Now</button>
          <span className="slip" role="group" aria-label="Slip the date">
            <span className="muted">Slip</span>
            {[-7, -1, 1, 7].map((d) => (
              <button key={d} className="ghost" onClick={() => set({ t: state.t + d * DAY, playing: false })}>
                {d > 0 ? '+' : '−'}{Math.abs(d)} d
              </button>
            ))}
            <button className="ghost" title="One synodic lunar day (29.53 d)" onClick={() => set({ t: state.t + 29.530589 * DAY, playing: false })}>+1 lunar day</button>
          </span>
          <label>
            Window
            <select value={state.windowDays} onChange={(e) => set({ windowDays: Number(e.target.value) })}>
              {WINDOWS.map((w) => (<option key={w} value={w}>{w} d</option>))}
            </select>
          </label>
          <label title="Height of the solar array / antenna above the ground. Raising it lowers the horizon.">
            Mast
            <select value={state.h} onChange={(e) => set({ h: Number(e.target.value) })}>
              {HEIGHTS.map((h) => (<option key={h} value={h}>{h} m</option>))}
            </select>
          </label>
        </div>
        {rows.length > 0 ? (
          <Timeline rows={rows} t0={t0} t1={t1} t={state.t} onScrub={(t) => set({ t, playing: false })} />
        ) : (
          <div className="probe">{fmtUtc(state.t)} — pin a site to see its Sun and Earth timeline here.</div>
        )}
      </footer>
    </div>
  )
}
