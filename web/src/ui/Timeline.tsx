// Bottom dock: time scrubber over the mission window, play/pause and speed, schedule slip, stacked tracks
// (Sun, Earth in view, each DSN complex, DTE, Sun + DTE) for the selected site and the pinned sites.
import { useEffect, useRef } from 'react'
import { DAY, SYNODIC_MS } from '../core/constants'
import type { Interval } from '../core/events'
import { fmtUtc, useT } from './i18n'
import { setState, useStore, refToString } from './store'
import { useCurrentSite } from './current'
import { analyseCached, resolveCached, stationsFor, arrayFor, useAsync, useSites, effectiveHeight } from './hooks'
import type { SiteAnalysis } from '../core/analysis'

interface Track {
  label: string
  color: string
  iv: Interval[]
}

function tracksFor(a: SiteAnalysis, t: (k: string) => string, prefix = ''): Track[] {
  const st = a.stationWindows
  return [
    { label: prefix + t('track.sun'), color: '#f7bd4a', iv: a.sun },
    { label: prefix + t('track.earth'), color: '#5cb2ff', iv: a.earth },
    ...(prefix ? [] : st.map((iv, k) => ({ label: ['DSS-14', 'DSS-63', 'DSS-43', 'User'][k] ?? `GS${k}`, color: '#7f8fa8', iv }))),
    { label: prefix + t('track.dte'), color: '#3fd0c9', iv: a.dte },
    { label: prefix + t('track.both'), color: '#43c787', iv: a.sunAndDte },
  ]
}

