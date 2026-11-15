// Runtime ephemeris: Chebyshev pieces of the apparent (LT+S) Sun and Earth vectors seen from the Moon's centre in
// MOON_ME (km), plus the apparent geocentric Moon in CIRS for ground-station geometry. Independent variable: UTC
// milliseconds (no leap second inside 2017-01-01 .. 2031-01-03; asserted by the pipeline).
// Built by pipeline/scripts/build_ephemeris.py; see docs/METHODS.md §3.

export type Vec3 = [number, number, number]
export type Body = 'SUN' | 'EARTH'

export interface PieceMeta {
  id: string
  file: string
  start_ms: number
  valid_until_ms: number
  seg_s: number
  degree: number
  n_seg: number
  bodies?: string[]
  source: string
}

export interface EphemManifest {
  frame: string
  abcorr: string
  pieces: PieceMeta[]
  moon_cirs: PieceMeta
  ut1: string
}

export interface Ut1Table {
  mjd0: number
  dut1_s: number[]
  source: string
}

export class ChebPiece {
  readonly n1: number
  constructor(
    readonly meta: PieceMeta,
    readonly c: Float64Array,
    readonly nBodies: number,
  ) {
    this.n1 = meta.degree + 1
  }

  get startMs() {
    return this.meta.start_ms
  }
  get endMs() {
    return this.meta.start_ms + this.meta.n_seg * this.meta.seg_s * 1000
  }

  eval(bodyIndex: number, utcMs: number, out: Vec3): Vec3 {
    const m = this.meta
    const t = (utcMs - m.start_ms) / 1000
    let s = Math.floor(t / m.seg_s)
    if (s < 0) s = 0
    if (s >= m.n_seg) s = m.n_seg - 1
    const x = (t - (s + 0.5) * m.seg_s) / (m.seg_s / 2)
    const n1 = this.n1
    const base = (bodyIndex * m.n_seg + s) * 3 * n1
    const x2 = 2 * x
    for (let k = 0; k < 3; k++) {
      const o = base + k * n1
      let b1 = 0
      let b2 = 0
      for (let j = n1 - 1; j >= 1; j--) {
        const b0 = x2 * b1 - b2 + this.c[o + j]
        b2 = b1
        b1 = b0
      }
      out[k] = x * b1 - b2 + this.c[o]
    }
    return out
  }
}

export class Ephemeris {
  /** pieces sorted by preference: later pieces win where they are valid (SPICE DE440 from 2026) */
  constructor(
    readonly pieces: ChebPiece[],
    readonly moonCirs: ChebPiece | null,
    readonly ut1: Ut1Table | null,
  ) {}

  get startMs() {
    return Math.min(...this.pieces.map((p) => p.startMs))
  }
  get endMs() {
    return Math.max(...this.pieces.map((p) => Math.min(p.endMs, p.meta.valid_until_ms)))
  }

  covers(t: number) {
    return t >= this.startMs && t <= this.endMs
  }

  pieceAt(t: number): ChebPiece {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]
      if (t >= p.startMs && t < Math.min(p.endMs, p.meta.valid_until_ms)) return p
    }
    return t < this.startMs ? this.pieces[0] : this.pieces[this.pieces.length - 1]
  }

  sourceAt(t: number): string {
    return this.pieceAt(t).meta.id
  }

  /** Apparent position of the body seen from the Moon's centre (km, MOON_ME). */
  position(body: Body, t: number, out: Vec3 = [0, 0, 0]): Vec3 {
    const p = this.pieceAt(t)
    const bi = (p.meta.bodies ?? ['SUN', 'EARTH']).indexOf(body)
    return p.eval(bi, t, out)
  }

  /** Apparent geocentric Moon in CIRS (km). */
  moonCirsAt(t: number, out: Vec3 = [0, 0, 0]): Vec3 {
    if (!this.moonCirs) throw new Error('Moon CIRS ephemeris not loaded')
    return this.moonCirs.eval(0, t, out)
  }

  /** UT1−UTC in seconds (linear interpolation of the daily IERS table; last value held beyond it). */
  dut1(t: number): number {
    const u = this.ut1
    if (!u) return 0
    const mjd = t / 86_400_000 + 40587
    const x = mjd - u.mjd0
    const n = u.dut1_s.length
    if (x <= 0) return u.dut1_s[0]
    if (x >= n - 1) return u.dut1_s[n - 1]
    const i = Math.floor(x)
    const f = x - i
    // a leap second never falls in 2017–2031, so neighbouring values never jump by 1 s
    return u.dut1_s[i] * (1 - f) + u.dut1_s[i + 1] * f
  }
}

export type Fetcher = (path: string) => Promise<{ json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>

export async function loadEphemeris(fetcher: Fetcher, base = 'data/ephem/'): Promise<Ephemeris> {
  const man = (await (await fetcher(`${base}manifest.json`)).json()) as EphemManifest
  const load = async (m: PieceMeta, nBodies: number) =>
    new ChebPiece(m, new Float64Array(await (await fetcher(base + m.file)).arrayBuffer()), nBodies)
  const pieces = await Promise.all(man.pieces.map((m) => load(m, m.bodies?.length ?? 2)))
  pieces.sort((a, b) => a.startMs - b.startMs)
  const [moon, ut1] = await Promise.all([
    load(man.moon_cirs, 1),
    fetcher(base + man.ut1).then((r) => r.json() as Promise<Ut1Table>),
  ])
  return new Ephemeris(pieces, moon, ut1)
}
