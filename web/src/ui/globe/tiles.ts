// Level-of-detail tile pyramid for the 3D Moon (Google-Earth-style): NASA Moon Trek WMTS tiles are fetched as the camera
// approaches. Two pyramids share one scene:
//  • global equirectangular LRO WAC mosaic (LRO_WAC_Mosaic_Global_303ppd_v02, zoom 0–8, ~118 m/px at zoom 8);
//  • south-polar stereographic LOLA shaded relief (30 m product to zoom 6, 10 m product to zoom 8 = 33 m/px within
//    87.5°S), displaced by LOLA terrain heights (80 m / 240 m) so the pole is a real 3D surface.
// Tile matrices were read from each layer's WMTSCapabilities.xml (docs/RESOURCES.md). A missing tile = no coverage.
import * as THREE from 'three'
import { D2R, R_MOON_KM } from '../../core/constants'
import type { DemGrid } from '../../core/dem'
import { xyToLonLat } from '../../core/projection'
import { heightXY } from './terrainMain'

const EQ = 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm'
const SP30 = 'https://trek.nasa.gov/tiles/Moon/SP/LRO_LOLA_Shade_SPole75_30mp_v04/1.0.0/default/default028mm'
const SP10 = 'https://trek.nasa.gov/tiles/Moon/SP/LRO_LOLA_Shade_SPolar875_10m/1.0.0/default/default028mm'
const SP_X0 = -1_095_930
const SP_Y0 = 1_095_930
const SP_R0 = 3.0578404017857101e7 * 0.00028 // m/px at level 0
const CAP_HALF = 304_000 // m: extent of the runtime DEM (80–90°S square)
const SP10_HALF = 75_840
/** the polar cap mesh covers everything south of this latitude (the DEM square reaches 80.0°S at its edge midpoints) */
export const EQ_SOUTH_LIMIT = -79.9

/** MOON_ME (km) → three.js world (Y up): (x, z, −y). */
export function meToWorld(x: number, y: number, z: number, out = new THREE.Vector3()) {
  return out.set(x, z, -y)
}
export function lonLatToWorld(lonDeg: number, latDeg: number, rKm = R_MOON_KM, out = new THREE.Vector3()) {
  const lo = lonDeg * D2R
  const la = latDeg * D2R
  return meToWorld(rKm * Math.cos(la) * Math.cos(lo), rKm * Math.cos(la) * Math.sin(lo), rKm * Math.sin(la), out)
}
export function worldToLonLat(v: THREE.Vector3): { lon: number; lat: number } {
  const x = v.x
  const y = -v.z
  const z = v.y
  const r = Math.hypot(x, y, z)
  return { lon: (Math.atan2(y, x) * 180) / Math.PI, lat: (Math.asin(z / r) * 180) / Math.PI }
}

type Kind = 'eq' | 'sp'
interface Tile {
  key: string
  kind: Kind
  z: number
  r: number
  c: number
  url: string | null
  center: THREE.Vector3
  sizeKm: number
  mesh: THREE.Mesh | null
  tex: THREE.Texture | null
  state: 'idle' | 'loading' | 'ready' | 'missing'
  children: Tile[] | null
  lastUsed: number
}

export interface TileStats {
  drawn: number
  loading: number
  maxZ: number
  resM: number
}

export class MoonTiles {
  readonly group = new THREE.Group()
  private roots: Tile[] = []
  private cache = new Map<string, Tile>()
  private queue: Tile[] = []
  private active = 0
  private frame = 0
  private grids: DemGrid[] | null = null
  exaggeration = 1
  lit = false
  readonly stats: TileStats = { drawn: 0, loading: 0, maxZ: 0, resM: 0 }
  onChange: () => void = () => undefined

  constructor() {
    for (let c = 0; c < 2; c++) this.roots.push(this.makeEq(0, 0, c))
    // polar cap roots: level-3 tiles overlapping the DEM square
    const z = 3
    const S = 256 * (SP_R0 / 2 ** z)
    for (let r = Math.floor((SP_Y0 - CAP_HALF) / S); r <= Math.floor((SP_Y0 + CAP_HALF) / S); r++)
      for (let c = Math.floor((-CAP_HALF - SP_X0) / S); c <= Math.floor((CAP_HALF - SP_X0) / S); c++) this.roots.push(this.makeSp(z, r, c))
  }

  setTerrain(grids: DemGrid[]) {
    this.grids = grids
    // rebuild polar meshes with heights
    for (const t of this.cache.values()) if (t.kind === 'sp' && t.mesh) this.rebuildMesh(t)
  }

  setExaggeration(k: number) {
    if (k === this.exaggeration) return
    this.exaggeration = k
    for (const t of this.cache.values()) if (t.kind === 'sp' && t.mesh) this.rebuildMesh(t)
  }

  setLit(lit: boolean) {
    if (lit === this.lit) return
    this.lit = lit
    for (const t of this.cache.values()) if (t.mesh && t.tex) t.mesh.material = this.material(t)
  }

