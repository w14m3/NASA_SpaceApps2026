// Site 3D (contract §6.6): LOLA 240 m terrain around the site (local east/north metres, lunar curvature included),
// lit by the true Sun direction at the mission time with real-time shadow maps, Sun and Earth markers on a sky dome,
// the Sun path over the window, vertical exaggeration ×1 by default (labelled otherwise).
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ResolvedSite } from './data'
import { useAsync } from './hooks'
import { useCurrentSite, useInstant } from './current'
import { rpc } from './workerClient'

const HALF_KM = 12
const N = 161

// local frame: east = +x, up = +y, north = -z
function dir(az: number, el: number, r: number) {
  const a = (az * Math.PI) / 180
  const e = (el * Math.PI) / 180
  return new THREE.Vector3(r * Math.cos(e) * Math.sin(a), r * Math.sin(e), -r * Math.cos(e) * Math.cos(a))
}

export default function Site3D({ site }: { site: ResolvedSite | null }) {
  const host = useRef<HTMLDivElement>(null)
  const inst = useInstant(site)
  const { analysis } = useCurrentSite()
  const [exag, setExag] = useState(1)
  const [fps, setFps] = useState(0)
  const patch = useAsync(site && site.terrain !== 'sphere' ? `${site.lon},${site.lat}` : null, () => rpc.demPatch({ lon: site!.lon, lat: site!.lat, halfKm: HALF_KM, n: N }))
  const api = useRef<{ sun: THREE.DirectionalLight; sunMark: THREE.Mesh; earthMark: THREE.Mesh; mesh: THREE.Mesh | null; scene: THREE.Scene; path: THREE.Line | null; base: Float32Array | null } | null>(null)

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#000')
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 10, 200_000)
    camera.position.set(-9000, 6000, 9000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.495
    const sun = new THREE.DirectionalLight(0xffffff, 3.2)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    const sc = sun.shadow.camera
    sc.left = -HALF_KM * 1100
    sc.right = HALF_KM * 1100
    sc.top = HALF_KM * 1100
    sc.bottom = -HALF_KM * 1100
    sc.near = 1000
    sc.far = 120_000
    sun.shadow.bias = -0.0004
    scene.add(sun, sun.target)
    scene.add(new THREE.AmbientLight(0x8899bb, 0.03))
    const sunMark = new THREE.Mesh(new THREE.SphereGeometry(500), new THREE.MeshBasicMaterial({ color: 0xfff4d6 }))
    const earthMark = new THREE.Mesh(new THREE.SphereGeometry(900), new THREE.MeshBasicMaterial({ color: 0x5cb2ff }))
    scene.add(sunMark, earthMark)
    // site marker: a 10 m pole would be invisible at this scale, so a labelled beacon is drawn (not to scale)
    const beacon = new THREE.Mesh(new THREE.ConeGeometry(120, 600, 12), new THREE.MeshBasicMaterial({ color: 0x43c787 }))
    beacon.position.set(0, 300, 0)
    beacon.rotation.x = Math.PI
    scene.add(beacon)
    api.current = { sun, sunMark, earthMark, mesh: null, scene, path: null, base: null }
    let frames = 0
    let last = performance.now()
    let raf = 0
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      frames++
      const now = performance.now()
      if (now - last > 1000) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    const a = api.current
    if (!a || !patch.data) return
    if (a.mesh) a.scene.remove(a.mesh)
    const p = patch.data
    const g = new THREE.PlaneGeometry(2 * p.half, 2 * p.half, p.n - 1, p.n - 1)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) pos.setY(i, p.z[i] * exag)
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 1, metalness: 0, flatShading: false }))
    m.castShadow = true
    m.receiveShadow = true
    a.scene.add(m)
    a.mesh = m
  }, [patch.data, exag])

  useEffect(() => {
    const a = api.current
    if (!a || !inst) return
    const s = dir(inst.sun.az, inst.sun.el, 60_000)
    a.sun.position.copy(s)
    a.sun.target.position.set(0, 0, 0)
    a.sunMark.position.copy(dir(inst.sun.az, Math.max(inst.sun.el, -2), 40_000))
    a.earthMark.position.copy(dir(inst.earth.az, inst.earth.el, 40_000))
    a.sun.intensity = inst.sun.el > -1 ? 3.2 : 0
  }, [inst])

  useEffect(() => {
    const a = api.current
    if (!a || !analysis) return
    if (a.path) a.scene.remove(a.path)
    const pts = analysis.hourly.map((s) => dir(s.sunAz, s.sunEl, 40_000))
    a.path = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf7bd4a, transparent: true, opacity: 0.6 }))
    a.scene.add(a.path)
  }, [analysis])

  return (
    <>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} data-testid="site3d" />
      {site?.terrain === 'sphere' && <div className="float solar" style={{ top: 120 }}>No terrain data at this site (3D needs 80–90°S).</div>}
      <div className="float" style={{ bottom: 50, right: 10 }}>
        <label className="row">
          <span className="hint">vertical ×{exag}</span>
          <input type="range" min={1} max={5} value={exag} onChange={(e) => setExag(Number(e.target.value))} aria-label="Vertical exaggeration" data-testid="exag" />
        </label>
        <div className="hint" data-testid="fps">{fps} fps</div>
      </div>
      <div className="exag">
        {exag === 1 ? 'True scale (×1)' : `Vertical ×${exag}, for visibility`} · {2 * HALF_KM} × {2 * HALF_KM} km, {patch.data?.label ?? 'LOLA 240 m'} · lit by the true Sun direction with shadow maps · green beacon marks the site (not to scale) · yellow line: Sun path over the window
      </div>
    </>
  )
}
