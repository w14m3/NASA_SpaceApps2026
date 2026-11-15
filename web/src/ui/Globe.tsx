// 3D globe (three.js on the 1737.4 km sphere): NASA Moon Trek LRO WAC mosaic tiles, lighting from the true Sun
// direction at the mission time, sub-solar and sub-Earth points, curated sites, fly-to. Deviation from the contract's
// CesiumJS suggestion recorded in docs/DECISIONS.md (one 3D engine for globe, Site 3D and directions).
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { subPoint } from '../core/topo'
import type { ResolvedSite } from './data'
import { useEphemeris, useSites } from './hooks'
import { fmtLat, fmtLon } from './i18n'
import { useStore } from './store'
import { selectSite } from './LeftPanel'

const TREK = 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm'
const Z = 2 // 8 × 4 tiles of 256 px

function toThree(lon: number, lat: number, r = 1): THREE.Vector3 {
  const lo = (lon * Math.PI) / 180
  const la = (lat * Math.PI) / 180
  // MOON_ME (x, y, z) -> three (x, z, -y)
  return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo))
}

export default function Globe({ site }: { site: ResolvedSite | null }) {
  const host = useRef<HTMLDivElement>(null)
  const eph = useEphemeris()
  const sites = useSites()
  const tNow = useStore((s) => s.t)
  const [status, setStatus] = useState('loading imagery…')
  const [hover, setHover] = useState<string>('')
  const api = useRef<{ light: THREE.DirectionalLight; sunDot: THREE.Mesh; earthDot: THREE.Mesh; marker: THREE.Mesh; camera: THREE.PerspectiveCamera; controls: OrbitControls; group: THREE.Group } | null>(null)

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#000')
    const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.01, 100)
    camera.position.set(0, -2.2, 2.6)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.minDistance = 1.15
    controls.maxDistance = 8
    // texture from Moon Trek tiles, drawn into a canvas as they arrive (throttled: the service drops bursts)
    const cv = document.createElement('canvas')
    cv.width = 256 * 2 ** (Z + 1)
    cv.height = 256 * 2 ** Z
    const c2 = cv.getContext('2d')!
    c2.fillStyle = '#777'
    c2.fillRect(0, 0, cv.width, cv.height)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 })
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), mat)
    scene.add(globe)
    const group = new THREE.Group()
    scene.add(group)
    // graticule
    const gmat = new THREE.LineBasicMaterial({ color: 0x5a6a85, transparent: true, opacity: 0.35 })
    for (let lat = -80; lat <= 80; lat += 20) {
      const pts = Array.from({ length: 121 }, (_, i) => toThree(-180 + i * 3, lat, 1.002))
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gmat))
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts = Array.from({ length: 91 }, (_, i) => toThree(lon, -90 + i * 2, 1.002))
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gmat))
    }
    const light = new THREE.DirectionalLight(0xffffff, 3)
    scene.add(light)
    scene.add(new THREE.AmbientLight(0xffffff, 0.06))
    const sunDot = new THREE.Mesh(new THREE.SphereGeometry(0.012), new THREE.MeshBasicMaterial({ color: 0xf7bd4a }))
    const earthDot = new THREE.Mesh(new THREE.SphereGeometry(0.012), new THREE.MeshBasicMaterial({ color: 0x5cb2ff }))
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.014), new THREE.MeshBasicMaterial({ color: 0x43c787 }))
    scene.add(sunDot, earthDot, marker)
    api.current = { light, sunDot, earthDot, marker, camera, controls, group }
    let loaded = 0
    let failed = 0
    const nx = 2 ** (Z + 1)
    const ny = 2 ** Z
    const queue: [number, number][] = []
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) queue.push([x, y])
    let alive = true
    const worker = async () => {
      while (alive && queue.length) {
        const [x, y] = queue.shift()!
        await new Promise<void>((res) => {
          const im = new Image()
          im.crossOrigin = 'anonymous'
          im.onload = () => {
            c2.drawImage(im, x * 256, y * 256)
            tex.needsUpdate = true
            loaded++
            res()
          }
          im.onerror = () => {
            failed++
            res()
          }
          im.src = `${TREK}/${Z}/${y}/${x}.jpg`
        })
        setStatus(failed && !loaded ? 'Imagery unavailable (offline or no coverage): grey sphere' : loaded < nx * ny ? `imagery ${loaded}/${nx * ny}` : 'LRO WAC mosaic — NASA/GSFC/Arizona State University via NASA Moon Trek')
      }
    }
    void Promise.all([worker(), worker(), worker()])
    const ray = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const onMove = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(mouse, camera)
      const hit = ray.intersectObject(globe)[0]
      if (hit) {
        const p = hit.point
        const lat = (Math.asin(p.y / p.length()) * 180) / Math.PI
        const lon = (Math.atan2(-p.z, p.x) * 180) / Math.PI
        setHover(`${fmtLat(lat)} ${fmtLon(lon)}`)
      } else setHover('')
    }
    let downAt = 0
    const onDown = () => (downAt = performance.now())
    const onUp = (e: PointerEvent) => {
      if (performance.now() - downAt > 250) return
      const r = renderer.domElement.getBoundingClientRect()
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(mouse, camera)
      const hit = ray.intersectObject(globe)[0]
      if (hit) {
        const p = hit.point
        const lat = (Math.asin(p.y / p.length()) * 180) / Math.PI
        const lon = (Math.atan2(-p.z, p.x) * 180) / Math.PI
        selectSite({ kind: 'custom', lat, lon }, [])
      }
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
    })
    ro.observe(el)
    let raf = 0
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  // sites
  useEffect(() => {
    const g = api.current?.group
    if (!g) return
    g.clear()
    for (const s of sites) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.007), new THREE.MeshBasicMaterial({ color: s.status === 'verified' ? 0xe8ecf4 : 0xa7b1c4 }))
      m.position.copy(toThree(s.lon, s.lat, 1.003))
      g.add(m)
    }
  }, [sites])
  // lighting from the true Sun direction
  useEffect(() => {
    const a = api.current
    if (!a || !eph || !eph.covers(tNow)) return
    const ss = subPoint(eph, 'SUN', tNow)
    const se = subPoint(eph, 'EARTH', tNow)
    a.light.position.copy(toThree(ss.lon, ss.lat, 10))
    a.sunDot.position.copy(toThree(ss.lon, ss.lat, 1.01))
    a.earthDot.position.copy(toThree(se.lon, se.lat, 1.01))
  }, [eph, tNow])
  // fly to the selected site
  useEffect(() => {
    const a = api.current
    if (!a || !site) return
    a.marker.position.copy(toThree(site.lon, site.lat, 1.004))
    const target = toThree(site.lon, site.lat, 2.4)
    const start = a.camera.position.clone()
    let k = 0
    const step = () => {
      k = Math.min(1, k + 0.05)
      a.camera.position.copy(start.clone().lerp(target, k * k * (3 - 2 * k)))
      if (k < 1) requestAnimationFrame(step)
    }
    step()
  }, [site?.lon, site?.lat]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} data-testid="globe" />
      <div className="probe">
        {hover || 'drag to rotate · wheel to zoom · click to analyse a point'} · <span style={{ color: 'var(--sun)' }}>●</span> sub-solar <span style={{ color: 'var(--earth)' }}>●</span> sub-Earth
      </div>
      <div className="exag">{status}</div>
    </>
  )
}
