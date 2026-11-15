// Digital elevation model grids in south polar stereographic metres (north-up rows). Heights relative to the
// 1737.4 km sphere. Bilinear sampling at pixel centres; NaN outside the grid or next to a void.
import { lonLatToXY } from './projection'

export const NODATA_I16 = -32768

export interface DemGrid {
  name: string
  /** heights in units of `scale` metres, row-major north-up */
  z: Int16Array | Float32Array
  nx: number
  ny: number
  x0: number // m, outer edge of column 0
  y0: number // m, outer edge of row 0 (top)
  px: number // m
  scale: number // m per count
  /** nominal 1-sigma height error, m (the UI shows it as an assumption) */
  err: number
  /** text shown in the UI next to every number derived from this grid */
  label: string
}

export function raw(g: DemGrid, c: number, r: number): number {
  const v = g.z[r * g.nx + c]
  return v === NODATA_I16 || Number.isNaN(v) ? NaN : v * g.scale
}

export function bilinearXY(g: DemGrid, x: number, y: number): number {
  const c = (x - g.x0) / g.px - 0.5
  const r = (g.y0 - y) / g.px - 0.5
  const c0 = Math.floor(c)
  const r0 = Math.floor(r)
  if (c0 < 0 || r0 < 0 || c0 + 1 >= g.nx || r0 + 1 >= g.ny) return NaN
  const i = r0 * g.nx + c0
  const z = g.z
  const a = z[i]
  const b = z[i + 1]
  const d = z[i + g.nx]
  const e = z[i + g.nx + 1]
  if (a === NODATA_I16 || b === NODATA_I16 || d === NODATA_I16 || e === NODATA_I16) return NaN
  const fc = c - c0
  const fr = r - r0
  return ((a * (1 - fc) + b * fc) * (1 - fr) + (d * (1 - fc) + e * fc) * fr) * g.scale
}

export function heightAt(g: DemGrid, lon: number, lat: number): number {
  const [x, y] = lonLatToXY(lon, lat)
  return bilinearXY(g, x, y)
}

/** Pixel (column, row) as fractional indices of the pixel centre grid. */
export function xyToPixel(g: DemGrid, x: number, y: number): [number, number] {
  return [(x - g.x0) / g.px - 0.5, (g.y0 - y) / g.px - 0.5]
}

export function pixelToXY(g: DemGrid, c: number, r: number): [number, number] {
  return [g.x0 + (c + 0.5) * g.px, g.y0 - (r + 0.5) * g.px]
}

export function covers(g: DemGrid, lon: number, lat: number): boolean {
  return !Number.isNaN(heightAt(g, lon, lat))
}

/** First grid (finest first) with valid data at (x, y). */
export function cascadeXY(grids: DemGrid[], x: number, y: number): { z: number; g: DemGrid | null } {
  for (const g of grids) {
    const z = bilinearXY(g, x, y)
    if (!Number.isNaN(z)) return { z, g }
  }
  return { z: NaN, g: null }
}

/** Decode the delta-encoded int16 DEM artifact (rows of first value + int16 differences). */
export function undelta(src: Int16Array, nx: number, ny: number): Int16Array {
  const out = new Int16Array(nx * ny)
  for (let r = 0; r < ny; r++) {
    let acc = 0
    for (let c = 0; c < nx; c++) {
      const i = r * nx + c
      out[i] = (acc + src[i]) | 0 // Int16Array stores modulo 2^16: wrap-around deltas decode exactly
      acc = out[i]
    }
  }
  return out
}
