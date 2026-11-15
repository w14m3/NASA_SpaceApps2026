// Earth ground stations and the Moon's topocentric elevation from them (contract §7.9).
// Moon: apparent geocentric vector in CIRS from the ephemeris; Earth rotation by the Earth Rotation Angle
// ERA = 2π(0.7790572732640 + 1.00273781191135448·(JD_UT1 − 2451545.0)) (IERS Conventions 2010, eq. 5.15),
// UT1 from the IERS daily table. Polar motion (< 0.5″) is ignored: < 1.5e-4° on the Moon's direction.
import { D2R, EARTH_A_KM, EARTH_B_KM, R2D } from './constants'
import type { Ephemeris, Vec3 } from './ephem'

export interface Station {
  id: string
  name: string
  /** geodetic latitude, deg (spheroid a = 6378.137 km, b = 6356.7523 km) */
  lat: number
  lon: number // deg east
  heightM: number
  /** minimum elevation of the Moon for the station to count as "sees the Moon", deg (assumption, editable) */
  minEl: number
  source: string
  custom?: boolean
}

const DSN_SOURCE =
  'NAIF earth_topo_260814.tf comments (DSN 810-005 module 301 Rev. P), geodetic coordinates at epoch 2026-07-17; via reference/v1 data/sites_research.json'
/** Default minimum elevation: 10° (labelled assumption, contract §6.9). */
export const DEFAULT_MIN_EL = 10

export const DSN: Station[] = [
  { id: 'DSS-14', name: 'Goldstone (DSS-14, 70 m)', lat: 35.4258999225138, lon: -116.8895431330483, heightM: 1001.384, minEl: DEFAULT_MIN_EL, source: DSN_SOURCE },
  { id: 'DSS-63', name: 'Madrid (DSS-63, 70 m)', lat: 40.4312138842194, lon: -4.2480020535013, heightM: 864.845, minEl: DEFAULT_MIN_EL, source: DSN_SOURCE },
  { id: 'DSS-43', name: 'Canberra (DSS-43, 70 m)', lat: -35.4024141881635, lon: 148.9812726938012, heightM: 688.843, minEl: DEFAULT_MIN_EL, source: DSN_SOURCE },
]

export interface StationFrame {
  pos: Vec3 // km, ITRS (≈ TIRS)
  up: Vec3
  east: Vec3
  north: Vec3
}

export function stationFrame(s: Station): StationFrame {
  const a = EARTH_A_KM
  const e2 = 1 - (EARTH_B_KM * EARTH_B_KM) / (a * a)
  const la = s.lat * D2R
  const lo = s.lon * D2R
  const N = a / Math.sqrt(1 - e2 * Math.sin(la) ** 2)
  const h = s.heightM / 1000
  const pos: Vec3 = [(N + h) * Math.cos(la) * Math.cos(lo), (N + h) * Math.cos(la) * Math.sin(lo), (N * (1 - e2) + h) * Math.sin(la)]
  const up: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
  const east: Vec3 = [-Math.sin(lo), Math.cos(lo), 0]
  const north: Vec3 = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]]
  return { pos, up, east, north }
}

export function eraRad(eph: Ephemeris, utcMs: number): number {
  const jdUt1 = (utcMs + eph.dut1(utcMs) * 1000) / 86_400_000 + 2440587.5
  const du = jdUt1 - 2451545.0
  const f = 0.779057273264 + 1.00273781191135448 * du
  return 2 * Math.PI * (f - Math.floor(f))
}

const mc: Vec3 = [0, 0, 0]

/** Topocentric azimuth/elevation (deg) of the Moon's centre from a station. */
export function moonFromStation(eph: Ephemeris, f: StationFrame, t: number): { az: number; el: number; rangeKm: number } {
  eph.moonCirsAt(t, mc)
  const th = eraRad(eph, t)
  const c = Math.cos(th)
  const s = Math.sin(th)
  // CIRS -> TIRS: frame rotation R3(ERA)
  const x = c * mc[0] + s * mc[1] - f.pos[0]
  const y = -s * mc[0] + c * mc[1] - f.pos[1]
  const z = mc[2] - f.pos[2]
  const r = Math.hypot(x, y, z)
  const u = (x * f.up[0] + y * f.up[1] + z * f.up[2]) / r
  const e = (x * f.east[0] + y * f.east[1] + z * f.east[2]) / r
  const n = (x * f.north[0] + y * f.north[1] + z * f.north[2]) / r
  let az = Math.atan2(e, n) * R2D
  if (az < 0) az += 360
  return { az, el: Math.asin(u) * R2D, rangeKm: r }
}
