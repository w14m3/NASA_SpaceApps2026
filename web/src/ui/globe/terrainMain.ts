// Main-thread terrain for the 3D map: the same runtime DEM artifacts as the worker (LOLA 80 m windows around the hero
// regions, then LOLA 240 m 80–90°S), loaded once on demand. Heights in metres above the 1737.4 km sphere.
import { bilinearXY, type DemGrid } from '../../core/dem'
import { browserGunzip, loadDem } from '../../core/demload'
import { BASE } from '../data'

let p: Promise<DemGrid[]> | null = null
export function loadTerrain(): Promise<DemGrid[]> {
  if (!p)
    p = (async () => {
      const fetcher = (path: string) => fetch(BASE + path)
      const idx = (await (await fetcher('data/dem/index.json')).json()) as { grids_finest_first: string[] }
      return Promise.all(idx.grids_finest_first.map((n) => loadDem(fetcher, browserGunzip, 'data/dem/', n)))
    })()
  return p
}

/** Height at polar-stereographic map coordinates from the finest grid with data, or NaN. */
export function heightXY(grids: DemGrid[], x: number, y: number): number {
  for (const g of grids) {
    const z = bilinearXY(g, x, y)
    if (!Number.isNaN(z)) return z
  }
  return NaN
}
