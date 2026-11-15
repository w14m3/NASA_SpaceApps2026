// Topocentric geometry on the lunar reference sphere (contract §7.4): MOON_ME, east-positive longitude,
// planetocentric latitude, azimuth clockwise from local north, elevation above the local horizontal.
import { D2R, R2D, R_EARTH_KM, R_MOON_KM, R_SUN_KM } from './constants'
import type { Body, Ephemeris, Vec3 } from './ephem'

export interface SiteSpec {
  lon: number // deg east
  lat: number // deg
  /** terrain height above the 1737.4 km sphere, m */
  z0: number
  /** instrument height above the terrain, m */
  h: number
}

export interface SiteFrame {
  pos: Vec3 // km, Moon-centred MOON_ME
  up: Vec3
  east: Vec3
  north: Vec3
}

export function unitVector(lonDeg: number, latDeg: number): Vec3 {
  const lo = lonDeg * D2R
  const la = latDeg * D2R
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
}

export function siteFrame(s: SiteSpec): SiteFrame {
  const up = unitVector(s.lon, s.lat)
  const lo = s.lon * D2R
  const east: Vec3 = [-Math.sin(lo), Math.cos(lo), 0]
  const north: Vec3 = [
    up[1] * east[2] - up[2] * east[1],
    up[2] * east[0] - up[0] * east[2],
    up[0] * east[1] - up[1] * east[0],
  ]
  const r = R_MOON_KM + (s.z0 + s.h) / 1000
  return { pos: [up[0] * r, up[1] * r, up[2] * r], up, east, north }
}

export interface AzEl {
  az: number // deg [0, 360)
  el: number // deg
  range: number // km
  rad: number // angular radius of the disk, deg
}

const tmp: Vec3 = [0, 0, 0]

/** Direction from the site to an arbitrary Moon-centred position p (km). */
export function azelOf(p: Vec3, f: SiteFrame, bodyRadiusKm: number): AzEl {
  const dx = p[0] - f.pos[0]
  const dy = p[1] - f.pos[1]
  const dz = p[2] - f.pos[2]
  const range = Math.hypot(dx, dy, dz)
  const ux = dx / range
  const uy = dy / range
  const uz = dz / range
  const s = ux * f.up[0] + uy * f.up[1] + uz * f.up[2]
  const e = ux * f.east[0] + uy * f.east[1] + uz * f.east[2]
  const n = ux * f.north[0] + uy * f.north[1] + uz * f.north[2]
  let az = Math.atan2(e, n) * R2D
  if (az < 0) az += 360
  return { az, el: Math.asin(Math.max(-1, Math.min(1, s))) * R2D, range, rad: Math.asin(bodyRadiusKm / range) * R2D }
}

/** Sun or Earth seen from the site; the vector from the site is used (Earth parallax up to 0.26°). */
export function azel(eph: Ephemeris, body: Body, t: number, f: SiteFrame): AzEl {
  eph.position(body, t, tmp)
  return azelOf(tmp, f, body === 'SUN' ? R_SUN_KM : R_EARTH_KM)
}

export function subPoint(eph: Ephemeris, body: Body, t: number): { lon: number; lat: number } {
  const p = eph.position(body, t)
  const r = Math.hypot(p[0], p[1], p[2])
  return { lon: Math.atan2(p[1], p[0]) * R2D, lat: Math.asin(p[2] / r) * R2D }
}

export function separation(a: AzEl, b: AzEl): number {
  const c =
    Math.sin(a.el * D2R) * Math.sin(b.el * D2R) + Math.cos(a.el * D2R) * Math.cos(b.el * D2R) * Math.cos((a.az - b.az) * D2R)
  return Math.acos(Math.max(-1, Math.min(1, c))) * R2D
}

/** Dip of the smooth-sphere horizon for an eye h metres above the sphere, deg (negative). */
export function sphereDip(hMeters: number): number {
  const R = R_MOON_KM * 1000
  return -Math.acos(R / (R + Math.max(0, hMeters))) * R2D
}

/** Unit vector (MOON_ME) of a local direction (azimuth, elevation) at the site. */
export function localToMe(f: SiteFrame, azDeg: number, elDeg: number): Vec3 {
  const a = azDeg * D2R
  const e = elDeg * D2R
  const ce = Math.cos(e)
  const n = ce * Math.cos(a)
  const ea = ce * Math.sin(a)
  const u = Math.sin(e)
  return [
    n * f.north[0] + ea * f.east[0] + u * f.up[0],
    n * f.north[1] + ea * f.east[1] + u * f.up[1],
    n * f.north[2] + ea * f.east[2] + u * f.up[2],
  ]
}
