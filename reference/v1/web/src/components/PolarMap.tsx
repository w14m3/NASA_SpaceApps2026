// 2D south-polar map (polar stereographic, LOLA hillshade 80°S–90°S): pan, zoom, click to drop a site.
import { useEffect, useRef, useState } from 'react'
import type { Ephemeris } from '../core/ephem'
import { subPoint } from '../core/geom'
import { lonLatToXY, xyToLonLat } from '../core/horizon'
import type { SiteInfo } from '../state'
import { cssVar, setupCanvas } from './canvas'

const HALF = 304_000 // m, half-width of the 80°S DEM

interface Props {
  base: string
  eph: Ephemeris
  t: number
  sites: SiteInfo[]
  pins: string[]
  active: string | null
  onSelect: (id: string) => void
  onPick: (lat: number, lon: number) => void
}

export default function PolarMap({ base, eph, t, sites, pins, active, onSelect, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const img = useRef<HTMLImageElement | null>(null)
  const [ready, setReady] = useState<'loading' | 'ok' | 'missing'>('loading')
  const [size, setSize] = useState({ w: 600, h: 600 })
  // view: centre (map m) and metres per pixel
  const [view, setView] = useState({ cx: 0, cy: 0, mpp: 0 })
  const [probe, setProbe] = useState<{ lat: number; lon: number } | null>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  useEffect(() => {
    const i = new Image()
    i.onload = () => {
      img.current = i
      setReady('ok')
    }
    i.onerror = () => setReady('missing')
    i.src = `${base}data/hillshade_80S.jpg`
  }, [base])

  useEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const mpp = view.mpp || (2 * HALF) / Math.min(size.w, size.h)
  const toScreen = (x: number, y: number): [number, number] => [size.w / 2 + (x - view.cx) / mpp, size.h / 2 - (y - view.cy) / mpp]
  const toMap = (sx: number, sy: number): [number, number] => [view.cx + (sx - size.w / 2) * mpp, view.cy - (sy - size.h / 2) * mpp]

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = setupCanvas(c, size.w, size.h)
    ctx.fillStyle = cssVar('--bg')
    ctx.fillRect(0, 0, size.w, size.h)
    const [x0, y0] = toScreen(-HALF, HALF)
    const side = (2 * HALF) / mpp
    if (img.current) {
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img.current, x0, y0, side, side)
    } else {
      ctx.fillStyle = cssVar('--panel')
      ctx.fillRect(x0, y0, side, side)
    }
    // graticule
    ctx.lineWidth = 1
    ctx.font = '11px ' + cssVar('--font')
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    const [px, py] = toScreen(0, 0)
    for (const lat of [-88, -86, -84, -82, -80]) {
      const r = lonLatToXY(0, lat)[1] / mpp
      ctx.beginPath()
      ctx.arc(px, py, r, 0, 2 * Math.PI)
      ctx.stroke()
      ctx.fillText(`${-lat}°S`, px + 4, py - r - 3)
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const [ex, ey] = toScreen(...lonLatToXY(lon, -80))
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      const [lx, ly] = toScreen(...lonLatToXY(lon, -80.6))
      ctx.fillText(`${lon > 180 ? lon - 360 : lon}°E`, lx - 10, ly + 4)
    }
    // Sun and Earth directions (azimuth of the sub-points seen from the pole)
    const arrow = (lon: number, color: string, label: string) => {
      const [dx, dy] = lonLatToXY(lon, -80)
      const n = Math.hypot(dx, dy)
      const r = Math.min(size.w, size.h) / 2 - 26
      const ax = size.w / 2 + (dx / n) * r
      const ay = size.h / 2 - (dy / n) * r
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(ax, ay, 7, 0, 2 * Math.PI)
      ctx.fill()
      ctx.strokeStyle = '#000'
      ctx.stroke()
      ctx.font = '600 11px ' + cssVar('--font')
      ctx.fillText(label, ax + 10 > size.w - 70 ? ax - 70 : ax + 10, ay + 4)
    }
    arrow(subPoint(eph, 'SUN', t).lon, cssVar('--sun'), '☀ to Sun')
    arrow(subPoint(eph, 'EARTH', t).lon, cssVar('--earth'), '● to Earth')

    // sites
    for (const s of sites) {
      if (s.lat > -79.5) continue
      const [sx, sy] = toScreen(...lonLatToXY(s.lon, s.lat))
      const isActive = s.id === active
      const pinned = pins.includes(s.id)
      ctx.beginPath()
      ctx.arc(sx, sy, isActive ? 8 : pinned ? 6.5 : 4.5, 0, 2 * Math.PI)
      ctx.fillStyle = s.category === 'custom' ? '#fff' : s.category === 'poi' ? '#ff8f6b' : '#5ad1c8'
      ctx.fill()
      ctx.lineWidth = isActive ? 3 : 1.5
      ctx.strokeStyle = isActive ? '#fff' : '#000'
      ctx.stroke()
      if (pinned || isActive || mpp < 250) {
        ctx.font = (isActive ? '600 ' : '') + '12px ' + cssVar('--font')
        ctx.lineWidth = 3
        ctx.strokeStyle = '#000'
        ctx.strokeText(s.name, sx + 10, sy - 8)
        ctx.fillStyle = '#fff'
        ctx.fillText(s.name, sx + 10, sy - 8)
      }
    }
    if (ready === 'missing') {
      ctx.fillStyle = cssVar('--muted')
      ctx.fillText('Hillshade image not built — run the pipeline (make data).', 12, 20)
    }
    // scale bar
    const km = [1, 2, 5, 10, 20, 50, 100].find((k) => (k * 1000) / mpp > 60) ?? 100
    ctx.fillStyle = '#fff'
    ctx.fillRect(12, size.h - 18, (km * 1000) / mpp, 3)
    ctx.font = '11px ' + cssVar('--font')
    ctx.fillText(`${km} km`, 12, size.h - 24)
  }, [size, view, sites, pins, active, t, eph, ready, mpp])

  const local = (e: { clientX: number; clientY: number }, el: Element): [number, number] => {
    const r = el.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  return (
    <div className="polarmap">
      <canvas
        ref={ref}
        aria-label="South-polar map, 80 to 90 degrees south. Click to drop a custom site; drag to pan; scroll to zoom."
        onWheel={(e) => {
          const [sx, sy] = local(e, e.currentTarget)
          const [mx, my] = toMap(sx, sy)
          const next = Math.max(20, Math.min((2 * HALF) / Math.min(size.w, size.h), mpp * (e.deltaY > 0 ? 1.25 : 0.8)))
          setView({ mpp: next, cx: mx - (sx - size.w / 2) * next, cy: my + (sy - size.h / 2) * next })
        }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: false }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const [sx, sy] = local(e, e.currentTarget)
          const [lon, lat] = xyToLonLat(...toMap(sx, sy))
          setProbe(lat <= -80 ? { lat, lon } : null)
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x
          const dy = e.clientY - d.y
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
          if (d.moved) {
            setView((v) => ({ mpp, cx: v.cx - dx * mpp, cy: v.cy + dy * mpp }))
            d.x = e.clientX
            d.y = e.clientY
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (!d || d.moved) return
          const [sx, sy] = local(e, e.currentTarget)
          // marker hit-test first
          for (const s of sites) {
            if (s.lat > -79.5) continue
            const [mx, my] = toScreen(...lonLatToXY(s.lon, s.lat))
            if (Math.hypot(mx - sx, my - sy) < 12) return onSelect(s.id)
          }
          const [lon, lat] = xyToLonLat(...toMap(sx, sy))
          if (lat <= -80.5) onPick(lat, lon)
        }}
        onPointerLeave={() => setProbe(null)}
      />
      <div className="map-probe">
        {probe
          ? `${(-probe.lat).toFixed(3)}°S ${probe.lon.toFixed(3)}°E — click to analyse this spot`
          : 'South-polar stereographic · LOLA hillshade · click anywhere to analyse'}
      </div>
    </div>
  )
}
