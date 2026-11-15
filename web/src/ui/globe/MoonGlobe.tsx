// Interactive 3D Moon — explore like a map: drag to move, wheel/pinch to zoom toward the cursor, right-drag or
// Ctrl-drag to rotate and tilt, click to analyse a spot. NASA Moon Trek tiles load sharper as you zoom; the south-polar
// cap is a real 3D surface from LOLA heights (80 m near the hero regions, 240 m elsewhere), lit by the true Sun.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { R_MOON_KM } from '../../core/constants'
import { lonLatToXY } from '../../core/projection'
import type { Ephemeris } from '../../core/ephem'
import { applyView, clampView, maxTilt, panBy, type View } from './controls'
import { MoonTiles, lonLatToWorld, meToWorld, worldToLonLat } from './tiles'
import { heightXY, loadTerrain } from './terrainMain'
import type { DemGrid } from '../../core/dem'

export interface Marker {
  id: string
  lon: number
  lat: number
  label: string
  kind: 'site' | 'top' | 'selected' | 'feature'
  onClick?: () => void
}

export interface GlobeHandle {
  flyTo: (lon: number, lat: number, alt?: number, tilt?: number) => void
  zoom: (factor: number) => void
  resetNorth: () => void
}

interface Props {
  eph: Ephemeris | null
  t: number
  markers: Marker[]
  focus: { lon: number; lat: number; key: string } | null
  lit: boolean
  exaggeration: number
  onPick: (lon: number, lat: number) => void
  onReady?: (h: GlobeHandle) => void
  onView?: (v: View, stats: { resM: number; loading: number }) => void
}

