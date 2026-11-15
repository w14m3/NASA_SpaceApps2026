// Horizon masks: terrain elevation (deg) per azimuth, with lower/upper uncertainty bands and the distance of the
// horizon-defining terrain point. Index i is azimuth 360·i/n clockwise from north.

export interface Mask {
  n: number
  mid: Float32Array
  lo: Float32Array
  hi: Float32Array
  /** km to the terrain point that sets the horizon; absent for the smooth sphere */
  dist?: Float32Array
  /** provenance label shown in the UI, e.g. 'LOLA 80 m + 240 m (precomputed)', 'LOLA 240 m (live)', 'smooth sphere' */
  kind: string
  /** fraction of azimuths whose horizon is set closer than 3 pixels of the grid that sets it (§7.6) */
  nearShare?: number
  /** grid spacing (m) of the finest DEM used */
  finestPx?: number
}

export type Band = 'mid' | 'lo' | 'hi'

export function flatMask(dipDeg: number, n = 360): Mask {
  const a = new Float32Array(n).fill(dipDeg)
  return { n, mid: a, lo: a, hi: a, kind: 'smooth sphere (no terrain data)', nearShare: 0 }
}

export function maskAt(m: Mask, azDeg: number, band: Band = 'mid'): number {
  const arr = m[band]
  let x = (azDeg / 360) * m.n
  x -= Math.floor(x / m.n) * m.n
  const i = Math.floor(x)
  const f = x - i
  return arr[i] * (1 - f) + arr[(i + 1) % m.n] * f
}

export function distAt(m: Mask, azDeg: number): number | null {
  if (!m.dist) return null
  let i = Math.round((azDeg / 360) * m.n) % m.n
  if (i < 0) i += m.n
  return m.dist[i]
}

/** Decode a reference/v1 mask height block (int16 little-endian base64, `scale` deg per count). */
export function decodeInt16(b64: string, scale: number): Float32Array {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
  const n = bin.length / 2
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)
    if (v >= 32768) v -= 65536
    out[i] = v * scale
  }
  return out
}

export interface V1MaskFile {
  id: string
  n_az: number
  scale_deg: number
  label: string
  z0: number
  z0_err?: number
  heights: Record<string, { mid: string; lo: string; hi: string; dist: string }>
}

export function maskFromV1(file: V1MaskFile, h: string): Mask {
  const b = file.heights[h]
  // v1 pipeline: dist = b64_i16(dist_m / 1000, 0.01) → km at 0.01 km per count (build_site_data.py line 117)
  const dist = decodeInt16(b.dist, 0.01)
  return {
    n: file.n_az,
    mid: decodeInt16(b.mid, file.scale_deg),
    lo: decodeInt16(b.lo, file.scale_deg),
    hi: decodeInt16(b.hi, file.scale_deg),
    dist,
    kind: file.label,
  }
}

/** Resample a mask to n azimuths by taking the maximum over each new azimuth bin (conservative). */
export function resampleMax(m: Mask, n: number): Mask {
  const pick = (a: Float32Array) => {
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a0 = ((i - 0.5) / n) * m.n
      const a1 = ((i + 0.5) / n) * m.n
      let best = -90
      for (let k = Math.floor(a0); k <= Math.ceil(a1); k++) best = Math.max(best, a[((k % m.n) + m.n) % m.n])
      out[i] = best
    }
    return out
  }
  return { ...m, n, mid: pick(m.mid), lo: pick(m.lo), hi: pick(m.hi), dist: undefined }
}
