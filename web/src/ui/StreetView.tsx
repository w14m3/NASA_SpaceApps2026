// Moon Street View (contract §6.3): first-person 360° panorama at mast height rendered from the DEM — terrain
// silhouettes by distance band (nearer = darker), the validated horizon on top, Sun and Earth discs at true angular
// size with their paths over the window. Drag or use the arrow keys to look around; time follows the scrubber.
import { useEffect, useRef, useState } from 'react'
import { maskAt } from '../core/mask'
import type { ResolvedSite } from './data'
import { useT } from './i18n'
import { useCurrentSite, useInstant } from './current'
import { useAsync } from './hooks'
import { rpc } from './workerClient'

export default function StreetView({ site }: { site: ResolvedSite | null }) {
  const { t } = useT()
  const ref = useRef<HTMLCanvasElement>(null)
  const { analysis } = useCurrentSite()
  const inst = useInstant(site)
  const [heading, setHeading] = useState<number | null>(null)
  const [fov, setFov] = useState(120)
  const [exag, setExag] = useState(4)
  const bands = useAsync(site && site.terrain !== 'sphere' ? `${site.key}` : null, () => rpc.streetBands({ lon: site!.lon, lat: site!.lat, h: site!.h, nAz: 1440 }))
  const drag = useRef<{ x: number; h: number } | null>(null)
  const hd = heading ?? (inst ? inst.sun.az : 0)
  useEffect(() => {
    const c = ref.current
    if (!c || !site) return
    const w = c.clientWidth
    const h = c.clientHeight
    const dpr = window.devicePixelRatio || 1
    c.width = w * dpr
    c.height = h * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const pxDeg = w / fov
    const horizonY = h * 0.62
    const X = (az: number) => w / 2 + ((((az - hd + 540) % 360) - 180) * pxDeg)
    const Y = (el: number) => horizonY - el * pxDeg * exag
    // black airless sky with a faint star field (deterministic)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    let seed = 42
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    for (let i = 0; i < 160; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const sx = (seed % 10000) / 10000
      seed = (seed * 1664525 + 1013904223) >>> 0
      const sy = (seed % 10000) / 10000
      ctx.fillRect(sx * w, sy * horizonY * 0.9, 1, 1)
    }
    // elevation grid
    ctx.strokeStyle = 'rgba(160,180,210,0.18)'
    ctx.fillStyle = 'rgba(200,210,230,0.6)'
    ctx.font = '11px system-ui'
    for (let el = -4; el <= 20; el += 2) {
      ctx.beginPath()
      ctx.moveTo(0, Y(el))
      ctx.lineTo(w, Y(el))
      ctx.stroke()
      ctx.fillText(`${el}°`, 4, Y(el) - 2)
    }
    // Sun & Earth paths over the window
    if (analysis) {
      for (const s of analysis.hourly) {
        ctx.fillStyle = 'rgba(247,189,74,0.5)'
        ctx.fillRect(X(s.sunAz) - 1, Y(s.sunEl) - 1, 2, 2)
        ctx.fillStyle = 'rgba(92,178,255,0.6)'
        ctx.fillRect(X(s.earthAz) - 1, Y(s.earthEl) - 1, 2, 2)
      }
    }
    // bodies at true angular size (vertical exaggeration applied to position and shape alike)
    if (inst) {
      const disc = (az: number, el: number, rad: number, color: string, glow: boolean) => {
        if (glow) {
          const gr = ctx.createRadialGradient(X(az), Y(el), 0, X(az), Y(el), rad * pxDeg * 8)
          gr.addColorStop(0, 'rgba(255,230,160,0.35)')
          gr.addColorStop(1, 'rgba(255,230,160,0)')
          ctx.fillStyle = gr
          ctx.fillRect(X(az) - rad * pxDeg * 8, Y(el) - rad * pxDeg * 8, rad * pxDeg * 16, rad * pxDeg * 16)
        }
        ctx.beginPath()
        ctx.ellipse(X(az), Y(el), Math.max(2, rad * pxDeg), Math.max(2, rad * pxDeg * exag), 0, 0, 2 * Math.PI)
        ctx.fillStyle = color
        ctx.fill()
      }
      disc(inst.sun.az, inst.sun.el, inst.sun.rad, '#fff4d6', true)
      disc(inst.earth.az, inst.earth.el, inst.earth.rad, '#5cb2ff', false)
    }
    // terrain: far bands first (lighter), near last (darker)
    const nb = bands.data?.nb ?? 0
    const shade = ['#2a2c31', '#3a3d44', '#4d5159', '#61666f', '#777c86']
    for (let b = nb - 1; b >= 0; b--) {
      ctx.beginPath()
      ctx.moveTo(0, h)
      for (let x = 0; x <= w; x += 2) {
        const az = hd + (x - w / 2) / pxDeg
        let v = -90
        // a band shows the max over itself and every nearer band (what is visible)
        for (let k = 0; k <= b; k++) {
          const arr = bands.data!.bands
          const n = bands.data!.nAz
          const i = Math.round((((az % 360) + 360) % 360) / 360 * n) % n
          v = Math.max(v, arr[k * n + i])
        }
        ctx.lineTo(x, Y(Math.max(-6, v)))
      }
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fillStyle = shade[nb - 1 - b] ?? '#555'
      ctx.fill()
    }
    // validated horizon (site mask) as the outline; fill below when no bands
    ctx.beginPath()
    for (let x = 0; x <= w; x += 2) {
      const az = hd + (x - w / 2) / pxDeg
      const v = maskAt(site.mask, az)
      if (x === 0) ctx.moveTo(x, Y(v))
      else ctx.lineTo(x, Y(v))
    }
    if (!nb) {
      ctx.lineTo(w, h)
      ctx.lineTo(0, h)
      ctx.closePath()
      ctx.fillStyle = '#6a6e76'
      ctx.fill()
    }
    ctx.strokeStyle = '#e8ecf4'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // compass
    ctx.fillStyle = '#e8ecf4'
    ctx.font = 'bold 13px system-ui'
    for (const [lab, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]] as const) {
      const x = X(az)
      if (x > 0 && x < w) ctx.fillText(lab, x - 4, 18)
    }
    ctx.font = '11px system-ui'
    ctx.fillText(`heading ${hd.toFixed(0)}° · field of view ${fov}°`, 10, h - 10)
  }, [site, inst, analysis, bands.data, hd, fov, exag])
  if (!site) return null
  return (
    <>
      <canvas
        ref={ref}
        className="map"
        tabIndex={0}
        role="img"
        aria-label={`Street View panorama at ${site.name}, heading ${hd.toFixed(0)} degrees. Arrow keys look around.`}
        data-testid="street-view"
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, h: hd }
        }}
        onPointerMove={(e) => {
          if (drag.current) setHeading((drag.current.h - (e.clientX - drag.current.x) * (fov / (e.currentTarget.clientWidth || 800)) + 360) % 360)
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => setFov((f) => Math.min(200, Math.max(30, f * Math.exp(e.deltaY * 0.001))))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setHeading((hd - 10 + 360) % 360)
          else if (e.key === 'ArrowRight') setHeading((hd + 10) % 360)
          else return
          e.preventDefault()
        }}
      />
      <div className="float" style={{ bottom: 50, right: 10 }}>
        <label className="row">
          <span className="hint">vertical ×{exag}</span>
          <input type="range" min={1} max={10} value={exag} onChange={(e) => setExag(Number(e.target.value))} aria-label="Vertical exaggeration" />
        </label>
        <button className="btn small" onClick={() => setHeading(null)}>
          ☀ {t('cond.sun')}
        </button>
      </div>
      <div className="exag">
        Vertical ×{exag}, for visibility · silhouettes by distance (0–1, 1–3, 3–10, 10–30, 30–300 km) from LOLA 240 m · outline = {t(`terrain.${site.terrain}`)}
      </div>
    </>
  )
}
