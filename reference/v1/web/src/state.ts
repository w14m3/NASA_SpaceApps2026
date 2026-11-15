// App state, data loading and URL-hash sync (everything shareable lives in the URL).
import { useEffect, useMemo, useReducer } from 'react'
import { Ephemeris, loadEphemeris } from './core/ephem'
import { sphereDip } from './core/geom'
import { flatMask, type Mask } from './core/visibility'
import { computeMask, type DemGrid } from './core/horizon'

export interface SiteInfo {
  id: string
  name: string
  category: 'apollo' | 'clps' | 'international' | 'poi' | 'custom'
  lat: number
  lon: number
  status?: string
  source_title?: string
  source_url?: string
  notes?: string
  landing_utc?: string | null
  /** terrain height from the DEM (m); null when outside DEM coverage */
  z0: number | null
  /** heights (m) for which a precomputed 80 m mask exists */
  mask_heights?: number[]
}

export interface Manifest {
  built_utc: string
  git_commit: string
  kernels: string[]
  dem_products: { file: string; sha256: string; url: string }[]
  ephemeris_span: [string, string]
  mask: { n_az: number; s_max_km: number; heights_m: number[] }
  validation: Record<string, unknown>
}

export interface Data {
  eph: Ephemeris
  sites: SiteInfo[]
  manifest: Manifest | null
  base: string
}

export interface State {
  t: number
  playing: boolean
  /** simulated seconds per real second */
  speed: number
  pins: string[] // site ids, max 4
  active: string | null
  custom: SiteInfo[]
  h: number // instrument / mast height, m
  windowDays: number
  view: 'globe' | 'polar'
  expert: boolean
  panel: 'flat' | 'track' | 'vertS' | 'vertN' | 'vertE' | 'vertW'
  page: 'app' | 'trust'
}

export type Action =
  | { type: 'set'; patch: Partial<State> }
  | { type: 'tick'; dtMs: number }
  | { type: 'select'; id: string }
  | { type: 'unpin'; id: string }
  | { type: 'addCustom'; site: SiteInfo }

const MAX_PINS = 4

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'set':
      return { ...s, ...a.patch }
    case 'tick':
      return { ...s, t: s.t + a.dtMs * s.speed }
    case 'select': {
      const pins = s.pins.includes(a.id) ? s.pins : [...s.pins, a.id].slice(-MAX_PINS)
      return { ...s, pins, active: a.id }
    }
    case 'unpin': {
      const pins = s.pins.filter((p) => p !== a.id)
      return { ...s, pins, active: s.active === a.id ? (pins[pins.length - 1] ?? null) : s.active }
    }
    case 'addCustom': {
      const custom = [...s.custom.filter((c) => c.id !== a.site.id), a.site]
      const pins = [...s.pins.filter((p) => p !== a.site.id), a.site.id].slice(-MAX_PINS)
      return { ...s, custom, pins, active: a.site.id }
    }
  }
}

export function customId(lat: number, lon: number): string {
  return `c_${lat.toFixed(4)}_${lon.toFixed(4)}`
}

export function customSite(lat: number, lon: number): SiteInfo {
  return {
    id: customId(lat, lon),
    name: `Custom ${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(3)}°${lon < 0 ? 'W' : 'E'}`,
    category: 'custom',
    lat,
    lon,
    z0: null,
  }
}

function parseHash(): Partial<State> {
  const p = new URLSearchParams(window.location.hash.slice(1))
  const out: Partial<State> = {}
  const t = p.get('t')
  if (t && !Number.isNaN(Date.parse(t))) out.t = Date.parse(t)
  const pins = p.get('pins')
  if (pins) out.pins = pins.split(',').filter(Boolean).slice(0, MAX_PINS)
  if (out.pins) {
    out.custom = out.pins
      .filter((id) => id.startsWith('c_'))
      .map((id) => {
        const [, la, lo] = id.split('_')
        return customSite(Number(la), Number(lo))
      })
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
  }
  const a = p.get('a')
  if (a) out.active = a
  const h = Number(p.get('h'))
  if (p.get('h') && h >= 0 && h <= 30) out.h = h
  const w = Number(p.get('w'))
  if (p.get('w') && w >= 1 && w <= 400) out.windowDays = w
  const v = p.get('v')
  if (v === 'globe' || v === 'polar') out.view = v
  if (p.get('x') === '1') out.expert = true
  const pn = p.get('pn')
  if (pn && ['flat', 'track', 'vertS', 'vertN', 'vertE', 'vertW'].includes(pn)) out.panel = pn as State['panel']
  if (p.get('pg') === 'trust') out.page = 'trust'
  return out
}

