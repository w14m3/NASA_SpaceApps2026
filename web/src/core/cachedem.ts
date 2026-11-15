// Node-only loader for the raw float32 LOLA grids exported to data/cache/dem/ (pipeline/scripts/export_dem_raw.py).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DemGrid } from './dem'
import { ROOT } from './testdata'

export const CACHE_DEM = join(ROOT, 'data', 'cache', 'dem')

export function hasCachedDem(name: string) {
  return existsSync(join(CACHE_DEM, `${name}.f32`))
}

export function loadCachedDem(name: string, label: string, err: number): DemGrid {
  const meta = JSON.parse(readFileSync(join(CACHE_DEM, `${name}.json`), 'utf8'))
  const b = readFileSync(join(CACHE_DEM, `${name}.f32`))
  const z = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)
  return { name, label, z, nx: meta.nx, ny: meta.ny, x0: meta.x0, y0: meta.y0, px: meta.px, scale: 1, err }
}
