// Visible fraction of a uniform disk above a horizon mask (contract §7.7): 2-D quadrature in vertical strips,
// azimuth offsets divided by cos(el) so strips have equal great-circle width. No limb darkening (uniform disk).
import type { AzEl } from './topo'
import { maskAt, type Band, type Mask } from './mask'

export function diskFraction(m: Mask, p: AzEl, band: Band = 'mid', strips = 200): number {
  const cosEl = Math.max(0.05, Math.cos((p.el * Math.PI) / 180))
  // fast exits: the disk is far above or below the local mask range
  const span = p.rad / cosEl
  let lo = Infinity
  let hi = -Infinity
  for (let k = -2; k <= 2; k++) {
    const v = maskAt(m, p.az + (k * span) / 2, band)
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (p.el - p.rad > hi + 0.5) return 1
  if (p.el + p.rad < lo - 0.5) return 0
  let vis = 0
  let tot = 0
  for (let s = 0; s < strips; s++) {
    const x = (-1 + (2 * (s + 0.5)) / strips) * p.rad
    const half = Math.sqrt(p.rad * p.rad - x * x)
    const mk = maskAt(m, p.az + x / cosEl, band)
    vis += Math.min(2 * half, Math.max(0, p.el + half - mk))
    tot += 2 * half
  }
  return vis / tot
}

/** Exact visible fraction of a disk of radius r whose centre is d above a straight horizon (circle segment). */
export function circleSegmentFraction(d: number, r: number): number {
  if (d >= r) return 1
  if (d <= -r) return 0
  const h = r - Math.abs(d) // height of the minor segment
  const seg = r * r * Math.acos((r - h) / r) - (r - h) * Math.sqrt(2 * r * h - h * h)
  const frac = seg / (Math.PI * r * r)
  return d >= 0 ? 1 - frac : frac
}
