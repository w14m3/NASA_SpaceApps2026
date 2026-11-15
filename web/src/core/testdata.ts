// Node-side loaders for tests (reads the committed artifacts from web/public/data).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEphemeris, type Ephemeris } from './ephem'

export const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const ROOT = join(WEB, '..')
export const PUBLIC = join(WEB, 'public')

export function nodeFetch(path: string) {
  const buf = readFileSync(join(PUBLIC, path))
  return Promise.resolve({
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  })
}

let cached: Promise<Ephemeris> | null = null
export function testEphemeris(): Promise<Ephemeris> {
  if (!cached) cached = loadEphemeris(nodeFetch)
  return cached
}

export function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as T
}

import { gunzipSync } from 'node:zlib'
import { loadDem } from './demload'
import type { DemGrid } from './dem'
let demCache: Promise<DemGrid> | null = null
export function testDem(): Promise<DemGrid> {
  if (!demCache)
    demCache = loadDem(nodeFetch, async (b) => {
      const out = gunzipSync(Buffer.from(b))
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
    })
  return demCache
}

import { parseCandidates, type CandidateGrid } from './candidates'
import { HERO_REGIONS } from './regions'
export function testGrid(id = 'connecting-ridge'): CandidateGrid {
  const meta = JSON.parse(readFileSync(join(PUBLIC, 'data', 'candidates', `${id}.json`), 'utf8'))
  const b = gunzipSync(readFileSync(join(PUBLIC, 'data', 'candidates', `${id}.bin.gz`)))
  return parseCandidates(HERO_REGIONS.find((r) => r.id === id)!, meta, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
}