export function toHash(s: State): string {
  const p = new URLSearchParams()
  p.set('t', new Date(Math.round(s.t / 1000) * 1000).toISOString().replace('.000Z', 'Z'))
  if (s.pins.length) p.set('pins', s.pins.join(','))
  if (s.active) p.set('a', s.active)
  p.set('h', String(s.h))
  p.set('w', String(s.windowDays))
  p.set('v', s.view)
  if (s.expert) p.set('x', '1')
  p.set('pn', s.panel)
  if (s.page === 'trust') p.set('pg', 'trust')
  return '#' + p.toString()
}

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, undefined, (): State => {
    const base: State = {
      t: Date.now(),
      playing: false,
      speed: 3600 * 6,
      pins: [],
      active: null,
      custom: [],
      h: 2,
      windowDays: 30,
      view: 'globe',
      expert: false,
      panel: 'track',
      page: 'app',
    }
    const fromUrl = parseHash()
    if (fromUrl.pins && !fromUrl.active) fromUrl.active = fromUrl.pins[0]
    return { ...base, ...fromUrl }
  })
  // write URL (throttled while playing)
  useEffect(() => {
    if (state.playing) return
    const id = setTimeout(() => history.replaceState(null, '', toHash(state)), 150)
    return () => clearTimeout(id)
  }, [state])
  return [state, dispatch] as const
}

export async function loadData(): Promise<Data> {
  const base = import.meta.env.BASE_URL
  const [eph, sites, manifest] = await Promise.all([
    loadEphemeris(base),
    fetch(`${base}data/sites.json`).then((r) => r.json() as Promise<SiteInfo[]>),
    fetch(`${base}data/manifest.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
      .catch(() => null),
  ])
  return { eph, sites, manifest, base }
}

// ---- horizon masks -------------------------------------------------------

export interface MaskEntry {
  mask: Mask
  z0: number
  /** human-readable provenance shown in the UI */
  label: string
  note?: string
}

const maskCache = new Map<string, Promise<MaskEntry>>()
let demPromise: Promise<DemGrid | null> | null = null

function loadDem(base: string): Promise<DemGrid | null> {
  if (!demPromise) {
    demPromise = (async () => {
      try {
        const meta = await fetch(`${base}data/dem240.json`).then((r) => r.json())
        const buf = await fetch(`${base}data/dem240.bin`).then((r) => r.arrayBuffer())
        return { ...meta, z: new Int16Array(buf) } as DemGrid
      } catch {
        return null
      }
    })()
  }
  return demPromise
}

function b64ToFloat32(b64: string, scale: number): Float32Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const i16 = new Int16Array(bytes.buffer)
  const out = new Float32Array(i16.length)
  for (let i = 0; i < i16.length; i++) out[i] = i16[i] * scale
  return out
}

async function buildMask(base: string, site: SiteInfo, h: number): Promise<MaskEntry> {
  // 1) precomputed 80 m mask at the nearest available height (exact match only)
  if (site.mask_heights?.includes(h)) {
    const j = await fetch(`${base}data/masks/${site.id}.json`).then((r) => r.json())
    const m = j.heights[String(h)]
    const s = j.scale_deg as number
    return {
      mask: {
        n: j.n_az,
        mid: b64ToFloat32(m.mid, s),
        lo: b64ToFloat32(m.lo, s),
        hi: b64ToFloat32(m.hi, s),
        dist: b64ToFloat32(m.dist, 0.01),
        kind: String(j.label ?? '').includes('240 m') ? 'dem240' : 'dem80',
      },
      z0: j.z0,
      label: j.label ?? 'LOLA DEM horizon (precomputed)',
      note: j.note,
    }
  }
  // 2) south-polar DEM in the browser (240 m)
  if (site.lat <= -80.5) {
    const dem = await loadDem(base)
    if (dem) {
      const r = computeMask(dem, site.lon, site.lat, h)
      if (r) {
        return {
          mask: r.mask,
          z0: r.z0,
          label: 'LOLA 240 m DEM horizon (computed in your browser)',
          note:
            r.maxVoid > 0.3
              ? 'Part of the horizon lies beyond the DEM edge (80°S); far terrain to the north is not included.'
              : undefined,
        }
      }
    }
  }
  // 3) no terrain data: smooth sphere
  return {
    mask: flatMask(sphereDip(h)),
    z0: site.z0 ?? 0,
    label: 'Smooth-sphere horizon — no terrain data for this site',
    note: 'Terrain is NOT modelled here (the DEM covers 80°S–90°S). Rise/set times ignore local hills and crater rims.',
  }
}

export function getMask(base: string, site: SiteInfo, h: number): Promise<MaskEntry> {
  const key = `${site.id}|${h}`
  let p = maskCache.get(key)
  if (!p) {
    p = buildMask(base, site, h)
    maskCache.set(key, p)
  }
  return p
}

export function useSites(data: Data | null, state: State) {
  return useMemo(() => {
    const all = new Map<string, SiteInfo>()
    data?.sites.forEach((s) => all.set(s.id, s))
    state.custom.forEach((s) => all.set(s.id, s))
    return all
  }, [data, state.custom])
}
