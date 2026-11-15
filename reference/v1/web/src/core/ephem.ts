// Chebyshev ephemeris of the Sun and Earth, Moon-centred, MOON_ME frame, km.
// Independent variable: UTC milliseconds (Unix time). Built by pipeline/scripts/build_ephemeris.py.

export const R_MOON_KM = 1737.4
export const R_SUN_KM = 695700.0
export const R_EARTH_KM = 6378.1366
export const AU_KM = 149597870.7
export const SOLAR_CONSTANT = 1360.8 // W/m^2 at 1 au (Kopp & Lean 2011)

export type Vec3 = [number, number, number]
export type Body = 'SUN' | 'EARTH'

export interface EphemMeta {
  epoch_utc: string
  epoch_unix_ms: number
  seg_seconds: number
  degree: number
  n_segments: number
  targets: Body[]
  frame: string
  abcorr: string
  max_error_deg: Record<string, { max_deg: number; rms_deg: number; max_deg_from_surface: number }>
}

export class Ephemeris {
  readonly meta: EphemMeta
  private readonly c: Float64Array
  private readonly n1: number
  readonly startMs: number
  readonly endMs: number

  constructor(meta: EphemMeta, coeffs: Float64Array) {
    this.meta = meta
    this.c = coeffs
    this.n1 = meta.degree + 1
    this.startMs = meta.epoch_unix_ms
    this.endMs = meta.epoch_unix_ms + meta.n_segments * meta.seg_seconds * 1000
  }

  covers(utcMs: number): boolean {
    return utcMs >= this.startMs && utcMs <= this.endMs
  }

  /** Apparent position of the body seen from the Moon's centre (km, MOON_ME). */
  position(body: Body, utcMs: number, out: Vec3 = [0, 0, 0]): Vec3 {
    const m = this.meta
    const t = (utcMs - m.epoch_unix_ms) / 1000
    let s = Math.floor(t / m.seg_seconds)
    if (s < 0) s = 0
    if (s >= m.n_segments) s = m.n_segments - 1
    const x = (t - (s + 0.5) * m.seg_seconds) / (m.seg_seconds / 2)
    const base = ((m.targets.indexOf(body) * m.n_segments + s) * 3) * this.n1
    for (let k = 0; k < 3; k++) {
      // Clenshaw recurrence
      const o = base + k * this.n1
      let b1 = 0
      let b2 = 0
      for (let j = this.n1 - 1; j >= 1; j--) {
        const b0 = 2 * x * b1 - b2 + this.c[o + j]
        b2 = b1
        b1 = b0
      }
      out[k] = x * b1 - b2 + this.c[o]
    }
    return out
  }
}

export async function loadEphemeris(baseUrl: string): Promise<Ephemeris> {
  const [meta, buf] = await Promise.all([
    fetch(`${baseUrl}data/ephem.json`).then((r) => r.json() as Promise<EphemMeta>),
    fetch(`${baseUrl}data/ephem.bin`).then((r) => r.arrayBuffer()),
  ])
  return new Ephemeris(meta, new Float64Array(buf))
}
