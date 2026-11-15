// Application state with URL-hash synchronisation (contract §6.14: the same URL gives the same result).
import { useSyncExternalStore } from 'react'
import { DAY } from '../core/constants'
import type { LayoutKind } from '../core/energy'

export type Mode = 'explore' | 'plan' | 'learn'
export type View = 'pole' | 'globe' | 'site3d' | 'street'
export type Page = 'main' | 'trust' | 'brief' | 'compare'
export type Lang = 'en' | 'fr'

export type SiteRef =
  | { kind: 'curated'; id: string }
  | { kind: 'custom'; lon: number; lat: number }
  | { kind: 'candidate'; region: string; i: number }

export interface AppState {
  mode: Mode
  view: View
  page: Page
  lang: Lang
  t: number
  sel: SiteRef
  h: number
  pins: SiteRef[]
  layers: string[]
  landing: number
  durDays: number
  lander: 'small' | 'medium' | 'large'
  persona: string
  region: string
  layout: LayoutKind
  panelAz: number
  loadW: number
  chosen: number
  playing: boolean
  speed: number
  /** user-defined ground station: "lat,lon,heightM,minEl" (empty = none) */
  station: string
  minEl: number
  /** constraints relaxed by the user after "nothing passes" (comma-separated keys) */
  relax: string
  /** guided tour step (Learn mode), -1 = closed */
  tour: number
  wizard: boolean
  /** compare scenarios: "siteRef@YYYY-MM-DD" separated by ';' (empty = pins + current site) */
  scen: string
}

/** Default scenario (contract §6.2): south-pole hero region, generic medium lander, mast 10 m. The landing date is
 *  fixed so that the same URL always gives the same result (rule R14). It is the "next feasible window": the landing
 *  date in the first lunation after 2026-12-01 with the most candidates passing every default constraint
 *  (web/scripts/find-window.ts; scan in data/validation/default_window_scan.txt; DECISIONS D9). */
export const DEFAULT_LANDING = Date.UTC(2026, 11, 11)
export const DEFAULTS: AppState = {
  mode: 'explore',
  view: 'pole',
  page: 'main',
  lang: 'en',
  t: DEFAULT_LANDING + 1 * DAY,
  sel: { kind: 'curated', id: 'poi_site001_connecting_ridge' },
  h: 10,
  pins: [],
  layers: ['relief', 'top3', 'pins'],
  landing: DEFAULT_LANDING,
  durDays: 14,
  lander: 'medium',
  persona: 'balanced',
  region: 'connecting-ridge',
  layout: 'vertical',
  panelAz: -1, // -1 = optimise
  loadW: 100,
  chosen: 0,
  playing: false,
  speed: 3600,
  station: '',
  minEl: 10,
  relax: '',
  tour: -1,
  wizard: false,
  scen: '',
}

export function refToString(r: SiteRef): string {
  if (r.kind === 'curated') return `c:${r.id}`
  if (r.kind === 'custom') return `x:${r.lat.toFixed(5)},${r.lon.toFixed(5)}`
  return `g:${r.region}:${r.i}`
}

export function refFromString(s: string): SiteRef | null {
  if (s.startsWith('c:')) return { kind: 'curated', id: s.slice(2) }
  if (s.startsWith('x:')) {
    const [lat, lon] = s.slice(2).split(',').map(Number)
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90) return { kind: 'custom', lat, lon: ((lon + 540) % 360) - 180 }
    return null
  }
  if (s.startsWith('g:')) {
    const [, region, i] = s.split(':')
    return { kind: 'candidate', region, i: Number(i) }
  }
  return null
}

export function sameRef(a: SiteRef, b: SiteRef) {
  return refToString(a) === refToString(b)
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16) + 'Z'
const parseIso = (s: string | null) => {
  if (!s) return NaN
  const v = Date.parse(s.endsWith('Z') ? s : s + 'Z')
  return Number.isFinite(v) ? v : NaN
}

