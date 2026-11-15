// South polar stereographic on the 1737.4 km sphere, true scale at the pole, central meridian 0° (the LOLA PGDA
// product CRS, IAU 30135): k = 2R cos φ / (1 − sin φ), x = k sin λ, y = k cos λ. Metres.
import { D2R, R2D, R_MOON_M } from './constants'

export function lonLatToXY(lonDeg: number, latDeg: number): [number, number] {
  const lo = lonDeg * D2R
  const la = latDeg * D2R
  const k = (2 * R_MOON_M * Math.cos(la)) / (1 - Math.sin(la))
  return [k * Math.sin(lo), k * Math.cos(lo)]
}

export function xyToLonLat(x: number, y: number): [number, number] {
  const r = Math.hypot(x, y)
  const lat = 2 * Math.atan(r / (2 * R_MOON_M)) - Math.PI / 2
  let lon = Math.atan2(x, y) * R2D
  if (lon > 180) lon -= 360
  return [lon, lat * R2D]
}

/** Map coordinates of a Moon-centred unit vector p (south hemisphere). */
export function unitToXY(p0: number, p1: number, p2: number): [number, number] {
  const k = (2 * R_MOON_M) / (1 - p2)
  return [k * p1, k * p0]
}

/** Point scale factor of the projection at latitude φ (map distance / true distance on the sphere). */
export function scaleFactor(latDeg: number): number {
  return 2 / (1 - Math.sin(latDeg * D2R))
}

/** Great-circle distance on the reference sphere, m. */
export function greatCircle(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const a = lat1 * D2R
  const b = lat2 * D2R
  const dl = (lon2 - lon1) * D2R
  const h = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(dl / 2) ** 2
  return 2 * R_MOON_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial bearing from point 1 to point 2, deg clockwise from north. */
export function bearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const a = lat1 * D2R
  const b = lat2 * D2R
  const dl = (lon2 - lon1) * D2R
  const y = Math.sin(dl) * Math.cos(b)
  const x = Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(dl)
  return ((Math.atan2(y, x) * R2D) % 360 + 360) % 360
}

/** Destination point from (lon, lat) along bearing az (deg) for distance s (m). */
export function destination(lon: number, lat: number, az: number, s: number): [number, number] {
  const d = s / R_MOON_M
  const a = lat * D2R
  const t = az * D2R
  const b = Math.asin(Math.sin(a) * Math.cos(d) + Math.cos(a) * Math.sin(d) * Math.cos(t))
  const l = lon * D2R + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(a), Math.cos(d) - Math.sin(a) * Math.sin(b))
  let lo = l * R2D
  lo = ((lo + 540) % 360) - 180
  return [lo, b * R2D]
}
