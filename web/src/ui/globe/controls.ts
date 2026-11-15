// Map-style camera controller for the Moon (Google-Earth-like): the camera looks at a point on the surface from an
// altitude, with heading and tilt. Drag pans the ground under the cursor, the wheel or pinch zooms toward the cursor,
// right-drag / Ctrl-drag / two-finger drag rotates and tilts; keyboard: arrows pan, +/− zoom, Q/E rotate, W/S tilt.
import * as THREE from 'three'
import { D2R, R_MOON_KM } from '../../core/constants'
import { lonLatToWorld, worldToLonLat } from './tiles'

export interface View {
  lon: number
  lat: number
  /** km above the reference sphere */
  alt: number
  /** deg, 0 = north up */
  heading: number
  /** deg, 0 = looking straight down */
  tilt: number
}

export function maxTilt(alt: number) {
  return alt > 3000 ? 0 : alt > 800 ? 30 : alt > 150 ? 55 : 72
}

export function applyView(camera: THREE.PerspectiveCamera, v: View, groundKm = 0) {
  const P = lonLatToWorld(v.lon, v.lat, R_MOON_KM + groundKm)
  const U = P.clone().normalize()
  const lo = v.lon * D2R
  const la = v.lat * D2R
  // local east and north in world coordinates (MOON_ME → world)
  const E = new THREE.Vector3(-Math.sin(lo), 0, -Math.cos(lo))
  const N = new THREE.Vector3(-Math.sin(la) * Math.cos(lo), Math.cos(la), Math.sin(la) * Math.sin(lo))
  const h = v.heading * D2R
  const t = Math.min(v.tilt, maxTilt(v.alt)) * D2R
  const fwd = N.clone().multiplyScalar(Math.cos(h)).add(E.clone().multiplyScalar(Math.sin(h)))
  const camPos = P.clone().add(U.clone().multiplyScalar(v.alt * Math.cos(t))).sub(fwd.clone().multiplyScalar(v.alt * Math.sin(t)))
  camera.position.copy(camPos)
  camera.up.copy(U.clone().multiplyScalar(Math.sin(t)).add(fwd.clone().multiplyScalar(Math.cos(t))).normalize())
  camera.lookAt(P)
  camera.near = Math.max(0.005, v.alt * 0.02)
  camera.far = Math.max(8000, v.alt * 4 + 4000)
  camera.updateProjectionMatrix()
  return { P, U, E, N, fwd }
}

/** Move the look-at point by (east, north) kilometres along the surface. */
export function panBy(v: View, eastKm: number, northKm: number): View {
  const lat = Math.max(-89.9999, Math.min(89.9999, v.lat))
  const P = lonLatToWorld(v.lon, lat)
  const lo = v.lon * D2R
  const la = lat * D2R
  const E = new THREE.Vector3(-Math.sin(lo), 0, -Math.cos(lo))
  const N = new THREE.Vector3(-Math.sin(la) * Math.cos(lo), Math.cos(la), Math.sin(la) * Math.sin(lo))
  P.add(E.multiplyScalar(eastKm)).add(N.multiplyScalar(northKm))
  const ll = worldToLonLat(P)
  return { ...v, lon: ll.lon, lat: ll.lat }
}

export function clampView(v: View): View {
  return { ...v, alt: Math.max(0.4, Math.min(14000, v.alt)), lat: Math.max(-89.9999, Math.min(89.9999, v.lat)), tilt: Math.max(0, Math.min(maxTilt(v.alt), v.tilt)), heading: ((v.heading % 360) + 360) % 360 }
}
