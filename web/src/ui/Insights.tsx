// "Why small changes have large impacts" (contract §6.12, §7.12, §7.13): Who blocks the Sun, the illumination compass
// and Moon Directions. All numbers come from the worker (same core as the tests).
import { DAY } from '../core/constants'
import { TRAVERSE_DEFAULTS } from '../core/traverse'
import { fmtUtc, useT } from './i18n'
import { setState, useStore } from './store'
import { useAsync, useTop3, useWindow } from './hooks'
import { useCurrentSite } from './current'
import { rpc } from './workerClient'
import type { ResolvedSite } from './data'

const routeCache = new Map<string, ReturnType<typeof rpc.route>>()

/** Destination of the route for the current site, or null. */
export function useRouteTarget(): { lon: number; lat: number; label: string } | null {
  const to = useStore((s) => s.to)
  const region = useStore((s) => s.region)
  const top = useTop3()
  const meta = useAsync(to === 'zero' ? `meta-${region}` : null, () => rpc.regionMeta({ region }))
  const { site } = useCurrentSite()
  if (!to || !site || !top.data) return null
  if (to === 'zero') {
    if (!meta.data) return null
    const z = top.data.layers.zero
    let best = -1
    let bd = Infinity
    for (let i = 0; i < z.length; i++) {
      if (z[i] < 0.5) continue
      const d = (meta.data.lat[i] - site.lat) ** 2 + ((meta.data.lon[i] - site.lon) * Math.cos((site.lat * Math.PI) / 180)) ** 2
      if (d < bd) {
        bd = d
        best = i
      }
    }
    return best < 0 ? null : { lon: meta.data.lon[best], lat: meta.data.lat[best], label: 'nearest zero-illumination cell' }
  }
  const k = 'ABC'.indexOf(to)
  const o = top.data.top[k]
  return o ? { lon: o.lon, lat: o.lat, label: `Option ${to}` } : null
}

export function useRoute() {
  const { site } = useCurrentSite()
  const target = useRouteTarget()
  const t = useStore((s) => s.t)
  const tKey = Math.round(t / (6 * 3_600_000))
  const key = site && target ? `${site.lon},${site.lat}->${target.lon},${target.lat}@${tKey}` : null
  const res = useAsync(key, () => {
    if (!routeCache.has(key!)) routeCache.set(key!, rpc.route({ from: { lon: site!.lon, lat: site!.lat }, to: target!, sMax: TRAVERSE_DEFAULTS.sMax, sRef: TRAVERSE_DEFAULTS.sRef, t }))
    return routeCache.get(key!)!
  })
  return { ...res, target }
}

export function Insights({ site }: { site: ResolvedSite }) {
  return (
    <>
      <WhoBlocks site={site} />
      <Compass site={site} />
      <Directions />
    </>
  )
}

