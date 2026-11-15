// Sky plot: azimuth × elevation with the terrain silhouette and its ±1σ band, the Sun and Earth discs at true angular
// size, their trails over the window and the Earth libration loop. Vertical exaggeration is labelled on screen.
import { useEffect, useRef } from 'react'
import type { SiteAnalysis, Instant } from '../core/analysis'
import { maskAt, type Mask } from '../core/mask'
import { useT } from './i18n'

export interface SkyLayer {
  mask: Mask
  color: string
  label: string
}

export function SkyPlot({ layers, analysis, inst, height = 210, testId = 'sky-plot' }: { layers: SkyLayer[]; analysis: SiteAnalysis | null; inst: Instant | null; height?: number; testId?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { t } = useT()
  const exag = useRef(1)
  useEffect(() => {
    const c = ref.current
    if (!c || !layers.length) return
    const w = c.clientWidth
    const h = height
    const dpr = window.devicePixelRatio || 1
    c.width = w * dpr
    c.height = h * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#050912'
    ctx.fillRect(0, 0, w, h)
    // elevation range from masks and bodies
    let lo = Infinity
    let hi = -Infinity
    for (const L of layers)
      for (let i = 0; i < L.mask.n; i++) {
        lo = Math.min(lo, L.mask.lo[i])
        hi = Math.max(hi, L.mask.hi[i])
      }
    if (analysis)
      for (const s of analysis.hourly) {
        hi = Math.max(hi, s.sunEl + 0.3, s.earthEl + 1)
        lo = Math.min(lo, s.sunEl - 0.3, s.earthEl - 1)
      }
    if (inst) {
      hi = Math.max(hi, inst.sun.el + 0.4, inst.earth.el + 1.2)
      lo = Math.min(lo, inst.sun.el - 0.4, inst.earth.el - 1.2)
    }
    lo = Math.floor(Math.max(-10, lo) - 0.5)
    hi = Math.ceil(Math.min(40, hi) + 0.5)
    const padL = 30
    const padB = 18
    const pw = w - padL - 6
    const ph = h - padB - 6
    const X = (az: number) => padL + ((((az % 360) + 360) % 360) / 360) * pw
    const Y = (el: number) => 6 + ((hi - el) / (hi - lo)) * ph
    const pxPerDegX = pw / 360
    const pxPerDegY = ph / (hi - lo)
    exag.current = pxPerDegY / pxPerDegX
    // grid
    ctx.strokeStyle = 'rgba(160,180,210,0.15)'
    ctx.fillStyle = '#a7b1c4'
    ctx.font = '10px system-ui'
    for (let el = lo; el <= hi; el += hi - lo > 12 ? 5 : hi - lo > 5 ? 2 : 1) {
      ctx.beginPath()
      ctx.moveTo(padL, Y(el))
      ctx.lineTo(w - 6, Y(el))
      ctx.stroke()
      ctx.fillText(`${el}°`, 2, Y(el) + 3)
    }
    ;['N', 'E', 'S', 'W', 'N'].forEach((d, k) => {
      ctx.fillText(d, X(k * 90) - 3 + (k === 4 ? pw - 0.01 : 0) * 0, h - 4)
    })
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.moveTo(padL, Y(0))
    ctx.lineTo(w - 6, Y(0))
    ctx.stroke()
    // terrain: band then silhouette
    layers.forEach((L, li) => {
      const m = L.mask
      const n = Math.min(720, m.n)
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const az = (i / n) * 360
        const x = padL + (i / n) * pw
        const v = maskAt(m, az, 'hi')
        if (i === 0) ctx.moveTo(x, Y(v))
        else ctx.lineTo(x, Y(v))
      }
      for (let i = n; i >= 0; i--) ctx.lineTo(padL + (i / n) * pw, Y(maskAt(m, (i / n) * 360, 'lo')))
      ctx.closePath()
      ctx.fillStyle = li === 0 ? 'rgba(150,160,180,0.35)' : 'rgba(0,0,0,0)'
      ctx.fill()
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const x = padL + (i / n) * pw
        const v = maskAt(m, (i / n) * 360)
        if (i === 0) ctx.moveTo(x, Y(v))
        else ctx.lineTo(x, Y(v))
      }
      if (li === 0) {
        ctx.lineTo(padL + pw, h - padB)
        ctx.lineTo(padL, h - padB)
        ctx.closePath()
        ctx.fillStyle = '#3b3f48'
        ctx.fill()
      }
      ctx.strokeStyle = L.color
      ctx.lineWidth = 1.5
      ctx.stroke()
    })
    // trails
    if (analysis) {
      const trail = (key: 'sun' | 'earth', color: string) => {
        ctx.fillStyle = color
        for (const s of analysis.hourly) {
          const az = key === 'sun' ? s.sunAz : s.earthAz
          const el = key === 'sun' ? s.sunEl : s.earthEl
          ctx.fillRect(X(az) - 0.6, Y(el) - 0.6, 1.2, 1.2)
        }
      }
      trail('sun', 'rgba(247,189,74,0.55)')
      trail('earth', 'rgba(92,178,255,0.75)')
    }
    // bodies at true angular size (ellipses: same angular radius on both axes)
    if (inst) {
      const disc = (az: number, el: number, rad: number, fill: string) => {
        ctx.beginPath()
        ctx.ellipse(X(az), Y(el), Math.max(1.5, rad * pxPerDegX), Math.max(1.5, rad * pxPerDegY), 0, 0, 2 * Math.PI)
        ctx.fillStyle = fill
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      disc(inst.sun.az, inst.sun.el, inst.sun.rad, '#f7bd4a')
      disc(inst.earth.az, inst.earth.el, inst.earth.rad, '#5cb2ff')
    }
  }, [layers, analysis, inst, height])
  return (
    <figure style={{ margin: 0 }}>
      <canvas
        ref={ref}
        className="sky"
        style={{ height }}
        role="img"
        aria-label={inst ? `Sky plot. Sun azimuth ${inst.sun.az.toFixed(1)}°, elevation ${inst.sun.el.toFixed(2)}°, terrain horizon ${inst.sunMaskEl.toFixed(2)}°. Earth azimuth ${inst.earth.az.toFixed(1)}°, elevation ${inst.earth.el.toFixed(2)}°.` : 'Sky plot'}
        data-testid={testId}
      />
      <figcaption className="hint">
        {t('sky.legend')} · <b>{t('sky.exag', { k: Math.round(exag.current) })}</b>
      </figcaption>
    </figure>
  )
}
