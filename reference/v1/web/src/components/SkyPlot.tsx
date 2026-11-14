// Sky plot: terrain horizon (with uncertainty band), Sun and Earth at true angular size, trails.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ephemeris } from '../core/ephem'
import { azel, type SiteFrame } from '../core/geom'
import { maskAt, type Mask } from '../core/visibility'
import { DAY, HOUR } from '../core/analysis'
import { cssVar, setupCanvas } from './canvas'

interface Props {
  eph: Ephemeris
  frame: SiteFrame
  mask: Mask
  t: number
  trailDays: number
  onCanvas?: (c: HTMLCanvasElement | null) => void
}

const COMPASS: [number, string][] = [
  [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'], [360, 'N'],
]

export function SkyPlot({ eph, frame, mask, t, trailDays, onCanvas }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [probe, setProbe] = useState<{ az: number; el: number } | null>(null)
  const [size, setSize] = useState({ w: 600, h: 260 })

  useEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: Math.max(220, Math.min(320, el.clientWidth * 0.42)) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    onCanvas?.(ref.current)
    return () => onCanvas?.(null)
  }, [onCanvas])

  const trails = useMemo(() => {
    const n = Math.round((trailDays * DAY) / (2 * HOUR))
    const sun: [number, number][] = []
    const earth: [number, number][] = []
    for (let i = 0; i <= n; i++) {
      const tt = t + i * 2 * HOUR
      if (!eph.covers(tt)) break
      const s = azel(eph, 'SUN', tt, frame)
      const e = azel(eph, 'EARTH', tt, frame)
      sun.push([s.az, s.el])
      earth.push([e.az, e.el])
    }
    return { sun, earth }
  }, [eph, frame, t, trailDays])

  const sunNow = useMemo(() => azel(eph, 'SUN', t, frame), [eph, frame, t])
  const earthNow = useMemo(() => azel(eph, 'EARTH', t, frame), [eph, frame, t])

  // vertical range: fit the mask and both trails, padded
  const range = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < mask.n; i++) {
      lo = Math.min(lo, mask.lo[i])
      hi = Math.max(hi, mask.hi[i])
    }
    for (const p of [...trails.sun, ...trails.earth]) {
      lo = Math.min(lo, p[1] - 1)
      hi = Math.max(hi, p[1] + 1.2)
    }
    lo = Math.max(-90, Math.min(lo - 0.8, -2))
    hi = Math.min(90, Math.max(hi + 0.8, 6))
    return { lo, hi }
  }, [mask, trails])

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = setupCanvas(c, size.w, size.h)
    const padL = 40
    const padB = 22
    const padT = 8
    const W = size.w - padL - 6
    const H = size.h - padB - padT
    const X = (az: number) => padL + (az / 360) * W
    const Y = (el: number) => padT + (1 - (el - range.lo) / (range.hi - range.lo)) * H
    const degPx = H / (range.hi - range.lo)

    ctx.fillStyle = cssVar('--sky')
    ctx.fillRect(padL, padT, W, H)

    // grid
    ctx.font = '11px ' + cssVar('--font')
    ctx.lineWidth = 1
    const stepEl = range.hi - range.lo > 40 ? 15 : range.hi - range.lo > 16 ? 5 : range.hi - range.lo > 8 ? 2 : 1
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let e = Math.ceil(range.lo / stepEl) * stepEl; e <= range.hi; e += stepEl) {
      ctx.strokeStyle = e === 0 ? cssVar('--grid-strong') : cssVar('--grid')
      ctx.beginPath()
      ctx.moveTo(padL, Y(e))
      ctx.lineTo(padL + W, Y(e))
      ctx.stroke()
      ctx.fillStyle = cssVar('--muted')
      ctx.fillText(`${e}°`, padL - 5, Y(e))
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const [az, label] of COMPASS) {
      ctx.strokeStyle = cssVar('--grid')
      ctx.beginPath()
      ctx.moveTo(X(az), padT)
      ctx.lineTo(X(az), padT + H)
      ctx.stroke()
      ctx.fillStyle = az % 90 === 0 ? cssVar('--text') : cssVar('--muted')
      ctx.fillText(label, Math.min(Math.max(X(az), padL + 8), padL + W - 8), padT + H + 5)
    }

    ctx.save()
    ctx.beginPath()
    ctx.rect(padL, padT, W, H)
    ctx.clip()

    // trails (drawn behind terrain so occluded parts are hidden by it)
    const drawTrail = (pts: [number, number][], color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.setLineDash([2, 4])
      ctx.beginPath()
      let prev: number | null = null
      for (const [az, el] of pts) {
        if (prev === null || Math.abs(az - prev) > 180) ctx.moveTo(X(az), Y(el))
        else ctx.lineTo(X(az), Y(el))
        prev = az
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
    drawTrail(trails.sun, cssVar('--sun'))
    drawTrail(trails.earth, cssVar('--earth'))

    // discs at true angular size (minimum 3 px so they stay findable)
    const disc = (p: { az: number; el: number; rad: number }, color: string, ring: string) => {
      const r = Math.max(3, p.rad * degPx)
      for (const dx of [-360, 0, 360]) {
        ctx.beginPath()
        ctx.arc(X(p.az + dx), Y(p.el), r, 0, 2 * Math.PI)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = ring
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
    disc(sunNow, cssVar('--sun'), cssVar('--sun-ring'))
    disc(earthNow, cssVar('--earth'), cssVar('--earth-ring'))

    // terrain silhouette
    const path = (arr: Float32Array) => {
      ctx.beginPath()
      ctx.moveTo(X(0), Y(arr[0]))
      for (let i = 1; i <= mask.n; i++) ctx.lineTo(X((i / mask.n) * 360), Y(arr[i % mask.n]))
    }
    path(mask.mid)
    ctx.lineTo(X(360), padT + H + 2)
    ctx.lineTo(X(0), padT + H + 2)
    ctx.closePath()
    ctx.fillStyle = cssVar('--terrain')
    ctx.fill()
    if (mask.lo !== mask.hi) {
      // uncertainty band between lower and upper masks
      ctx.beginPath()
      ctx.moveTo(X(0), Y(mask.hi[0]))
      for (let i = 1; i <= mask.n; i++) ctx.lineTo(X((i / mask.n) * 360), Y(mask.hi[i % mask.n]))
      for (let i = mask.n; i >= 0; i--) ctx.lineTo(X((i / mask.n) * 360), Y(mask.lo[i % mask.n]))
      ctx.closePath()
      ctx.fillStyle = cssVar('--band')
      ctx.fill()
    }
    path(mask.mid)
    ctx.strokeStyle = cssVar('--terrain-edge')
    ctx.lineWidth = 1.25
    ctx.stroke()

    // outline the discs again, dashed, where terrain hides them (so position is never lost)
    for (const [p, color] of [[sunNow, cssVar('--sun')], [earthNow, cssVar('--earth')]] as const) {
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = color
      ctx.beginPath()
      ctx.arc(X(p.az), Y(p.el), Math.max(3, p.rad * degPx), 0, 2 * Math.PI)
      ctx.stroke()
      ctx.setLineDash([])
    }

    if (probe) {
      ctx.strokeStyle = cssVar('--text')
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.moveTo(X(probe.az), padT)
      ctx.lineTo(X(probe.az), padT + H)
      ctx.moveTo(padL, Y(probe.el))
      ctx.lineTo(padL + W, Y(probe.el))
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.restore()

    // direct labels
    ctx.font = '600 11px ' + cssVar('--font')
    ctx.textBaseline = 'bottom'
    const label = (p: { az: number; el: number; rad: number }, text: string, color: string) => {
      const x = X(p.az)
      const y = Math.max(padT + 14, Math.min(padT + H - 4, Y(p.el) - Math.max(3, p.rad * degPx) - 4))
      ctx.textAlign = x > padL + W - 50 ? 'right' : x < padL + 50 ? 'left' : 'center'
      ctx.fillStyle = color
      ctx.fillText(text, x, y)
    }
    label(sunNow, '☀ Sun', cssVar('--sun'))
    label(earthNow, '● Earth', cssVar('--earth'))
  }, [size, mask, range, trails, sunNow, earthNow, probe])

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const padL = 40
    const W = size.w - padL - 6
    const H = size.h - 22 - 8
    const az = ((e.clientX - r.left - padL) / W) * 360
    const el = range.lo + (1 - (e.clientY - r.top - 8) / H) * (range.hi - range.lo)
    if (az < 0 || az > 360 || el < range.lo || el > range.hi) setProbe(null)
    else setProbe({ az, el })
  }

  const i = probe ? Math.round((probe.az / 360) * mask.n) % mask.n : 0
  return (
    <div className="skyplot">
      <canvas
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={() => setProbe(null)}
        role="img"
        aria-label={`Sky plot. Sun at azimuth ${sunNow.az.toFixed(1)} degrees, elevation ${sunNow.el.toFixed(2)} degrees. Earth at azimuth ${earthNow.az.toFixed(1)} degrees, elevation ${earthNow.el.toFixed(2)} degrees.`}
      />
      <div className="probe" aria-live="off">
        {probe ? (
          <>
            az {probe.az.toFixed(1)}° · el {probe.el.toFixed(2)}° · horizon here {maskAt(mask, probe.az).toFixed(2)}°
            {mask.lo !== mask.hi && ` (${mask.lo[i].toFixed(2)}…${mask.hi[i].toFixed(2)}°)`}
            {mask.dist && ` · set by terrain ${mask.dist[i].toFixed(1)} km away`}
          </>
        ) : (
          <>
            Sun az {sunNow.az.toFixed(1)}° el {sunNow.el.toFixed(2)}° · Earth az {earthNow.az.toFixed(1)}° el{' '}
            {earthNow.el.toFixed(2)}° · dotted = next {trailDays} d · hover to probe
          </>
        )}
      </div>
    </div>
  )
}