export function toHash(s: AppState): string {
  const p = new URLSearchParams()
  const d = DEFAULTS
  if (s.page !== 'main') p.set('page', s.page)
  if (s.mode !== d.mode) p.set('mode', s.mode)
  if (s.view !== d.view) p.set('view', s.view)
  if (s.lang !== d.lang) p.set('lang', s.lang)
  p.set('t', iso(s.t))
  p.set('site', refToString(s.sel))
  if (s.h !== d.h) p.set('h', String(s.h))
  if (s.pins.length) p.set('pins', s.pins.map(refToString).join(';'))
  if (s.layers.join(',') !== d.layers.join(',')) p.set('layers', s.layers.join(','))
  if (s.landing !== d.landing) p.set('land', iso(s.landing))
  if (s.durDays !== d.durDays) p.set('dur', String(s.durDays))
  if (s.lander !== d.lander) p.set('lander', s.lander)
  if (s.persona !== d.persona) p.set('persona', s.persona)
  if (s.region !== d.region) p.set('region', s.region)
  if (s.layout !== d.layout) p.set('layout', s.layout)
  if (s.panelAz !== d.panelAz) p.set('paz', String(s.panelAz))
  if (s.loadW !== d.loadW) p.set('load', String(s.loadW))
  if (s.chosen !== d.chosen) p.set('chosen', String(s.chosen))
  if (s.station) p.set('gs', s.station)
  if (s.minEl !== d.minEl) p.set('minel', String(s.minEl))
  if (s.relax) p.set('relax', s.relax)
  if (s.scen) p.set('scen', s.scen)
  return '#' + p.toString()
}

export function fromHash(hash: string): AppState {
  const p = new URLSearchParams(hash.replace(/^#\/?/, ''))
  const d = DEFAULTS
  const num = (k: string, def: number, lo = -Infinity, hi = Infinity) => {
    const v = Number(p.get(k))
    return p.has(k) && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def
  }
  const pick = <T extends string>(k: string, allowed: readonly T[], def: T): T => {
    const v = p.get(k) as T
    return allowed.includes(v) ? v : def
  }
  const t = parseIso(p.get('t'))
  const land = parseIso(p.get('land'))
  return {
    page: pick('page', ['main', 'trust', 'brief', 'compare'] as const, 'main'),
    mode: pick('mode', ['explore', 'plan', 'learn'] as const, d.mode),
    view: pick('view', ['pole', 'globe', 'site3d', 'street'] as const, d.view),
    lang: pick('lang', ['en', 'fr'] as const, d.lang),
    t: Number.isFinite(t) ? t : d.t,
    sel: refFromString(p.get('site') ?? '') ?? d.sel,
    h: num('h', d.h, 0, 30),
    pins: (p.get('pins') ?? '')
      .split(';')
      .map(refFromString)
      .filter((x): x is SiteRef => !!x)
      .slice(0, 4),
    layers: p.has('layers') ? (p.get('layers') ?? '').split(',').filter(Boolean) : d.layers,
    landing: Number.isFinite(land) ? land : d.landing,
    durDays: num('dur', d.durDays, 1, 365),
    lander: pick('lander', ['small', 'medium', 'large'] as const, d.lander),
    persona: pick('persona', ['balanced', 'crewSafety', 'longPower', 'scienceIce'] as const, 'balanced'),
    region: p.get('region') ?? d.region,
    layout: pick('layout', ['flat', 'vertical', 'box4', 'track', 'tilted', 'twoAxis'] as const, d.layout),
    panelAz: num('paz', d.panelAz, -1, 359),
    loadW: num('load', d.loadW, 0, 10000),
    chosen: num('chosen', d.chosen, 0, 2),
    playing: false,
    speed: d.speed,
    station: p.get('gs') ?? '',
    minEl: num('minel', d.minEl, 0, 45),
    relax: p.get('relax') ?? '',
    tour: -1,
    wizard: false,
    scen: p.get('scen') ?? '',
  }
}

type Listener = () => void
let state: AppState = typeof location !== 'undefined' ? fromHash(location.hash) : DEFAULTS
const listeners = new Set<Listener>()
let hashTimer: ReturnType<typeof setTimeout> | null = null

export function getState() {
  return state
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...p }
  for (const l of listeners) l()
  if (typeof location !== 'undefined') {
    if (hashTimer) clearTimeout(hashTimer)
    hashTimer = setTimeout(() => {
      const h = toHash(state)
      if (h !== location.hash) history.replaceState(null, '', h)
    }, state.playing ? 1000 : 150)
  }
}

if (typeof window !== 'undefined')
  window.addEventListener('hashchange', () => {
    const next = fromHash(location.hash)
    if (toHash(next) !== toHash(state)) {
      state = { ...next, playing: state.playing, speed: state.speed, tour: state.tour, wizard: state.wizard }
      for (const l of listeners) l()
    }
  })

export function useStore<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => sel(state),
    () => sel(state),
  )
}

export function shareUrl(): string {
  return location.href.split('#')[0] + toHash(state)
}
