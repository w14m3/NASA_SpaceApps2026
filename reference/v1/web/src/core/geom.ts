// Topocentric geometry on the lunar reference sphere (R = 1737.4 km, MOON_ME,
// east-positive longitude, azimuth clockwise from local north).
import { Ephemeris, R_EARTH_KM, R_MOON_KM, R_SUN_KM, type Body, type Vec3 } from './ephem'

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

export interface Site {
  lon: number // deg east
  lat: number // deg
  /** terrain height above the reference sphere, m */
  z0: number
  /** instrument height above terrain, m */
  h: number
}

export interface SiteFrame {
  pos: Vec3 // km
  east: Vec3
  north: Vec3
  up: Vec3
}

export function siteFrame(s: Site): SiteFrame {
  const lon = s.lon * D2R
  const lat = s.lat * D2R
  const up: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
  const east: Vec3 = [-Math.sin(lon), Math.cos(lon), 0]
  const north: Vec3 = [
    up[1] * east[2] - up[2] * east[1],
    up[2] * east[0] - up[0] * east[2],
    up[0] * east[1] - up[1] * east[0],
  ]
  const r = R_MOON_KM + (s.z0 + s.h) / 1000
  return { pos: [up[0] * r, up[1] * r, up[2] * r], east, north, up }
}

export interface AzEl {
  az: number // deg, 0..360
  el: number // deg
  range: number // km
  /** angular radius of the disk, deg */
  rad: number
}

const tmp: Vec3 = [0, 0, 0]

/** Direction of a body from the site (the Earth needs the site vector: parallax up to 0.26 deg). */
export function azel(eph: Ephemeris, body: Body, utcMs: number, f: SiteFrame): AzEl {
  eph.position(body, utcMs, tmp)
  const dx = tmp[0] - f.pos[0]
  const dy = tmp[1] - f.pos[1]
  const dz = tmp[2] - f.pos[2]
  const range = Math.hypot(dx, dy, dz)
  const ux = dx / range
  const uy = dy / range
  const uz = dz / range
  const sinEl = ux * f.up[0] + uy * f.up[1] + uz * f.up[2]
  const e = ux * f.east[0] + uy * f.east[1] + uz * f.east[2]
  const n = ux * f.north[0] + uy * f.north[1] + uz * f.north[2]
  let az = Math.atan2(e, n) * R2D
  if (az < 0) az += 360
  const rb = body === 'SUN' ? R_SUN_KM : R_EARTH_KM
  return { az, el: Math.asin(Math.max(-1, Math.min(1, sinEl))) * R2D, range, rad: Math.asin(rb / range) * R2D }
}

/** Sub-point (lon, lat in deg) of a body: where it is at the zenith. */
export function subPoint(eph: Ephemeris, body: Body, utcMs: number): { lon: number; lat: number } {
  const p = eph.position(body, utcMs)
  const r = Math.hypot(p[0], p[1], p[2])
  return { lon: Math.atan2(p[1], p[0]) * R2D, lat: Math.asin(p[2] / r) * R2D }
}

/** Angular separation of Sun and Earth seen from the site, deg. */
export function sunEarthSeparation(a: AzEl, b: AzEl): number {
  const c =
    Math.sin(a.el * D2R) * Math.sin(b.el * D2R) +
    Math.cos(a.el * D2R) * Math.cos(b.el * D2R) * Math.cos((a.az - b.az) * D2R)
  return Math.acos(Math.max(-1, Math.min(1, c))) * R2D
}

/** Dip of the smooth-sphere horizon for an eye h metres above the sphere, deg (negative). */
export function sphereDip(hMeters: number): number {
  const R = R_MOON_KM * 1000
  return -Math.acos(R / (R + Math.max(0, hMeters))) * R2D
}
