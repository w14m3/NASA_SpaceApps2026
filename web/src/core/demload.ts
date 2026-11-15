// Loads the runtime DEM artifact (gzip of row-wise int16 deltas) in the browser (DecompressionStream) or in Node.
import { undelta, type DemGrid } from './dem'
import type { Fetcher } from './ephem'

export interface DemMeta {
  name: string
  label: string
  file: string
  nx: number
  ny: number
  x0: number
  y0: number
  px: number
  scale: number
  err: number
  source: string
}

export type Gunzip = (buf: ArrayBuffer) => Promise<ArrayBuffer>

export const browserGunzip: Gunzip = async (buf) => {
  const ds = new DecompressionStream('gzip')
  return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer()
}

export async function loadDem(fetcher: Fetcher, gunzip: Gunzip, base = 'data/dem/', name = 'dem240_80S'): Promise<DemGrid> {
  const meta = (await (await fetcher(`${base}${name}.json`)).json()) as DemMeta
  const raw = await gunzip(await (await fetcher(base + meta.file)).arrayBuffer())
  const z = undelta(new Int16Array(raw), meta.nx, meta.ny)
  return { name: meta.name, label: meta.label, z, nx: meta.nx, ny: meta.ny, x0: meta.x0, y0: meta.y0, px: meta.px, scale: meta.scale, err: meta.err }
}
