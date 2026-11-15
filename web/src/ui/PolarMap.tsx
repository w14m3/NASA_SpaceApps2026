// South-pole map (polar stereographic, the LOLA product CRS): pan/zoom, hover probe, click anywhere for a place card,
// computed layers with legends. Base relief: reference/v1 hillshade (×2 vertical exaggeration, labelled).
import { useEffect, useMemo, useRef, useState } from 'react'
import { lonLatToXY, xyToLonLat } from '../core/projection'
import { HERO_REGIONS } from '../core/regions'
import { subPoint } from '../core/topo'
import { BASE } from './data'
import { fmtLat, fmtLon, useT } from './i18n'
import { useEphemeris, useSites, useTop3 } from './hooks'
import { rpcLayers } from './workerClient'
import { setState, useStore, type SiteRef } from './store'
import { selectSite } from './LeftPanel'
import type { ResolvedSite } from './data'
import { useRoute } from './Insights'

const HILL_HALF = 304_000 // m, extent of the 1900 × 1900 v1 hillshade (320 m pixels)
const LETTERS = ['A', 'B', 'C']

export interface LayerStyle {
  key: string
  unit: string
  min: number
  max: number
  ramp: (f: number) => [number, number, number]
}

// colour-blind-safe sequential ramp (cividis-like) and a diverging hazard ramp
function cividis(f: number): [number, number, number] {
  const s = [
    [0, 32, 77],
    [64, 77, 107],
    [124, 123, 120],
    [188, 175, 111],
    [255, 233, 69],
  ]
  const x = Math.max(0, Math.min(0.9999, f)) * (s.length - 1)
  const i = Math.floor(x)
  const u = x - i
  return [0, 1, 2].map((k) => Math.round(s[i][k] * (1 - u) + s[i + 1][k] * u)) as [number, number, number]
}
function hazard(f: number): [number, number, number] {
  const s = [
    [26, 150, 65],
    [166, 217, 106],
    [255, 255, 191],
    [253, 174, 97],
    [215, 25, 28],
  ]
  const x = Math.max(0, Math.min(0.9999, f)) * (s.length - 1)
  const i = Math.floor(x)
  const u = x - i
  return [0, 1, 2].map((k) => Math.round(s[i][k] * (1 - u) + s[i + 1][k] * u)) as [number, number, number]
}

export const LAYER_STYLES: Record<string, LayerStyle> = {
  lit: { key: 'lit', unit: '%', min: 0, max: 100, ramp: cividis },
  night: { key: 'night', unit: 'h', min: 0, max: 360, ramp: (f) => cividis(1 - f) },
  earth: { key: 'earth', unit: '%', min: 0, max: 100, ramp: cividis },
  dte: { key: 'dte', unit: '%', min: 0, max: 100, ramp: cividis },
  slope: { key: 'slope', unit: '°', min: 0, max: 20, ramp: hazard },
  viability: { key: 'viability', unit: '/100', min: 0, max: 100, ramp: cividis },
  gain: { key: 'gain', unit: 'pp', min: 0, max: 40, ramp: cividis },
  zero: { key: 'zero', unit: '', min: 0, max: 1, ramp: (f) => (f > 0.5 ? [80, 160, 255] : [0, 0, 0]) },
}