function WhoBlocks({ site }: { site: ResolvedSite }) {
  const { n } = useT()
  const { t0, t1 } = useWindow()
  const res = useAsync(`wb|${site.key}|${t0}|${t1}`, () => rpc.whoBlocks({ site: { lon: site.lon, lat: site.lat, z0: site.z0, h: site.h }, mask: site.mask, t0, t1 }))
  return (
    <div className="section" data-testid="who-blocks">
      <h2>Who blocks the Sun?</h2>
      {!res.data ? (
        <p className="hint">Computing…</p>
      ) : res.data.length === 0 ? (
        <p>No night of an hour or more in this window at {site.h} m.</p>
      ) : (
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {res.data.slice(0, 6).map((b) => (
            <li key={b.start}>
              Night of <b>{n(b.hours, 0)} h</b> from {b.openStart ? 'the window start' : fmtUtc(b.start)}
              {b.openEnd ? ' (beyond the window end)' : ''},{' '}
              {b.cause === 'limb' ? (
                <>caused by the lunar limb: the Sun is below the smooth-sphere horizon (azimuth {n(b.az, 0)}°).</>
              ) : (
                <>
                  caused by terrain {b.distKm !== null ? `${n(b.distKm, 1)} km away` : ''} at azimuth {n(b.az, 0)}° (horizon {n(b.horizonEl, 2)}°, Sun {n(b.sunEl, 2)}°).
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Horizon distance per azimuth from the stored mask ({site.terrain === 'precomputed' ? 'LOLA 80 m + 240 m' : 'LOLA 240 m'}). Turn on the "Sun & Earth rays" layer to see the direction on the map.</p>
    </div>
  )
}

function Compass({ site }: { site: ResolvedSite }) {
  const { n } = useT()
  const landing = useStore((s) => s.landing)
  const dur = useStore((s) => s.durDays)
  const r = 500
  const res = useAsync(site.terrain !== 'sphere' ? `cmp|${site.lon},${site.lat},${site.h}|${landing}|${dur}` : null, () => rpc.compass({ lon: site.lon, lat: site.lat, h: site.h, t0: landing, t1: landing + dur * DAY, r }))
  if (site.terrain === 'sphere') return null
  const d = res.data
  const best = d ? d.neighbours.reduce((a, b) => (b.lit > a.lit ? b : a), d.neighbours[0]) : null
  return (
    <div className="section" data-testid="compass">
      <h2>Illumination compass</h2>
      {!d ? (
        <p className="hint">Computing 9 horizons…</p>
      ) : (
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          <svg viewBox="-60 -60 120 120" width="130" height="130" role="img" aria-label={`Sunlit time at 8 neighbours ${r} m away versus here (${Math.round(d.centre * 100)} %)`}>
            <circle r="56" fill="#0a1220" stroke="#24324d" />
            <text y="-46" textAnchor="middle" fill="#a7b1c4" fontSize="9">N</text>
            {d.neighbours.map((nb) => {
              const gain = (nb.lit - d.centre) * 100
              const a = (nb.az * Math.PI) / 180
              const L = 10 + Math.min(30, Math.abs(gain) * 1.5)
              const col = gain > 0.5 ? '#43c787' : gain < -0.5 ? '#ff6b6b' : '#7b879d'
              return (
                <g key={nb.az}>
                  <line x1={0} y1={0} x2={L * Math.sin(a)} y2={-L * Math.cos(a)} stroke={col} strokeWidth={gain > 0 ? 3 : 1.5} />
                  <text x={48 * Math.sin(a)} y={-48 * Math.cos(a) + 3} textAnchor="middle" fill={col} fontSize="8">
                    {gain >= 0 ? '+' : ''}
                    {gain.toFixed(0)}
                  </text>
                </g>
              )
            })}
            <circle r="4" fill="#e8ecf4" />
          </svg>
          <div>
            <p style={{ margin: 0 }}>
              Here: sunlit <b>{n(d.centre * 100, 0)} %</b> of the window. Arrows: percentage-point change {r} m away (green = more sun).
            </p>
            {best && best.lit > d.centre && (
              <button className="btn small" onClick={() => setState({ sel: { kind: 'custom', lon: best.lon, lat: best.lat } })} data-testid="snap-best">
                Snap to best within {r} m (+{n((best.lit - d.centre) * 100, 0)} pp, {best.az}°)
              </button>
            )}
          </div>
        </div>
      )}
      <p className="hint">LOLA 240 m horizons at mast {site.h} m, hourly samples. Neighbours closer than one DEM pixel (240 m) are not resolved.</p>
    </div>
  )
}

function Directions() {
  const { n } = useT()
  const to = useStore((s) => s.to)
  const { data, target, loading } = useRoute()
  const r = data && !('error' in data) ? data : null
  return (
    <div className="section" data-testid="directions">
      <h2>Moon Directions</h2>
      <label className="row">
        Route to
        <select className="input" style={{ width: 'auto' }} value={to} onChange={(e) => setState({ to: e.target.value, layers: [...new Set([...useStoreLayers(), 'top3'])] })} data-testid="route-to">
          <option value="">—</option>
          <option value="zero">nearest zero-illumination cell (ice science)</option>
          <option value="A">Option A</option>
          <option value="B">Option B</option>
          <option value="C">Option C</option>
        </select>
      </label>
      {to && !target && <p className="hint">Waiting for the Top 3 / region data…</p>}
      {to && target && loading && <p className="hint">Searching the least-effort route…</p>}
      {data && 'error' in data && <p className="err">{String(data.error)}</p>}
      {r && (
        <p data-testid="route-summary">
          {target?.label}: <b>{n(r.lengthM / 1000, 2)} km</b>, max slope {n(r.maxSlope, 1)}°, mean {n(r.meanSlope, 1)}°, sunlit {Math.round(r.sunlitFrac * 100)} % of the route now, ≈ {n(r.lengthM / 1000 / TRAVERSE_DEFAULTS.walkKmH, 1)} h on foot at {TRAVERSE_DEFAULTS.walkKmH} km/h (assumption).
          <ElevationProfile z={r.nodes.map((x) => x.z)} lit={r.nodes.map((x) => x.lit)} />
        </p>
      )}
      <p className="hint">A* on the LOLA 240 m slope grid (screening resolution); cost = length × (1 + (slope/{TRAVERSE_DEFAULTS.sRef}°)²); cells above {TRAVERSE_DEFAULTS.sMax}° forbidden (assumptions, editable in code). Drawn on the South pole map.</p>
    </div>
  )
}

import { getState } from './store'
function useStoreLayers() {
  return getState().layers
}

function ElevationProfile({ z, lit }: { z: number[]; lit: boolean[] }) {
  const w = 300
  const h = 50
  const lo = Math.min(...z)
  const hi = Math.max(...z, lo + 1)
  const X = (i: number) => (i / Math.max(1, z.length - 1)) * w
  const Y = (v: number) => h - 4 - ((v - lo) / (hi - lo)) * (h - 8)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`Elevation profile from ${Math.round(z[0])} m to ${Math.round(z[z.length - 1])} m; yellow = sunlit now`}>
      <rect width={w} height={h} fill="#0a1220" />
      {z.map((v, i) => (i ? <line key={i} x1={X(i - 1)} y1={Y(z[i - 1])} x2={X(i)} y2={Y(v)} stroke={lit[i] ? '#f7bd4a' : '#5a6a85'} strokeWidth={2} /> : null))}
      <text x={2} y={10} fill="#a7b1c4" fontSize="9">{Math.round(hi)} m</text>
      <text x={2} y={h - 2} fill="#a7b1c4" fontSize="9">{Math.round(lo)} m</text>
    </svg>
  )
}