  private makeEq(z: number, r: number, c: number): Tile {
    const key = `eq/${z}/${r}/${c}`
    const hit = this.cache.get(key)
    if (hit) return hit
    const span = 180 / 2 ** z
    const lon = -180 + (c + 0.5) * span
    const lat = 90 - (r + 0.5) * span
    const t: Tile = { key, kind: 'eq', z, r, c, url: `${EQ}/${z}/${r}/${c}.jpg`, center: lonLatToWorld(lon, lat), sizeKm: (span * D2R * R_MOON_KM) * Math.max(0.2, Math.cos(lat * D2R)), mesh: null, tex: null, state: 'idle', children: null, lastUsed: 0 }
    this.cache.set(key, t)
    return t
  }

  private makeSp(z: number, r: number, c: number): Tile {
    const key = `sp/${z}/${r}/${c}`
    const hit = this.cache.get(key)
    if (hit) return hit
    const S = 256 * (SP_R0 / 2 ** z)
    const x0 = SP_X0 + c * S
    const y1 = SP_Y0 - r * S
    const cx = x0 + S / 2
    const cy = y1 - S / 2
    const [lon, lat] = xyToLonLat(cx, cy)
    const in10 = Math.max(Math.abs(x0), Math.abs(x0 + S), Math.abs(y1), Math.abs(y1 - S)) <= SP10_HALF + S
    const url = z <= 6 ? `${SP30}/${z}/${r}/${c}.png` : in10 ? `${SP10}/${z}/${r}/${c}.png` : null
    const t: Tile = { key, kind: 'sp', z, r, c, url, center: lonLatToWorld(lon, lat), sizeKm: S / 1000, mesh: null, tex: null, state: url ? 'idle' : 'missing', children: null, lastUsed: 0 }
    this.cache.set(key, t)
    return t
  }

  private childrenOf(t: Tile): Tile[] {
    if (t.children) return t.children
    const z = t.z + 1
    const kids: Tile[] = []
    for (let dr = 0; dr < 2; dr++)
      for (let dc = 0; dc < 2; dc++) {
        if (t.kind === 'eq') kids.push(this.makeEq(z, 2 * t.r + dr, 2 * t.c + dc))
        else {
          const k = this.makeSp(z, 2 * t.r + dr, 2 * t.c + dc)
          // keep only tiles overlapping the DEM square
          const S = 256 * (SP_R0 / 2 ** z)
          const x0 = SP_X0 + k.c * S
          const y1 = SP_Y0 - k.r * S
          if (x0 > CAP_HALF || x0 + S < -CAP_HALF || y1 - S > CAP_HALF || y1 < -CAP_HALF) continue
          kids.push(k)
        }
      }
    t.children = kids
    return kids
  }

  private maxZ(t: Tile) {
    return t.kind === 'eq' ? 8 : 8
  }

  private material(t: Tile): THREE.Material {
    const m = this.lit ? new THREE.MeshLambertMaterial({ map: t.tex }) : new THREE.MeshBasicMaterial({ map: t.tex })
    if (t.kind === 'sp') {
      m.polygonOffset = true
      m.polygonOffsetFactor = -2
      m.polygonOffsetUnits = -2
    }
    return m
  }

