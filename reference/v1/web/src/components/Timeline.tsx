// Stacked timeline: per pinned site, Sun-visible fraction and Earth-in-view tracks. Click/drag scrubs time.
import { useEffect, useRef, useState } from 'react'
import { DAY, fmtUtc, type Analysis } from '../core/analysis'
import { cssVar, setupCanvas } from './canvas'

export interface Row {
  id: string
  name: string
  a: Analysis
  active: boolean
}

interface Props {
  rows: Row[]
  t0: number
  t1: number
  t: number
  onScrub: (t: number) => void
}

const LABEL_W = 132
const ROW_H = 46
const AXIS_H = 22

export function Timeline({ rows, t0, t1, t, onScrub }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [w, setW] = useState(800)
  const [hover, setHover] = useState<{ x: number; t: number; row: number } | null>(null)
  const drag = useRef(false)
  const h = AXIS_H + Math.max(1, rows.length) * ROW_H + 4

  useEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = setupCanvas(c, w, h)
    const W = w - LABEL_W - 8
    const X = (tt: number) => LABEL_W + ((tt - t0) / (t1 - t0)) * W
    ctx.font = '11px ' + cssVar('--font')

    // day ticks
    const days = (t1 - t0) / DAY
    const tick = days > 200 ? 30 : days > 60 ? 10 : days > 20 ? 5 : days > 8 ? 2 : 1
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    const first = Math.ceil(t0 / DAY) * DAY
    for (let d = first, k = 0; d <= t1; d += DAY, k++) {
      const major = Math.round(d / DAY) % tick === 0
      ctx.strokeStyle = major ? cssVar('--grid-strong') : cssVar('--grid')
      if (major || days <= 60) {
        ctx.beginPath()
        ctx.moveTo(X(d), major ? 14 : AXIS_H - 3)
        ctx.lineTo(X(d), h)
        ctx.stroke()
      }
      if (major && X(d) < w - 44) {
        ctx.fillStyle = cssVar('--muted')
        ctx.fillText(new Date(d).toISOString().slice(5, 10), X(d) + 3, 2)
      }
    }

    rows.forEach((row, ri) => {
      const y0 = AXIS_H + ri * ROW_H
      const sunH = 22
      const earthH = 9
      // label
      ctx.fillStyle = row.active ? cssVar('--text') : cssVar('--muted')
      ctx.font = (row.active ? '600 ' : '') + '12px ' + cssVar('--font')
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      let name = row.name
      while (ctx.measureText(name).width > LABEL_W - 12 && name.length > 4) name = name.slice(0, -2)
      ctx.fillText(name === row.name ? name : name + '…', 2, y0 + 12)
      ctx.font = '10px ' + cssVar('--font')
      ctx.fillStyle = cssVar('--muted')
      ctx.fillText('☀ Sun', 2, y0 + 27)
      ctx.fillText('● Earth', 50, y0 + 27)

      // track backgrounds
      ctx.fillStyle = cssVar('--shadow')
      ctx.fillRect(LABEL_W, y0 + 2, W, sunH)
      ctx.fillRect(LABEL_W, y0 + sunH + 5, W, earthH)

      // Sun fraction as an area (height = visible fraction of the disk)
      ctx.beginPath()
      ctx.moveTo(X(row.a.series[0].t), y0 + 2 + sunH)
      for (const s of row.a.series) ctx.lineTo(X(s.t), y0 + 2 + sunH * (1 - s.sunFrac))
      ctx.lineTo(X(row.a.series[row.a.series.length - 1].t), y0 + 2 + sunH)
      ctx.closePath()
      ctx.fillStyle = cssVar('--sun')
      ctx.fill()

      // Earth in view: exact intervals as bars
      ctx.fillStyle = cssVar('--earth')
      for (const iv of row.a.earthIv) {
        const xa = X(iv.start)
        ctx.fillRect(xa, y0 + sunH + 5, Math.max(1, X(iv.end) - xa), earthH)
      }
      // both (power AND link): thin tick line under the row, redundant-coded by position
      ctx.fillStyle = cssVar('--ok')
      for (const iv of row.a.bothIv) {
        const xa = X(iv.start)
        ctx.fillRect(xa, y0 + sunH + earthH + 7, Math.max(1, X(iv.end) - xa), 2)
      }
      if (row.active) {
        ctx.strokeStyle = cssVar('--grid-strong')
        ctx.strokeRect(LABEL_W - 0.5, y0 + 1.5, W + 1, sunH + earthH + 8)
      }
    })

    // cursor
    if (t >= t0 && t <= t1) {
      ctx.strokeStyle = cssVar('--cursor')
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(X(t), 12)
      ctx.lineTo(X(t), h)
      ctx.stroke()
      ctx.fillStyle = cssVar('--cursor')
      ctx.beginPath()
      ctx.moveTo(X(t) - 5, 8)
      ctx.lineTo(X(t) + 5, 8)
      ctx.lineTo(X(t), 15)
      ctx.fill()
      ctx.lineWidth = 1
    }
    if (hover) {
      ctx.strokeStyle = cssVar('--text')
      ctx.globalAlpha = 0.45
      ctx.beginPath()
      ctx.moveTo(hover.x, 12)
      ctx.lineTo(hover.x, h)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }, [rows, t0, t1, t, w, h, hover])

  const at = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    const W = w - LABEL_W - 8
    const tt = t0 + (Math.max(0, Math.min(W, x - LABEL_W)) / W) * (t1 - t0)
    const row = Math.max(0, Math.min(rows.length - 1, Math.floor((e.clientY - r.top - AXIS_H) / ROW_H)))
    return { x: Math.max(LABEL_W, Math.min(LABEL_W + W, x)), t: tt, row }
  }

  const hv = hover && rows[hover.row]
  let tip: string | null = null
  if (hover && hv) {
    const s = hv.a.series[Math.round(((hover.t - t0) / (t1 - t0)) * (hv.a.series.length - 1))]
    tip = `${fmtUtc(hover.t)} · ${hv.name}: Sun ${Math.round(s.sunFrac * 100)}% of disk visible (el ${s.sun.el.toFixed(2)}°), Earth ${s.earthFrac >= 0.5 ? 'in view' : 'hidden'} (el ${s.earth.el.toFixed(2)}°)`
  }

  return (
    <div className="timeline">
      <canvas
        ref={ref}
        tabIndex={0}
        role="slider"
        aria-label="Time scrubber"
        aria-valuemin={t0}
        aria-valuemax={t1}
        aria-valuenow={Math.round(t)}
        aria-valuetext={fmtUtc(t)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? DAY : 3600_000
          if (e.key === 'ArrowRight') onScrub(t + step)
          else if (e.key === 'ArrowLeft') onScrub(t - step)
          else return
          e.preventDefault()
        }}
        onPointerDown={(e) => {
          drag.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          onScrub(at(e).t)
        }}
        onPointerMove={(e) => {
          const p = at(e)
          setHover(p)
          if (drag.current) onScrub(p.t)
        }}
        onPointerUp={() => (drag.current = false)}
        onPointerLeave={() => setHover(null)}
      />
      <div className="probe">
        {tip ?? 'Amber height = fraction of the Sun’s disk above the terrain · blue = Earth in view · green line = both · click or drag to set the time (←/→ 1 h, Shift 1 d)'}
      </div>
    </div>
  )
}