export function PolarMap({ site }: { site: ResolvedSite | null }) {
  const { t, n } = useT()
  const canvas = useRef<HTMLCanvasElement>(null)
  const sites = useSites()
  const eph = useEphemeris()
  const tNow = useStore((s) => s.t)
  const layers = useStore((s) => s.layers)
  const region = useStore((s) => s.region)
  const pins = useStore((s) => s.pins)
  const top3 = useTop3()
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [view, setView] = useState(() => {
    const r = HERO_REGIONS.find((x) => x.id === region) ?? HERO_REGIONS[0]
    const [x, y] = lonLatToXY(r.lon, r.lat)
    return { cx: x, cy: y, s: 0.012 } // px per metre
  })
  const [probe, setProbe] = useState<{ lon: number; lat: number; z?: number; slope?: number } | null>(null)
  const [regionMeta, setRegionMeta] = useState<Awaited<ReturnType<typeof rpcLayers.regionMeta>> | null>(null)
  const [light, setLight] = useState<{ t: number; N: number; half: number; data: Uint8Array } | null>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null)

  useEffect(() => {
    const im = new Image()
    im.onload = () => setImg(im)
    im.src = BASE + 'data/hillshade_80S.jpg'
  }, [])
  useEffect(() => {
    rpcLayers.regionMeta({ region }).then(setRegionMeta, () => setRegionMeta(null))
    const r = HERO_REGIONS.find((x) => x.id === region)
    if (r) {
      const [x, y] = lonLatToXY(r.lon, r.lat)
      setView((v) => ({ ...v, cx: x, cy: y, s: Math.max(v.s, 0.02) }))
    }
  }, [region])
  // centre on the selected site when it changes
  useEffect(() => {
    if (!site || site.lat > -79.5) return
    const [x, y] = lonLatToXY(site.lon, site.lat)
    setView((v) => {
      const sx = size.w / 2 + (x - v.cx) * v.s
      const sy = size.h / 2 - (y - v.cy) * v.s
      if (sx > 40 && sx < size.w - 40 && sy > 40 && sy < size.h - 40) return v
      return { ...v, cx: x, cy: y }
    })
  }, [site?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  // lighting layer, recomputed when the time moves by more than 30 min
  const lightOn = layers.includes('lighting')
  useEffect(() => {
    if (!lightOn) return
    if (light && Math.abs(light.t - tNow) < 1_800_000) return
    let alive = true
    const id = setTimeout(() => {
      rpcLayers.lighting({ t: tNow, size: 360 }).then((r) => alive && setLight({ t: tNow, ...r }))
    }, 200)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [lightOn, tNow]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const routeRes = useRoute()
  const routeNodes = routeRes.data && !('error' in routeRes.data) ? routeRes.data.nodes : null
  const activeLayer = layers.find((l) => LAYER_STYLES[l])
  const layerValues = activeLayer && top3.data ? (top3.data.layers as Record<string, Float32Array>)[activeLayer] : null

  const lightCanvas = useMemo(() => {
    if (!light) return null
    const c = document.createElement('canvas')
    c.width = light.N
    c.height = light.N
    const ctx = c.getContext('2d')!
    const im = ctx.createImageData(light.N, light.N)
    for (let i = 0; i < light.N * light.N; i++) {
      const v = light.data[i]
      im.data[4 * i] = 5
      im.data[4 * i + 1] = 8
      im.data[4 * i + 2] = 30
      im.data[4 * i + 3] = Math.round((1 - v / 255) * 200)
    }
    ctx.putImageData(im, 0, 0)
    return c
  }, [light])

  // draw
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const dpr = window.devicePixelRatio || 1
    el.width = Math.round(size.w * dpr)
    el.height = Math.round(size.h * dpr)
    const ctx = el.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#05080f'
    ctx.fillRect(0, 0, size.w, size.h)
    const { cx, cy, s } = view
    const X = (x: number) => size.w / 2 + (x - cx) * s
    const Y = (y: number) => size.h / 2 - (y - cy) * s
    if (img && layers.includes('relief')) {
      ctx.imageSmoothingEnabled = s * 320 < 2
      ctx.drawImage(img, X(-HILL_HALF), Y(HILL_HALF), 2 * HILL_HALF * s, 2 * HILL_HALF * s)
    }
    if (lightOn && lightCanvas && light) {
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(lightCanvas, X(-light.half), Y(light.half), 2 * light.half * s, 2 * light.half * s)
    }
    // candidate layer
    if (layerValues && regionMeta && activeLayer) {
      const st = LAYER_STYLES[activeLayer]
      const sz = Math.max(1, regionMeta.spacing * s)
      for (let i = 0; i < regionMeta.n; i++) {
        const v = layerValues[i]
        if (!Number.isFinite(v)) continue
        if (activeLayer === 'zero' && v < 0.5) continue
        const [r, g, b] = st.ramp((v - st.min) / (st.max - st.min))
        ctx.fillStyle = `rgba(${r},${g},${b},0.78)`
        ctx.fillRect(X(regionMeta.x[i]) - sz / 2, Y(regionMeta.y[i]) - sz / 2, sz + 0.5, sz + 0.5)
      }
    }
    // graticule: latitude circles every 1° (and 0.5° when zoomed), meridians every 30°
    ctx.strokeStyle = 'rgba(160,180,210,0.25)'
    ctx.lineWidth = 1
    ctx.fillStyle = 'rgba(200,210,230,0.7)'
    ctx.font = '11px system-ui'
    const latStep = s > 0.004 ? 0.5 : 1
    for (let lat = -89.5; lat >= -80; lat -= latStep) {
      const [, r] = lonLatToXY(0, lat)
      ctx.beginPath()
      ctx.arc(X(0), Y(0), r * s, 0, 2 * Math.PI)
      ctx.stroke()
      ctx.fillText(`${-lat}°S`, X(0) + 3, Y(r) - 3)
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const [x, y] = lonLatToXY(lon, -80)
      ctx.beginPath()
      ctx.moveTo(X(0), Y(0))
      ctx.lineTo(X(x), Y(y))
      ctx.stroke()
      const [lx, ly] = lonLatToXY(lon, -88.2)
      ctx.fillText(`${lon}°`, X(lx) + 2, Y(ly))
    }
    // hero regions
    if (layers.includes('regions') || true) {
      for (const r of HERO_REGIONS) {
        const [x, y] = lonLatToXY(r.lon, r.lat)
        const half = (r.sizeKm * 500)
        ctx.strokeStyle = r.id === region ? 'rgba(90,169,255,0.95)' : 'rgba(90,169,255,0.45)'
        ctx.setLineDash(r.status === 'unverified' ? [5, 4] : [])
        ctx.strokeRect(X(x - half), Y(y + half), 2 * half * s, 2 * half * s)
        ctx.setLineDash([])
        if (s > 0.002) {
          ctx.fillStyle = 'rgba(190,215,255,0.9)'
          ctx.fillText(r.name + (r.status === 'unverified' ? ' *' : ''), X(x - half) + 3, Y(y + half) - 4)
        }
      }
    }
    // curated sites inside the map
    for (const c of sites) {
      if (c.lat > -79.5) continue
      const [x, y] = lonLatToXY(c.lon, c.lat)
      ctx.fillStyle = c.status === 'verified' ? '#e8ecf4' : '#a7b1c4'
      ctx.beginPath()
      ctx.arc(X(x), Y(y), 3.5, 0, 2 * Math.PI)
      ctx.fill()
      if (s > 0.01) ctx.fillText(c.name, X(x) + 6, Y(y) + 4)
    }
    // rays: Sun and Earth directions from the selected site
    if (site && eph && layers.includes('rays') && eph.covers(tNow)) {
      const [sx, sy] = lonLatToXY(site.lon, site.lat)
      for (const body of ['SUN', 'EARTH'] as const) {
        const sp = subPoint(eph, body, tNow)
        const [bx, by] = lonLatToXY(sp.lon, -80)
        const dx = bx - sx
        const dy = by - sy
        const L = Math.hypot(dx, dy)
        ctx.strokeStyle = body === 'SUN' ? '#f7bd4a' : '#5cb2ff'
        ctx.lineWidth = 2
        ctx.setLineDash(body === 'SUN' ? [] : [6, 4])
        ctx.beginPath()
        ctx.moveTo(X(sx), Y(sy))
        ctx.lineTo(X(sx + (dx / L) * 40_000), Y(sy + (dy / L) * 40_000))
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
    // Moon Directions route
    if (routeNodes && routeNodes.length > 1) {
      ctx.lineWidth = 3
      for (let k = 1; k < routeNodes.length; k++) {
        const [ax, ay] = lonLatToXY(routeNodes[k - 1].lon, routeNodes[k - 1].lat)
        const [bx, by] = lonLatToXY(routeNodes[k].lon, routeNodes[k].lat)
        ctx.strokeStyle = routeNodes[k].lit ? '#f7bd4a' : '#9fb3d9'
        ctx.beginPath()
        ctx.moveTo(X(ax), Y(ay))
        ctx.lineTo(X(bx), Y(by))
        ctx.stroke()
      }
      const end = routeNodes[routeNodes.length - 1]
      const [ex, ey] = lonLatToXY(end.lon, end.lat)
      ctx.fillStyle = '#9fb3d9'
      ctx.fillRect(X(ex) - 4, Y(ey) - 4, 8, 8)
    }
    // pins
    if (layers.includes('pins'))
      pins.forEach((p, k) => {
        const ll = refLonLat(p, sites)
        if (!ll) return
        const [x, y] = lonLatToXY(ll.lon, ll.lat)
        ctx.strokeStyle = '#ffd75e'
        ctx.lineWidth = 2
        ctx.strokeRect(X(x) - 6, Y(y) - 6, 12, 12)
        ctx.fillStyle = '#ffd75e'
        ctx.fillText(String(k + 1), X(x) + 8, Y(y) - 6)
      })
    // top 3
    if (top3.data && layers.includes('top3'))
      top3.data.top.forEach((o, k) => {
        const [x, y] = lonLatToXY(o.lon, o.lat)
        ctx.fillStyle = '#2f7de0'
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(X(x), Y(y) - 14, 10, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(X(x), Y(y))
        ctx.lineTo(X(x) - 5, Y(y) - 7)
        ctx.lineTo(X(x) + 5, Y(y) - 7)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 12px system-ui'
        ctx.fillText(LETTERS[k], X(x) - 4, Y(y) - 10)
        ctx.font = '11px system-ui'
      })
    // selected site
    if (site && site.lat <= -79.5) {
      const [x, y] = lonLatToXY(site.lon, site.lat)
      ctx.strokeStyle = '#43c787'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(X(x), Y(y), 9, 0, 2 * Math.PI)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(X(x) - 14, Y(y))
      ctx.lineTo(X(x) + 14, Y(y))
      ctx.moveTo(X(x), Y(y) - 14)
      ctx.lineTo(X(x), Y(y) + 14)
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    // scale bar
    const targetPx = 120
    const m = targetPx / s
    const nice = [100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000].find((v) => v >= m * 0.5) ?? 100_000
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(size.w - nice * s - 30, size.h - 34, nice * s + 20, 24)
    ctx.fillStyle = '#e8ecf4'
    ctx.fillRect(size.w - nice * s - 20, size.h - 18, nice * s, 3)
    ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, size.w - nice * s - 20, size.h - 22)
  }, [view, size, img, layers, sites, site, top3.data, region, pins, eph, tNow, layerValues, regionMeta, activeLayer, lightCanvas, light, lightOn, routeNodes])

  const toLL = (ev: { clientX: number; clientY: number }) => {
    const el = canvas.current!
    const r = el.getBoundingClientRect()
    const x = view.cx + (ev.clientX - r.left - size.w / 2) / view.s
    const y = view.cy - (ev.clientY - r.top - size.h / 2) / view.s
    const [lon, lat] = xyToLonLat(x, y)
    return { lon, lat, x, y }
  }
  const probeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const game = useStore((s) => s.game)
  const [gameResult, setGameResult] = useState<GameResult | null>(null)
  const clickAt = (lon: number, lat: number) => {
    if (lat > -80) return
    if (game && regionMeta && top3.data) {
      const [x, y] = lonLatToXY(lon, lat)
      let best = -1
      let bd = Infinity
      for (let i = 0; i < regionMeta.n; i++) {
        const d = Math.hypot(regionMeta.x[i] - x, regionMeta.y[i] - y)
        if (d < bd) {
          bd = d
          best = i
        }
      }
      if (bd > regionMeta.spacing) return setGameResult({ outside: true })
      const L = top3.data.layers
      const comb = L.combined[best]
      let rank = 1
      for (let i = 0; i < regionMeta.n; i++) if (L.combined[i] > comb) rank++
      setGameResult({ outside: false, i: best, lon: regionMeta.lon[best], lat: regionMeta.lat[best], power: L.power[best], link: L.link[best], safety: L.safety[best], combined: comb, feasible: L.feasible[best] > 0.5, rank, total: regionMeta.n, best: top3.data.top[0]?.combined ?? NaN })
      return
    }
    selectSite({ kind: 'custom', lon, lat }, sites)
  }

  return (
    <>
      <canvas
        ref={canvas}
        className="map"
        role="application"
        aria-label={`${t('view.pole')} map. Arrow keys pan, plus and minus zoom, Enter analyses the centre.`}
        tabIndex={0}
        data-testid="polar-map"
        onWheel={(e) => {
          const f = Math.exp(-e.deltaY * 0.0015)
          const p = toLL(e)
          setView((v) => {
            const s2 = Math.min(0.5, Math.max(0.0006, v.s * f))
            return { s: s2, cx: p.x - (p.x - v.cx) * (v.s / s2), cy: p.y - (p.y - v.cy) * (v.s / s2) }
          })
        }}
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (d) {
            const dx = e.clientX - d.x
            const dy = e.clientY - d.y
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
            setView((v) => ({ ...v, cx: d.cx - dx / v.s, cy: d.cy + dy / v.s }))
            return
          }
          const p = toLL(e)
          setProbe({ lon: p.lon, lat: p.lat })
          if (probeTimer.current) clearTimeout(probeTimer.current)
          probeTimer.current = setTimeout(() => {
            if (p.lat <= -79.9) rpcLayers.heightAt({ lon: p.lon, lat: p.lat }).then((h) => setProbe((q) => (q && q.lon === p.lon ? { ...q, z: h.z, slope: h.slope } : q)))
          }, 120)
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (d && !d.moved) {
            const p = toLL(e)
            clickAt(p.lon, p.lat)
          }
        }}
        onKeyDown={(e) => {
          const step = 80 / view.s
          if (e.key === 'ArrowLeft') setView((v) => ({ ...v, cx: v.cx - step }))
          else if (e.key === 'ArrowRight') setView((v) => ({ ...v, cx: v.cx + step }))
          else if (e.key === 'ArrowUp') setView((v) => ({ ...v, cy: v.cy + step }))
          else if (e.key === 'ArrowDown') setView((v) => ({ ...v, cy: v.cy - step }))
          else if (e.key === '+' || e.key === '=') setView((v) => ({ ...v, s: Math.min(0.5, v.s * 1.4) }))
          else if (e.key === '-') setView((v) => ({ ...v, s: Math.max(0.0006, v.s / 1.4) }))
          else if (e.key === 'Enter') {
            const [lon, lat] = xyToLonLat(view.cx, view.cy)
            clickAt(lon, lat)
          } else return
          e.preventDefault()
        }}
      />
      {probe && (
        <div className="probe" aria-live="off" data-testid="probe">
          {fmtLat(probe.lat)} {fmtLon(probe.lon)}
          {probe.z !== undefined && Number.isFinite(probe.z) ? ` · z ${n(probe.z, 0)} m` : ''}
          {probe.slope !== undefined && Number.isFinite(probe.slope) ? ` · slope ${n(probe.slope, 1)}° (720 m baseline)` : ''}
        </div>
      )}
      {activeLayer && (
        <div className="legend" data-testid="legend">
          <b>{t(`layer.${activeLayer}`)}</b> ({LAYER_STYLES[activeLayer].unit || '—'})
          <div className="ramp" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((f) => `rgb(${LAYER_STYLES[activeLayer].ramp(f).join(',')})`).join(',')})` }} />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>{LAYER_STYLES[activeLayer].min}</span>
            <span>{LAYER_STYLES[activeLayer].max}</span>
          </div>
          <div className="hint">{layerHint(activeLayer, top3.data?.heightUsed)}</div>
        </div>
      )}
      {game && <GameCard result={gameResult} onClose={() => (setState({ game: false }), setGameResult(null))} />}
      <div className="exag">Shaded relief ×2 vertical exaggeration, for visibility · LOLA (NASA GSFC PGDA)</div>
    </>
  )
}

function layerHint(l: string, h?: number) {
  const hh = h ?? 10
  const base = `Candidate grid 250 m, LOLA 240 m horizons, mast ${hh} m, hourly samples over the mission window.`
  if (l === 'zero') return `${base} Cells never lit in this window — a proxy for permanently shadowed regions at this resolution, not a PSR map.`
  if (l === 'slope') return 'Plane-fit slope over a 720 m disk (3 DEM pixels). Lander-scale slopes are steeper.'
  if (l === 'gain') return 'Extra sunlit time at a 10 m mast versus 2 m, percentage points.'
  return base
}

export function refLonLat(r: SiteRef, sites: { id: string; lon: number; lat: number }[]): { lon: number; lat: number } | null {
  if (r.kind === 'curated') {
    const s = sites.find((x) => x.id === r.id)
    return s ? { lon: s.lon, lat: s.lat } : null
  }
  if (r.kind === 'custom') return { lon: r.lon, lat: r.lat }
  return null
}

export function useMapHelpers() {
  return { setState }
}

type GameResult = { outside: true } | { outside: false; i: number; lon: number; lat: number; power: number; link: number; safety: number; combined: number; feasible: boolean; rank: number; total: number; best: number }

/** "Land it!" (contract §6.15 item 5): the player picks a spot; the core scores it and reveals the Top 3. */
function GameCard({ result, onClose }: { result: GameResult | null; onClose: () => void }) {
  const lang = useStore((s) => s.lang)
  const fr = lang === 'fr'
  return (
    <section className="float" style={{ top: 56, right: 10, maxWidth: 320, zIndex: 8 }} aria-live="polite" data-testid="land-it">
      <b>{fr ? 'Posez-le !' : 'Land it!'}</b>
      {!result && <p>{fr ? 'Cliquez un point dans le carré bleu de la région : où poseriez-vous l’atterrisseur ?' : 'Click a spot inside the blue region square: where would you land?'}</p>}
      {result && result.outside && <p>{fr ? 'Hors de la grille de la région : cliquez dans le carré bleu.' : 'Outside the region grid: click inside the blue square.'}</p>}
      {result && !result.outside && (
        <>
          <p data-testid="land-it-score">
            {fr ? 'Votre site' : 'Your spot'}: {fmtLat(result.lat)} {fmtLon(result.lon)} — {fr ? 'énergie' : 'power'} {Math.round(result.power)}, {fr ? 'liaison' : 'link'} {Math.round(result.link)}, {fr ? 'sécurité' : 'safety'} {Math.round(result.safety)} → <b>{Math.round(result.combined)}/100</b>
            {result.feasible ? (fr ? ' ✔ passe les contraintes' : ' ✔ passes the constraints') : fr ? ' ✖ échoue à une contrainte' : ' ✖ fails a constraint'}.
          </p>
          <p>
            {fr ? 'Rang' : 'Rank'} {result.rank} / {result.total}. {fr ? 'Meilleure option de Sightline' : 'Sightline’s best option'}: {Math.round(result.best)}/100 — {fr ? 'voir les épingles A, B, C.' : 'see pins A, B, C.'}
          </p>
          <p className="hint">{fr ? 'Pourquoi ? Au pôle, quelques centaines de mètres changent l’horizon : le Soleil et la Terre rasent le relief.' : 'Why? At the pole a few hundred metres change the horizon: the Sun and Earth skim the terrain.'}</p>
        </>
      )}
      <button className="btn small" onClick={onClose}>{fr ? 'Terminer' : 'Done'}</button>
    </section>
  )
}