  private buildGeometry(t: Tile): THREE.BufferGeometry {
    const n = t.kind === 'eq' ? Math.max(8, 48 >> t.z) : 32
    const pos = new Float32Array((n + 1) * (n + 1) * 3)
    const uv = new Float32Array((n + 1) * (n + 1) * 2)
    const v = new THREE.Vector3()
    let k = 0
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const u = i / n
        const w = j / n
        if (t.kind === 'eq') {
          const span = 180 / 2 ** t.z
          const lon = -180 + (t.c + u) * span
          // south of 79.9°S the 3D polar cap (LOLA relief + heights) replaces the flat equirectangular mosaic
          const lat = Math.max(EQ_SOUTH_LIMIT, Math.min(89.9, 90 - (t.r + w) * span))
          lonLatToWorld(lon, lat, R_MOON_KM, v)
        } else {
          const S = 256 * (SP_R0 / 2 ** t.z)
          const x = SP_X0 + (t.c + u) * S
          const y = SP_Y0 - (t.r + w) * S
          const [lon, lat] = xyToLonLat(x, y)
          let h = this.grids ? heightXY(this.grids, x, y) : 0
          if (Number.isNaN(h)) h = 0
          lonLatToWorld(lon, lat, R_MOON_KM + (h * this.exaggeration) / 1000 + 0.02, v)
        }
        pos[3 * k] = v.x
        pos[3 * k + 1] = v.y
        pos[3 * k + 2] = v.z
        uv[2 * k] = u
        uv[2 * k + 1] = 1 - w
        k++
      }
    const idx: number[] = []
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i
        const b = a + 1
        const c = a + n + 1
        const d = c + 1
        idx.push(a, c, b, b, c, d)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }

  private rebuildMesh(t: Tile) {
    if (!t.mesh) return
    t.mesh.geometry.dispose()
    t.mesh.geometry = this.buildGeometry(t)
  }

  private load(t: Tile) {
    if (t.state !== 'idle' || !t.url) return
    t.state = 'loading'
    this.queue.push(t)
    this.pump()
  }

  private pump() {
    // nearest-first: the queue is re-sorted each frame by lastUsed; keep the service happy with a few connections
    while (this.active < 6 && this.queue.length) {
      const t = this.queue.shift()!
      if (this.frame - t.lastUsed > 30) {
        t.state = 'idle'
        continue
      }
      this.active++
      const im = new Image()
      im.crossOrigin = 'anonymous'
      im.onload = () => {
        this.active--
        const tex = new THREE.Texture(im)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        tex.needsUpdate = true
        t.tex = tex
        t.mesh = new THREE.Mesh(this.buildGeometry(t), this.material(t))
        t.mesh.renderOrder = t.kind === 'sp' ? 2 + t.z : t.z
        t.mesh.userData.tile = t.key
        t.state = 'ready'
        this.onChange()
        this.pump()
      }
      im.onerror = () => {
        this.active--
        t.state = 'missing'
        this.onChange()
        this.pump()
      }
      im.src = t.url!
    }
  }

  /** Choose and attach the visible tiles for this camera. */
  update(camera: THREE.PerspectiveCamera, heightPx: number) {
    this.frame++
    const camPos = camera.position
    const k = heightPx / (2 * Math.tan((camera.fov * D2R) / 2))
    const R2 = R_MOON_KM * R_MOON_KM
    const camLen2 = camPos.lengthSq()
    const visible: Tile[] = []
    let maxZ = 0
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    const sphere = new THREE.Sphere()
    const want = (t: Tile): boolean => {
      // horizon culling (generous) and frustum culling with the tile's bounding sphere
      const behind = t.center.dot(camPos) < R2 - t.sizeKm * R_MOON_KM * 1.2 && camLen2 > R2
      if (behind && t.z > 1) return false
      sphere.set(t.center, t.sizeKm * 0.9)
      if (t.z > 1 && !frustum.intersectsSphere(sphere)) return false
      return true
    }
    const visit = (t: Tile) => {
      t.lastUsed = this.frame
      if (!want(t)) return
      if (t.kind === 'eq' && 90 - t.r * (180 / 2 ** t.z) <= EQ_SOUTH_LIMIT) return
      const d = Math.max(1e-3, t.center.distanceTo(camPos))
      const px = (t.sizeKm / d) * k
      const split = px > 330 && t.z < this.maxZ(t)
      if (split) {
        const kids = this.childrenOf(t)
        for (const c of kids) {
          c.lastUsed = this.frame
          if (c.state === 'idle') this.load(c)
        }
        const ready = kids.length > 0 && kids.every((c) => c.state === 'ready' || c.state === 'missing') && kids.some((c) => c.state === 'ready')
        if (ready) {
          for (const c of kids) if (c.state === 'ready') visit(c)
          // missing children: fall back to the parent for that area only if nothing else covers it
          if (kids.some((c) => c.state === 'missing') && t.mesh) visible.push(t)
          return
        }
      }
      if (t.state === 'idle') this.load(t)
      if (t.mesh) {
        visible.push(t)
        maxZ = Math.max(maxZ, t.z)
      }
    }
    for (const r of this.roots) visit(r)
    // attach exactly the visible set
    const keep = new Set(visible.map((t) => t.mesh!))
    for (const ch of [...this.group.children]) if (!keep.has(ch as THREE.Mesh)) this.group.remove(ch)
    for (const m of keep) if (m.parent !== this.group) this.group.add(m)
    // sort queue: most recently wanted, coarsest first
    this.queue.sort((a, b) => b.lastUsed - a.lastUsed || a.z - b.z)
    this.evict()
    this.stats.drawn = visible.length
    this.stats.loading = this.active + this.queue.length
    this.stats.maxZ = maxZ
    this.stats.resM = Math.min(...visible.map((t) => (t.kind === 'eq' ? (180 / 2 ** t.z / 256) * D2R * R_MOON_KM * 1000 : (SP_R0 / 2 ** t.z))), 1e9)
  }

  private evict() {
    if (this.cache.size < 900) return
    const old = [...this.cache.values()].filter((t) => t.mesh && this.frame - t.lastUsed > 120 && t.z > 1).sort((a, b) => a.lastUsed - b.lastUsed)
    for (const t of old.slice(0, 200)) {
      t.mesh!.geometry.dispose()
      ;(t.mesh!.material as THREE.Material).dispose()
      t.tex?.dispose()
      t.mesh = null
      t.tex = null
      t.state = 'idle'
    }
  }

  /** Meshes for ray picking. */
  pickables(): THREE.Object3D[] {
    return this.group.children
  }
}
