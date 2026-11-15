// Main-thread data access: ephemeris, curated sites and their precomputed masks, site resolution.
import { loadEphemeris, type Ephemeris } from '../core/ephem'
import { flatMask, maskFromV1, type Mask, type V1MaskFile } from '../core/mask'
import { sphereDip } from '../core/topo'
import { confidenceGrade } from '../core/horizon'
import { HERO_REGIONS } from '../core/regions'
import type { SiteRef } from './store'
import { rpc } from './workerClient'

export const BASE = import.meta.env.BASE_URL ?? './'
const fetcher = (p: string) => fetch(BASE + p)

export interface CuratedSite {
  id: string
  name: string
  description: string
  group: 'southPole' | 'clps' | 'apollo' | 'international'
  category: string
  lat: number
  lon: number
  status: 'verified' | 'unverified'
  source_title: string
  source_url: string
  notes: string
  landing_utc: string | null
  z0: number | null
  mask: boolean
  mask_heights: number[]
}

let ephP: Promise<Ephemeris> | null = null
export function ephemeris() {
  if (!ephP) ephP = loadEphemeris(fetcher)
  return ephP
}

let sitesP: Promise<CuratedSite[]> | null = null
export function curatedSites() {
  if (!sitesP) sitesP = fetch(BASE + 'data/sites.json').then((r) => r.json()).then((j: { sites: CuratedSite[] }) => j.sites)
  return sitesP
}

const v1Cache = new Map<string, Promise<V1MaskFile>>()
function v1File(id: string) {
  if (!v1Cache.has(id)) v1Cache.set(id, fetch(`${BASE}data/masks/${id}.json`).then((r) => r.json()))
  return v1Cache.get(id)!
}

export interface ResolvedSite {
  key: string
  ref: SiteRef
  name: string
  lon: number
  lat: number
  z0: number
  h: number
  mask: Mask
  /** 'precomputed' (v1, LOLA 80 m + 240 m), 'live' (240 m in the browser), 'sphere' (no terrain) */
  terrain: 'precomputed' | 'live' | 'sphere'
  grade: 'A' | 'B' | 'C' | '—'
  status: 'verified' | 'unverified' | 'custom' | 'candidate'
  curated?: CuratedSite
  voidFrac?: number
  note?: string
}

const DEM_LIMIT_LAT = -79.9 // the 240 m grid spans the 80–90°S cap (square ±304 km)

export async function resolveSite(ref: SiteRef, h: number, name?: string): Promise<ResolvedSite> {
  const key = JSON.stringify(ref) + '@' + h
  if (ref.kind === 'curated') {
    const c = (await curatedSites()).find((s) => s.id === ref.id)
    if (!c) throw new Error('unknown site ' + ref.id)
    if (c.mask && (h === 2 || h === 10)) {
      const f = await v1File(c.id)
      const mask = maskFromV1(f, String(h))
      // near share per §7.6 from the stored horizon distances (80 m pixels: 3 px = 240 m)
      let near = 0
      if (mask.dist) for (let i = 0; i < mask.n; i++) if (mask.dist[i] < 0.24) near++
      mask.nearShare = near / mask.n
      mask.finestPx = 80
      return { key, ref, name: c.name, lon: c.lon, lat: c.lat, z0: f.z0, h, mask, terrain: 'precomputed', grade: confidenceGrade(mask.nearShare, 80), status: c.status, curated: c }
    }
    if (c.lat <= DEM_LIMIT_LAT || c.mask) {
      const live = await rpc.liveMask({ lon: c.lon, lat: c.lat, h, nAz: 720 })
      if (live) return { key, ref, name: c.name, lon: c.lon, lat: c.lat, z0: live.z0, h, mask: live.mask, terrain: 'live', grade: confidenceGrade(live.mask.nearShare ?? 1, live.mask.finestPx ?? 240), status: c.status, curated: c, voidFrac: live.voidFrac }
    }
    return { key, ref, name: c.name, lon: c.lon, lat: c.lat, z0: c.z0 ?? 0, h, mask: flatMask(sphereDip(h)), terrain: 'sphere', grade: '—', status: c.status, curated: c, note: 'noTerrain' }
  }
  if (ref.kind === 'candidate') {
    const r = HERO_REGIONS.find((x) => x.id === ref.region)
    const c = await rpc.candidateInfo({ region: ref.region, i: ref.i })
    const live = await rpc.liveMask({ lon: c.lon, lat: c.lat, h, nAz: 720 })
    const label = name ?? `${r?.name ?? ref.region} · #${ref.i}`
    if (live) return { key, ref, name: label, lon: c.lon, lat: c.lat, z0: live.z0, h, mask: live.mask, terrain: 'live', grade: confidenceGrade(live.mask.nearShare ?? 1, live.mask.finestPx ?? 240), status: 'candidate', voidFrac: live.voidFrac }
    throw new Error('candidate outside DEM')
  }
  const live = ref.lat <= DEM_LIMIT_LAT ? await rpc.liveMask({ lon: ref.lon, lat: ref.lat, h, nAz: 720 }) : null
  const label = name ?? `${Math.abs(ref.lat).toFixed(3)}°${ref.lat < 0 ? 'S' : 'N'} ${Math.abs(ref.lon).toFixed(3)}°${ref.lon < 0 ? 'W' : 'E'}`
  if (live) return { key, ref, name: label, lon: ref.lon, lat: ref.lat, z0: live.z0, h, mask: live.mask, terrain: 'live', grade: confidenceGrade(live.mask.nearShare ?? 1, live.mask.finestPx ?? 240), status: 'custom', voidFrac: live.voidFrac }
  return { key, ref, name: label, lon: ref.lon, lat: ref.lat, z0: 0, h, mask: flatMask(sphereDip(h)), terrain: 'sphere', grade: '—', status: 'custom', note: 'noTerrain' }
}
