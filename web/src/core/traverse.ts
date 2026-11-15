// Moon Directions (contract §7.12): least-effort traverse on a slope grid. Cost per step = length × (1 + (slope /
// S_ref)²); cells steeper than S_max are forbidden. A* with an admissible heuristic (straight-line distance × the
// minimum cost factor 1) on an 8-connected grid; V20 checks it against a brute-force Dijkstra.

export interface SlopeGrid {
  nx: number
  ny: number
  /** cell size, m */
  px: number
  /** slope per cell, deg (NaN = no data, forbidden) */
  slope: Float32Array
}

export interface RouteResult {
  path: number[] // cell indices from start to goal
  cost: number
  lengthM: number
  maxSlope: number
  meanSlope: number
}

const NB = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

function stepCost(g: SlopeGrid, a: number, b: number, len: number, sRef: number) {
  const s = 0.5 * (g.slope[a] + g.slope[b])
  return len * (1 + (s / sRef) ** 2)
}

/** Binary min-heap of [priority, index]; ties broken by index for determinism. */
class Heap {
  p: number[] = []
  i: number[] = []
  push(pr: number, idx: number) {
    this.p.push(pr)
    this.i.push(idx)
    let k = this.p.length - 1
    while (k > 0) {
      const u = (k - 1) >> 1
      if (this.p[u] < this.p[k] || (this.p[u] === this.p[k] && this.i[u] <= this.i[k])) break
      ;[this.p[u], this.p[k]] = [this.p[k], this.p[u]]
      ;[this.i[u], this.i[k]] = [this.i[k], this.i[u]]
      k = u
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.p[0], this.i[0]]
    const lp = this.p.pop()!
    const li = this.i.pop()!
    if (this.p.length) {
      this.p[0] = lp
      this.i[0] = li
      let k = 0
      for (;;) {
        const l = 2 * k + 1
        const r = l + 1
        let m = k
        const less = (a: number, b: number) => this.p[a] < this.p[b] || (this.p[a] === this.p[b] && this.i[a] < this.i[b])
        if (l < this.p.length && less(l, m)) m = l
        if (r < this.p.length && less(r, m)) m = r
        if (m === k) break
        ;[this.p[m], this.p[k]] = [this.p[k], this.p[m]]
        ;[this.i[m], this.i[k]] = [this.i[k], this.i[m]]
        k = m
      }
    }
    return top
  }
  get size() {
    return this.p.length
  }
}

export function route(g: SlopeGrid, start: number, goal: number, sMax: number, sRef: number, useHeuristic = true): RouteResult | null {
  const ok = (c: number) => Number.isFinite(g.slope[c]) && g.slope[c] <= sMax
  if (!ok(start) || !ok(goal)) return null
  const n = g.nx * g.ny
  const dist = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const done = new Uint8Array(n)
  const gx = goal % g.nx
  const gy = Math.floor(goal / g.nx)
  const h = (c: number) => (useHeuristic ? Math.hypot((c % g.nx) - gx, Math.floor(c / g.nx) - gy) * g.px : 0)
  const heap = new Heap()
  dist[start] = 0
  heap.push(h(start), start)
  while (heap.size) {
    const [, c] = heap.pop()
    if (done[c]) continue
    done[c] = 1
    if (c === goal) break
    const cx = c % g.nx
    const cy = Math.floor(c / g.nx)
    for (const [dx, dy] of NB) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= g.nx || y >= g.ny) continue
      const nb = y * g.nx + x
      if (done[nb] || !ok(nb)) continue
      const d = dist[c] + stepCost(g, c, nb, Math.hypot(dx, dy) * g.px, sRef)
      if (d < dist[nb]) {
        dist[nb] = d
        prev[nb] = c
        heap.push(d + h(nb), nb)
      }
    }
  }
  if (!Number.isFinite(dist[goal])) return null
  const path: number[] = []
  for (let c = goal; c >= 0; c = prev[c]) path.push(c)
  path.reverse()
  let len = 0
  let mx = 0
  let sum = 0
  for (let k = 0; k < path.length; k++) {
    mx = Math.max(mx, g.slope[path[k]])
    sum += g.slope[path[k]]
    if (k) {
      const a = path[k - 1]
      const b = path[k]
      len += Math.hypot((a % g.nx) - (b % g.nx), Math.floor(a / g.nx) - Math.floor(b / g.nx)) * g.px
    }
  }
  return { path, cost: dist[goal], lengthM: len, maxSlope: mx, meanSlope: sum / path.length }
}

/** Default traverse limits: S_max 20° and S_ref 10° are labelled assumptions (contract §7.12 default; no verified source). */
export const TRAVERSE_DEFAULTS = { sMax: 20, sRef: 10, walkKmH: 2 }