export default function MoonGlobe({ eph, t, markers, focus, lit, exaggeration, onPick, onReady, onView }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const labels = useRef<HTMLDivElement>(null)
  type GlobeState = {
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    tiles: MoonTiles
    sun: THREE.DirectionalLight
    ambient: THREE.AmbientLight
    view: View
    anim: { from: View; to: View; t0: number; dur: number } | null
    dirty: boolean
    grids: DemGrid[] | null
    markers: Marker[]
    labelEls: Map<string, HTMLButtonElement>
    sunDir: THREE.Vector3
  }
  const st = useRef<GlobeState | null>(null)
  const [hud, setHud] = useState({ resM: 0, loading: 0, alt: 0, heading: 0, tilt: 0 })
  const [hover, setHover] = useState('')
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const onViewRef = useRef(onView)
  onViewRef.current = onView


  // one-time setup
  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.tabIndex = 0
    renderer.domElement.setAttribute('aria-label', '3D Moon map. Drag to move, wheel to zoom, right-drag to rotate and tilt, click to analyse a spot. Keyboard: arrows move, plus and minus zoom, Q and E rotate, W and S tilt.')
    renderer.domElement.setAttribute('role', 'application')
    renderer.domElement.dataset.testid = 'moon-globe'
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#02040a')
    // faint deterministic star field
    const stars = new THREE.BufferGeometry()
    const sp: number[] = []
    let seed = 7
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    for (let i = 0; i < 1500; i++) {
      const u = rnd() * 2 - 1
      const a = rnd() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      sp.push(60000 * s * Math.cos(a), 60000 * u, 60000 * s * Math.sin(a))
    }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x8899bb, size: 1.2, sizeAttenuation: false })))
    // base sphere under the tiles (grey, no texture) so nothing is ever see-through
    // (open around the south pole: the cap terrain goes kilometres below the reference sphere; 15 km below so the
    // chords of coarse tiles, which sag up to ~1 km under the sphere, never let it show through)
    const base = new THREE.Mesh(new THREE.SphereGeometry(R_MOON_KM - 15, 96, 64, 0, Math.PI * 2, 0, Math.PI * (170.1 / 180)), new THREE.MeshBasicMaterial({ color: 0x55585e }))
    scene.add(base)
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.01, 60000)
    const tiles = new MoonTiles()
    scene.add(tiles.group)
    const sun = new THREE.DirectionalLight(0xffffff, 2.6)
    sun.shadow.mapSize.set(4096, 4096)
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.02
    const ambient = new THREE.AmbientLight(0xffffff, 0.22)
    scene.add(sun, sun.target, ambient, tiles.casters)
    const sunDir = new THREE.Vector3(1, 0, 0)
    const view: View = { lon: -137.3, lat: -89.45, alt: 5200, heading: 0, tilt: 0 }
    const s: GlobeState = { renderer, scene, camera, tiles, sun, ambient, view, anim: null, dirty: true, grids: null, markers: [], labelEls: new Map<string, HTMLButtonElement>(), sunDir }
    st.current = s
    tiles.onChange = () => (s.dirty = true)
    ;(window as unknown as { __sightlineTiles?: MoonTiles }).__sightlineTiles = tiles // debugging aid (read-only)
    loadTerrain().then((g) => {
      s.grids = g
      tiles.setTerrain(g)
      s.dirty = true
    })

    const groundKm = (v: View) => {
      if (!s.grids || v.lat > -79.5) return 0
      const [x, y] = lonLatToXY(v.lon, v.lat)
      const h = heightXY(s.grids, x, y)
      return Number.isNaN(h) ? 0 : (h * tiles.exaggeration) / 1000
    }

    const setView = (v: View) => {
      s.view = clampView(v)
      s.dirty = true
    }

    // ---- pointer interaction
    const pointers = new Map<number, { x: number; y: number }>()
    let drag: { x: number; y: number; moved: boolean; button: number; view: View } | null = null
    let pinch: { d: number; a: number; cx: number; cy: number; view: View } | null = null
    const kmPerPx = () => (s.view.alt * 2 * Math.tan((camera.fov * Math.PI) / 360)) / el.clientHeight
    const pickAt = (cx: number, cy: number): THREE.Vector3 | null => {
      const r = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
      const ray = new THREE.Raycaster()
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects([...tiles.pickables(), base], false)[0]
      return hit ? hit.point : null
    }
    const dom = renderer.domElement
    dom.addEventListener('contextmenu', (e) => e.preventDefault())
    dom.addEventListener('pointerdown', (e) => {
      dom.setPointerCapture(e.pointerId)
      dom.focus()
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      s.anim = null
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view: { ...s.view } }
        drag = null
      } else drag = { x: e.clientX, y: e.clientY, moved: false, button: e.ctrlKey || e.shiftKey ? 2 : e.button, view: { ...s.view } }
    })
    let hoverTimer = 0
    dom.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) {
        // hover readout (throttled): latitude, longitude, LOLA elevation under the cursor
        const now = performance.now()
        if (now - hoverTimer < 90) return
        hoverTimer = now
        const p = pickAt(e.clientX, e.clientY)
        if (!p) return setHover('')
        const ll = worldToLonLat(p)
        let h = ''
        if (s.grids && ll.lat < -79.5) {
          const [x, y] = lonLatToXY(ll.lon, ll.lat)
          const z = heightXY(s.grids, x, y)
          if (!Number.isNaN(z)) h = ` · ${Math.round(z).toLocaleString('en-GB')} m`
        }
        setHover(`${Math.abs(ll.lat).toFixed(3)}°${ll.lat < 0 ? 'S' : 'N'} ${Math.abs(ll.lon).toFixed(3)}°${ll.lon < 0 ? 'W' : 'E'}${h}`)
        return
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const ang = Math.atan2(b.y - a.y, b.x - a.x)
        const cy = (a.y + b.y) / 2
        setView({ ...pinch.view, alt: pinch.view.alt * (pinch.d / Math.max(10, d)), heading: pinch.view.heading - ((ang - pinch.a) * 180) / Math.PI, tilt: pinch.view.tilt + (pinch.cy - cy) * 0.3 })
        return
      }
      if (!drag) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
      if (drag.button === 2) setView({ ...drag.view, heading: drag.view.heading - dx * 0.3, tilt: drag.view.tilt - dy * 0.3 })
      else {
        // pan: move the look-at point opposite to the drag, rotated by the heading
        const k = (drag.view.alt * 2 * Math.tan((camera.fov * Math.PI) / 360)) / el.clientHeight
        const h = (drag.view.heading * Math.PI) / 180
        const east = (-dx * Math.cos(h) - dy * Math.sin(h)) * k
        const north = (dy * Math.cos(h) - dx * Math.sin(h)) * k
        setView(panBy(drag.view, east, north))
      }
    })
    const end = (e: PointerEvent) => {
      if (drag && !drag.moved && e.button === 0) {
        const p = pickAt(e.clientX, e.clientY)
        if (p) {
          const ll = worldToLonLat(p)
          onPickRef.current(ll.lon, ll.lat)
        }
      }
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      drag = null
    }
    dom.addEventListener('pointerup', end)
    dom.addEventListener('pointercancel', end)
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        s.anim = null
        const f = Math.exp(e.deltaY * 0.0012)
        const v = s.view
        const next = { ...v, alt: v.alt * f }
        // zoom toward the cursor: move the look-at point toward the point under the cursor
        const p = pickAt(e.clientX, e.clientY)
        if (p && f < 1) {
          const ll = worldToLonLat(p)
          const w = 1 - f
          const P0 = lonLatToWorld(v.lon, v.lat)
          const P1 = lonLatToWorld(ll.lon, ll.lat)
          const m = worldToLonLat(P0.lerp(P1, w))
          next.lon = m.lon
          next.lat = m.lat
        }
        setView(next)
      },
      { passive: false },
    )
    dom.addEventListener('keydown', (e) => {
      const v = s.view
      const step = kmPerPx() * 80
      const h = (v.heading * Math.PI) / 180
      const mv = (fx: number, fy: number) => panBy(v, (fx * Math.cos(h) - fy * Math.sin(h)) * step, (fy * Math.cos(h) + fx * Math.sin(h)) * step)
      const map: Record<string, () => View> = {
        ArrowUp: () => mv(0, 1),
        ArrowDown: () => mv(0, -1),
        ArrowLeft: () => mv(-1, 0),
        ArrowRight: () => mv(1, 0),
        '+': () => ({ ...v, alt: v.alt / 1.4 }),
        '=': () => ({ ...v, alt: v.alt / 1.4 }),
        '-': () => ({ ...v, alt: v.alt * 1.4 }),
        q: () => ({ ...v, heading: v.heading - 10 }),
        e: () => ({ ...v, heading: v.heading + 10 }),
        w: () => ({ ...v, tilt: v.tilt + 8 }),
        s: () => ({ ...v, tilt: v.tilt - 8 }),
      }
      const fn = map[e.key]
      if (!fn) return
      e.preventDefault()
      s.anim = null
      setView(fn())
    })

    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight)
      camera.updateProjectionMatrix()
      s.dirty = true
    })
    ro.observe(el)

    let raf = 0
    let lastHud = 0
    const tmp = new THREE.Vector3()
    const loop = (now: number) => {
      if (s.anim) {
        const a = s.anim
        const f = Math.min(1, (now - a.t0) / a.dur)
        const e2 = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2
        // great-circle interpolation of the look-at point, altitude arcs up for long hops
        const P0 = lonLatToWorld(a.from.lon, a.from.lat)
        const P1 = lonLatToWorld(a.to.lon, a.to.lat)
        const m = worldToLonLat(P0.clone().lerp(P1, e2))
        const hop = P0.distanceTo(P1)
        const peak = Math.max(a.from.alt, a.to.alt, hop * 0.8)
        const alt = f < 0.5 ? a.from.alt + (peak - a.from.alt) * Math.sin(Math.PI * f) : a.to.alt + (peak - a.to.alt) * Math.sin(Math.PI * f)
        s.view = clampView({ lon: m.lon, lat: m.lat, alt: hop > 50 ? alt : a.from.alt + (a.to.alt - a.from.alt) * e2, heading: a.from.heading + (a.to.heading - a.from.heading) * e2, tilt: a.from.tilt + (a.to.tilt - a.from.tilt) * e2 })
        if (f >= 1) s.anim = null
        s.dirty = true
      }
      if (s.dirty) {
        s.dirty = false
        const fr = applyView(camera, s.view, groundKm(s.view))
        tiles.update(camera, el.clientHeight)
        // shadow camera follows the view: an orthographic box around the look-at point, oriented to the true Sun
        const shadows = tiles.lit && s.view.alt < 1500
        sun.castShadow = shadows
        if (shadows) {
          const ext = Math.max(15, Math.min(450, s.view.alt * 1.6))
          sun.target.position.copy(fr.P)
          sun.position.copy(fr.P).add(s.sunDir.clone().multiplyScalar(700))
          const sc = sun.shadow.camera
          sc.left = -ext
          sc.right = ext
          sc.top = ext
          sc.bottom = -ext
          sc.near = 1
          sc.far = 1400
          sc.updateProjectionMatrix()
          sun.target.updateMatrixWorld()
        } else sun.position.copy(s.sunDir).multiplyScalar(10000)
        renderer.render(scene, camera)
        // labels
        const box = el.getBoundingClientRect()
        const placed: [number, number, number, number][] = []
        const prio = (m: Marker) => (m.kind === 'selected' ? 0 : m.kind === 'top' ? 1 : 2)
        for (const mk of [...s.markers].sort((a, b) => prio(a) - prio(b))) {
          const elx = s.labelEls.get(mk.id)
          if (!elx) continue
          let hKm = 0
          if (s.grids && mk.lat < -79.5) {
            const [x, y] = lonLatToXY(mk.lon, mk.lat)
            const hh = heightXY(s.grids, x, y)
            if (!Number.isNaN(hh)) hKm = (hh * tiles.exaggeration) / 1000
          }
          const P = lonLatToWorld(mk.lon, mk.lat, R_MOON_KM + hKm + 0.05, tmp)
          const facing = P.dot(camera.position.clone().sub(P)) > 0
          const q = P.clone().project(camera)
          let vis = facing && q.z < 1 && Math.abs(q.x) < 1.1 && Math.abs(q.y) < 1.1
          const px = ((q.x + 1) / 2) * box.width
          const py = ((1 - q.y) / 2) * box.height
          if (vis && mk.kind === 'site') {
            // hide a site label that would overlap one already placed (selected and Top 3 first)
            const w = 7 * mk.label.length + 18
            const r: [number, number, number, number] = [px, py - 12, px + w, py + 10]
            if (placed.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) vis = false
            else placed.push(r)
          } else if (vis) placed.push([px - 16, py - 30, px + 16, py + 6])
          elx.style.display = vis ? '' : 'none'
          if (vis) elx.style.transform = `translate(${px}px, ${py}px)`
        }
        if (now - lastHud > 250) {
          lastHud = now
          setHud({ resM: tiles.stats.resM, loading: tiles.stats.loading, alt: s.view.alt, heading: s.view.heading, tilt: Math.min(s.view.tilt, maxTilt(s.view.alt)) })
          onViewRef.current?.(s.view, { resM: tiles.stats.resM, loading: tiles.stats.loading })
        }
        if (tiles.stats.loading > 0) s.dirty = true
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    onReadyRef.current?.({
      zoom: (f) => {
        s.anim = { from: { ...s.view }, to: clampView({ ...s.view, alt: s.view.alt * f }), t0: performance.now(), dur: 350 }
      },
      resetNorth: () => {
        s.anim = { from: { ...s.view }, to: clampView({ ...s.view, heading: s.view.heading > 180 ? 360 : 0, tilt: 0 }), t0: performance.now(), dur: 500 }
      },
      flyTo: (lon, lat, alt, tilt) => {
        s.anim = { from: { ...s.view }, to: clampView({ lon, lat, alt: alt ?? Math.min(s.view.alt, 120), heading: s.view.heading, tilt: tilt ?? (alt !== undefined && alt > 3000 ? 0 : 50) }), t0: performance.now(), dur: 1600 }
      },
    })
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  // markers → label elements
  useEffect(() => {
    const s = st.current
    const box = labels.current
    if (!s || !box) return
    const keep = new Set(markers.map((m) => m.id))
    for (const [id, elx] of s.labelEls)
      if (!keep.has(id)) {
        elx.remove()
        s.labelEls.delete(id)
      }
    for (const m of markers) {
      let elx = s.labelEls.get(m.id)
      if (!elx) {
        elx = document.createElement('button')
        elx.className = `pin pin-${m.kind}`
        box.appendChild(elx)
        s.labelEls.set(m.id, elx)
      }
      elx.className = `pin pin-${m.kind}`
      elx.textContent = m.label
      elx.title = m.label
      elx.onclick = m.onClick ?? null
      elx.dataset.testid = `pin-${m.id}`
    }
    s.markers = markers
    s.dirty = true
  }, [markers])

  // Sun direction and lighting mode
  useEffect(() => {
    const s = st.current
    if (!s) return
    if (eph && eph.covers(t)) {
      const p = eph.position('SUN', t)
      s.sunDir.copy(meToWorld(p[0], p[1], p[2]).normalize())
    }
    s.tiles.setLit(lit)
    s.ambient.intensity = lit ? 0.06 : 0.22
    s.dirty = true
  }, [eph, t, lit])

  useEffect(() => {
    const s = st.current
    if (!s) return
    s.tiles.setExaggeration(exaggeration)
    s.dirty = true
  }, [exaggeration])

  // fly to the focused site
  useEffect(() => {
    const s = st.current
    if (!s || !focus) return
    const polar = focus.lat < -79.5
    s.anim = { from: { ...s.view }, to: clampView({ lon: focus.lon, lat: focus.lat, alt: polar ? 45 : 900, heading: s.view.heading, tilt: polar ? 50 : 0 }), t0: performance.now(), dur: 1800 }
  }, [focus?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const res = hud.resM
  return (
    <>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div ref={labels} className="pins" aria-label="Map labels" />
      <div className="globe-hud" aria-live="off" data-testid="globe-hud">
        {hud.alt >= 1 ? `${Math.round(hud.alt).toLocaleString('en-GB')} km` : `${Math.round(hud.alt * 1000)} m`} above the surface · detail {res >= 1000 ? `${(res / 1000).toFixed(1)} km` : `${Math.round(res)} m`}/px
        {hud.loading > 0 ? ` · loading ${hud.loading} tiles` : ''}
      </div>
      {hover && (
        <div className="globe-hover" data-testid="globe-hover">
          {hover}
        </div>
      )}
      <Compass heading={hud.heading} tilt={hud.tilt} />
    </>
  )
}

function Compass({ heading, tilt }: { heading: number; tilt: number }) {
  return (
    <div className="compass" aria-hidden="true" title={`Heading ${Math.round(heading)}°, tilt ${Math.round(tilt)}°`}>
      <svg viewBox="-20 -20 40 40" width="40" height="40" style={{ transform: `rotate(${-heading}deg)` }}>
        <circle r="18" fill="rgba(9,15,28,0.85)" stroke="#24324d" />
        <path d="M0 -14 L5 0 L0 -3 L-5 0 Z" fill="#ff6b6b" />
        <path d="M0 14 L5 0 L0 3 L-5 0 Z" fill="#a7b1c4" />
        <text y="-15.5" textAnchor="middle" fontSize="6" fill="#e8ecf4">N</text>
      </svg>
    </div>
  )
}