export function Timeline() {
  const { t } = useT()
  const ref = useRef<HTMLCanvasElement>(null)
  const tNow = useStore((s) => s.t)
  const landing = useStore((s) => s.landing)
  const dur = useStore((s) => s.durDays)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const pins = useStore((s) => s.pins)
  const { site, analysis } = useCurrentSite()
  const sites = useSites()
  const h = useStore((s) => s.h)
  const station = useStore((s) => s.station)
  const minEl = useStore((s) => s.minEl)
  const layout = useStore((s) => s.layout)
  const panelAz = useStore((s) => s.panelAz)
  const loadW = useStore((s) => s.loadW)
  const t0 = landing
  const t1 = landing + dur * DAY
  const pinKey = pins.map(refToString).join(';') + `|${t0}|${t1}|${h}|${station}|${minEl}`
  const pinAnalyses = useAsync(pins.length ? pinKey : null, async () => {
    const out: { name: string; a: SiteAnalysis }[] = []
    for (const p of pins) {
      const s = await resolveCached(p, effectiveHeight(p, h, sites))
      const a = await analyseCached(s, t0, t1, stationsFor({ station, minEl }), arrayFor({ layout, panelAz }), loadW).promise
      out.push({ name: s.name, a })
    }
    return out
  })

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const w = c.clientWidth
    const hgt = c.clientHeight
    const dpr = window.devicePixelRatio || 1
    c.width = w * dpr
    c.height = hgt * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0a1220'
    ctx.fillRect(0, 0, w, hgt)
    const padL = 92
    const X = (ms: number) => padL + ((ms - t0) / (t1 - t0)) * (w - padL - 8)
    const tracks: Track[] = []
    if (analysis && analysis.t0 === t0 && analysis.t1 === t1) tracks.push(...tracksFor(analysis, t))
    pinAnalyses.data?.forEach((p, k) => {
      if (p.a.t0 === t0 && p.a.t1 === t1) tracks.push(...tracksFor(p.a, t, `${k + 1}·`).filter((_, i) => i !== 1))
    })
    const rowH = Math.max(7, Math.min(16, (hgt - 22) / Math.max(1, tracks.length)))
    ctx.font = '10.5px system-ui'
    tracks.forEach((tr, i) => {
      const y = 4 + i * rowH
      ctx.fillStyle = '#a7b1c4'
      ctx.fillText(tr.label, 4, y + rowH - 3)
      ctx.fillStyle = '#16223a'
      ctx.fillRect(padL, y + 1, w - padL - 8, rowH - 2)
      ctx.fillStyle = tr.color
      for (const iv of tr.iv) ctx.fillRect(X(iv.start), y + 1, Math.max(1, X(iv.end) - X(iv.start)), rowH - 2)
    })
    // day ticks
    ctx.fillStyle = '#7b879d'
    const days = (t1 - t0) / DAY
    const every = days > 120 ? 30 : days > 40 ? 7 : days > 10 ? 2 : 1
    for (let d = 0; d <= days; d += every) {
      const x = X(t0 + d * DAY)
      ctx.fillRect(x, hgt - 16, 1, 4)
      ctx.fillText(new Date(t0 + d * DAY).toISOString().slice(5, 10), x + 2, hgt - 4)
    }
    // cursor
    if (tNow >= t0 && tNow <= t1) {
      ctx.fillStyle = '#ffd75e'
      ctx.fillRect(X(tNow) - 1, 0, 2, hgt - 16)
    }
  }, [analysis, pinAnalyses.data, tNow, t0, t1, t])

  const setFromX = (clientX: number) => {
    const c = ref.current!
    const r = c.getBoundingClientRect()
    const padL = 92
    const f = Math.max(0, Math.min(1, (clientX - r.left - padL) / (r.width - padL - 8)))
    setState({ t: Math.round(t0 + f * (t1 - t0)), playing: false })
  }
  const slip = (days: number) => setState((s) => ({ landing: s.landing + days * DAY, t: s.t + days * DAY }))
  return (
    <>
      <div className="controls">
        <b style={{ fontSize: 12.5 }}>{t('timeline.title')}</b>
        <button className="btn small" onClick={() => setState((s) => ({ playing: !s.playing, t: s.t >= t1 ? t0 : s.t }))} aria-pressed={playing} data-testid="play">
          {playing ? `❚❚ ${t('timeline.pause')}` : `▶ ${t('timeline.play')}`}
        </button>
        <label className="row">
          <span className="hint">{t('timeline.speed')}</span>
          <select className="input" style={{ width: 'auto' }} value={speed} onChange={(e) => setState({ speed: Number(e.target.value) })} data-testid="speed">
            <option value={600}>10 min/s</option>
            <option value={3600}>1 h/s</option>
            <option value={21600}>6 h/s</option>
            <option value={86400}>1 d/s</option>
          </select>
        </label>
        <span className="hint">{t('timeline.slip')}</span>
        {[-7, -1, 1, 7].map((d) => (
          <button key={d} className="btn small" onClick={() => slip(d)} data-testid={`slip-${d}`}>
            {d > 0 ? '+' : ''}
            {d} {t('units.d')}
          </button>
        ))}
        <button className="btn small" onClick={() => slip(SYNODIC_MS / DAY)} data-testid="slip-lunar">
          {t('timeline.lunarDay')}
        </button>
        <label className="row">
          <span className="hint">{t('timeline.window')}</span>
          <input
            type="date"
            className="input"
            style={{ width: 'auto' }}
            value={new Date(landing).toISOString().slice(0, 10)}
            min="2017-01-01"
            max="2030-12-01"
            onChange={(e) => {
              const ms = Date.parse(e.target.value + 'T00:00:00Z')
              if (Number.isFinite(ms)) setState((s) => ({ landing: ms, t: ms + Math.min(s.durDays * DAY, Math.max(0, s.t - s.landing)) }))
            }}
            data-testid="landing-date"
          />
          <select className="input" style={{ width: 'auto' }} value={dur} onChange={(e) => setState((s) => ({ durDays: Number(e.target.value), t: Math.min(s.t, s.landing + Number(e.target.value) * DAY) }))} data-testid="duration">
            {[3, 7, 14, 30, 60, 180, 365].map((d) => (
              <option key={d} value={d}>
                {d} {t('units.d')}
              </option>
            ))}
          </select>
        </label>
        <span className="hint" style={{ marginLeft: 'auto' }}>
          {fmtUtc(tNow)}
        </span>
      </div>
      <div style={{ position: 'relative', minHeight: 0 }}>
      <canvas
        ref={ref}
        className="timeline"
        role="slider"
        tabIndex={0}
        aria-label="Mission time within the window"
        aria-valuemin={t0}
        aria-valuemax={t1}
        aria-valuenow={tNow}
        aria-valuetext={fmtUtc(tNow)}
        data-testid="timeline"
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          setFromX(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) setFromX(e.clientX)
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? DAY : 3_600_000
          if (e.key === 'ArrowRight') setState((s) => ({ t: Math.min(t1, s.t + step) }))
          else if (e.key === 'ArrowLeft') setState((s) => ({ t: Math.max(t0, s.t - step) }))
          else if (e.key === ' ') setState((s) => ({ playing: !s.playing }))
          else return
          e.preventDefault()
        }}
      />
      </div>
      {site && !analysis && <span className="sr-only">{t('computing')}</span>}
    </>
  )
}
