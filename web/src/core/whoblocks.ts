// Who blocks the Sun? (contract §7.13): attribute every dark interval to the terrain that hides the Sun, using the
// horizon distance stored per azimuth, or to the lunar limb when the Sun is below the smooth-sphere horizon.
import { HOUR } from './constants'
import type { Ephemeris } from './ephem'
import { gaps, type Interval } from './events'
import { distAt, maskAt, type Mask } from './mask'
import { azel, sphereDip, type SiteFrame } from './topo'

export interface Blocker {
  start: number
  end: number
  hours: number
  openStart: boolean
  openEnd: boolean
  /** Sun azimuth at the middle of the night, deg */
  az: number
  /** Sun centre elevation at the middle of the night, deg */
  sunEl: number
  /** terrain horizon elevation at that azimuth, deg */
  horizonEl: number
  /** distance of the horizon-defining terrain, km (null for the limb or when not stored) */
  distKm: number | null
  cause: 'terrain' | 'limb'
}

/** Attribute one dark interval given the Sun direction at its midpoint. */
export function attribute(mask: Mask, h: number, sun: { az: number; el: number; rad: number }): Pick<Blocker, 'az' | 'sunEl' | 'horizonEl' | 'distKm' | 'cause'> {
  const horizonEl = maskAt(mask, sun.az)
  const limb = sphereDip(h)
  // the Sun's upper limb is below the smooth-sphere horizon: no terrain is needed to hide it
  if (sun.el + sun.rad < limb) return { az: sun.az, sunEl: sun.el, horizonEl, distKm: null, cause: 'limb' }
  return { az: sun.az, sunEl: sun.el, horizonEl, distKm: distAt(mask, sun.az), cause: 'terrain' }
}

export function whoBlocks(eph: Ephemeris, f: SiteFrame, mask: Mask, h: number, sunIv: Interval[], t0: number, t1: number, minHours = 1): Blocker[] {
  return gaps(sunIv, t0, t1)
    .filter((g) => g.end - g.start >= minHours * HOUR)
    .map((g) => {
      const mid = 0.5 * (g.start + g.end)
      const s = azel(eph, 'SUN', mid, f)
      return { start: g.start, end: g.end, hours: (g.end - g.start) / HOUR, openStart: g.openStart, openEnd: g.openEnd, ...attribute(mask, h, s) }
    })
}
