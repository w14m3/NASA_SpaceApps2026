// Visibility intervals and events (contract §7.7): margin g(t) = visible fraction − threshold; coarse scan,
// bisection to ≤ 1 s, explicit probing of grazing excursions between scan points.

export interface Interval {
  start: number
  end: number
  /** cut by the analysis window rather than by an event */
  openStart: boolean
  openEnd: boolean
}

export function refine(g: (t: number) => number, a: number, b: number, ga: number, tolMs = 1000): number {
  while (b - a > tolMs) {
    const m = 0.5 * (a + b)
    const gm = g(m)
    if (gm > 0 === ga > 0) {
      a = m
      ga = gm
    } else b = m
  }
  return 0.5 * (a + b)
}

export function intervals(g: (t: number) => number, t0: number, t1: number, stepMs = 600_000): Interval[] {
  const out: Interval[] = []
  let cur: Interval | null = null
  let pt = t0
  let pg = g(t0)
  let ppg = pg
  if (pg > 0) cur = { start: t0, end: t1, openStart: true, openEnd: true }
  const flip = (a: number, b: number, ga: number, gb: number) => {
    const tc = refine(g, a, b, ga)
    if (gb > 0) cur = { start: tc, end: t1, openStart: false, openEnd: true }
    else if (cur) {
      cur.end = tc
      cur.openEnd = false
      out.push(cur)
      cur = null
    }
  }
  while (pt < t1) {
    const t = Math.min(pt + stepMs, t1)
    const gt = g(t)
    if (gt > 0 !== pg > 0) flip(pt, t, pg, gt)
    else {
      // same sign at both ends: probe for a grazing excursion through zero in between
      const toward = pg > 0 ? pg < ppg || gt < pg : pg > ppg || gt > pg
      if (toward && Math.abs(pg) < 0.25 && t - pt > 2000) {
        const n = 20
        let a = pt
        let ga = pg
        for (let i = 1; i <= n; i++) {
          const b = pt + ((t - pt) * i) / n
          const gb = i === n ? gt : g(b)
          if (gb > 0 !== ga > 0) flip(a, b, ga, gb)
          a = b
          ga = gb
        }
      }
    }
    ppg = pg
    pg = gt
    pt = t
  }
  if (cur) out.push(cur)
  return out
}

export function totalDuration(iv: Interval[]): number {
  let s = 0
  for (const i of iv) s += i.end - i.start
  return s
}

export function gaps(iv: Interval[], t0: number, t1: number): Interval[] {
  const out: Interval[] = []
  let a = t0
  let open = true
  for (const i of iv) {
    if (i.start > a) out.push({ start: a, end: i.start, openStart: open, openEnd: false })
    a = i.end
    open = false
  }
  if (a < t1) out.push({ start: a, end: t1, openStart: open, openEnd: true })
  return out
}

export function longest(iv: Interval[]): Interval | null {
  let best: Interval | null = null
  for (const i of iv) if (!best || i.end - i.start > best.end - best.start) best = i
  return best
}

export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i].start, b[j].start)
    const e = Math.min(a[i].end, b[j].end)
    if (e > s)
      out.push({
        start: s,
        end: e,
        openStart: s === a[i].start ? a[i].openStart : b[j].openStart,
        openEnd: e === a[i].end ? a[i].openEnd : b[j].openEnd,
      })
    if (a[i].end < b[j].end) i++
    else j++
  }
  return out
}

export function union(a: Interval[], b: Interval[]): Interval[] {
  const all = [...a, ...b].sort((x, y) => x.start - y.start)
  const out: Interval[] = []
  for (const iv of all) {
    const last = out[out.length - 1]
    if (last && iv.start <= last.end) {
      if (iv.end > last.end) {
        last.end = iv.end
        last.openEnd = iv.openEnd
      }
    } else out.push({ ...iv })
  }
  return out
}

/** Next state change of g after t within horizonMs; null if none. */
export function nextChange(g: (t: number) => number, t: number, horizonMs: number, stepMs = 600_000): number | null {
  let a = t
  let ga = g(t)
  const s0 = ga > 0
  for (let b = t + stepMs; b <= t + horizonMs; b += stepMs) {
    const gb = g(b)
    if (gb > 0 !== s0) return refine(g, a, b, ga)
    a = b
    ga = gb
  }
  return null
}

export function isInside(iv: Interval[], t: number): Interval | null {
  for (const i of iv) if (t >= i.start && t < i.end) return i
  return null
}
