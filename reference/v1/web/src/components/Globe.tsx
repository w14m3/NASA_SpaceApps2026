// 3D Moon: CesiumJS on the lunar sphere, Moon Trek WAC mosaic, Sun direction from the ephemeris.
import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { Ephemeris } from '../core/ephem'
import { subPoint } from '../core/geom'
import type { SiteInfo } from '../state'

declare const CESIUM_BASE_URL: string
;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = CESIUM_BASE_URL

// Everything below is on the Moon: sphere R = 1737.4 km (Cesium.Ellipsoid.MOON), body-fixed MOON_ME.
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON

const TREK_WAC =
  'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.jpg'

const CAT_COLOR: Record<string, string> = {
  apollo: '#f2c14e',
  clps: '#5ad1c8',
  international: '#c79bff',
  poi: '#ff8f6b',
  custom: '#ffffff',
}

interface Props {
  eph: Ephemeris
  t: number
  sites: SiteInfo[]
  pins: string[]
  active: string | null
  onSelect: (id: string) => void
  onPick: (lat: number, lon: number) => void
  flyTo: SiteInfo | null
}

export default function Globe({ eph, t, sites, pins, active, onSelect, onPick, flyTo }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const markers = useRef<Cesium.CustomDataSource | null>(null)
  const sky = useRef<{ sun: Cesium.Entity; earth: Cesium.Entity; term: Cesium.Entity } | null>(null)
  const cb = useRef({ onSelect, onPick })
  cb.current = { onSelect, onPick }

  useEffect(() => {
    if (!el.current) return
    const viewer = new Cesium.Viewer(el.current, {
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      timeline: false,
      animation: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      skyAtmosphere: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    })
    viewerRef.current = viewer
    const scene = viewer.scene
    scene.globe.baseColor = Cesium.Color.fromCssColorString('#3a3d42')
    scene.globe.showGroundAtmosphere = false
    scene.globe.enableLighting = true
    scene.globe.dynamicAtmosphereLighting = false
    scene.globe.lightingFadeInDistance = 2
    scene.globe.lightingFadeOutDistance = 1
    scene.fog.enabled = false
    if (scene.moon) scene.moon.show = false
    if (scene.sun) scene.sun.show = false
    if (scene.skyBox) scene.skyBox.show = false
    scene.backgroundColor = Cesium.Color.fromCssColorString('#05070b')
    scene.screenSpaceCameraController.minimumZoomDistance = 2_000
    scene.screenSpaceCameraController.maximumZoomDistance = 20_000_000
    ;(viewer.cesiumWidget.creditContainer as HTMLElement).classList.add('cesium-credits')

    const provider = new Cesium.UrlTemplateImageryProvider({
      url: TREK_WAC.replace('{TileMatrix}', '{z}').replace('{TileRow}', '{y}').replace('{TileCol}', '{x}'),
      tilingScheme: new Cesium.GeographicTilingScheme({ ellipsoid: Cesium.Ellipsoid.MOON }),
      maximumLevel: 8,
      credit: new Cesium.Credit('Imagery: LRO WAC global mosaic (NASA/GSFC/Arizona State University) via NASA Moon Trek'),
    })
    viewer.imageryLayers.addImageryProvider(provider)

    const ds = new Cesium.CustomDataSource('sites')
    viewer.dataSources.add(ds)
    markers.current = ds

    const mk = (name: string, color: string) =>
      viewer.entities.add({
        name,
        position: Cesium.Cartesian3.ZERO,
        point: { pixelSize: 11, color: Cesium.Color.fromCssColorString(color), outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
        label: {
          text: name,
          font: '12px sans-serif',
          fillColor: Cesium.Color.fromCssColorString(color),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -16),
        },
      })
    sky.current = {
      sun: mk('Sub-solar point', '#ffb627'),
      earth: mk('Sub-Earth point', '#5aa9ff'),
      term: viewer.entities.add({
        name: 'Terminator',
        polyline: { positions: [], width: 2, material: Cesium.Color.fromCssColorString('#ffb627').withAlpha(0.7), arcType: Cesium.ArcType.NONE },
      }),
    }

    viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(20, -62, 5_200_000) })

    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas)
    handler.setInputAction((ev: { position: Cesium.Cartesian2 }) => {
      const picked = scene.pick(ev.position)
      const id = picked?.id?.properties?.siteId?.getValue?.()
      if (id) cb.current.onSelect(id)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    const pickGround = (ev: { position: Cesium.Cartesian2 }) => {
      const p = viewer.camera.pickEllipsoid(ev.position, Cesium.Ellipsoid.MOON)
      if (!p) return
      const c = Cesium.Cartographic.fromCartesian(p, Cesium.Ellipsoid.MOON)
      cb.current.onPick(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude))
    }
    handler.setInputAction(pickGround, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    handler.setInputAction(pickGround, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
    viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

    return () => {
      handler.destroy()
      viewer.destroy()
      viewerRef.current = null
    }
  }, [])

  // time-aware lighting, sub-points, terminator
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !sky.current) return
    const s = eph.position('SUN', t)
    const n = Math.hypot(s[0], s[1], s[2])
    viewer.scene.light = new Cesium.DirectionalLight({
      direction: new Cesium.Cartesian3(-s[0] / n, -s[1] / n, -s[2] / n),
      intensity: 2.2,
    })
    const ss = subPoint(eph, 'SUN', t)
    const se = subPoint(eph, 'EARTH', t)
    sky.current.sun.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(ss.lon, ss.lat, 3000))
    sky.current.earth.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(se.lon, se.lat, 3000))
    // terminator: great circle 90 deg from the sub-solar direction
    const u = new Cesium.Cartesian3(s[0] / n, s[1] / n, s[2] / n)
    const a = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(u, Math.abs(u.z) < 0.9 ? Cesium.Cartesian3.UNIT_Z : Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3()), new Cesium.Cartesian3())
    const b = Cesium.Cartesian3.cross(u, a, new Cesium.Cartesian3())
    const R = 1_737_400 + 2500
    const pts: Cesium.Cartesian3[] = []
    for (let i = 0; i <= 180; i++) {
      const th = (i / 180) * 2 * Math.PI
      pts.push(new Cesium.Cartesian3(
        R * (a.x * Math.cos(th) + b.x * Math.sin(th)),
        R * (a.y * Math.cos(th) + b.y * Math.sin(th)),
        R * (a.z * Math.cos(th) + b.z * Math.sin(th)),
      ))
    }
    sky.current.term.polyline!.positions = new Cesium.ConstantProperty(pts)
    viewer.scene.requestRender()
  }, [eph, t])

  // site markers
  useEffect(() => {
    const ds = markers.current
    const viewer = viewerRef.current
    if (!ds || !viewer) return
    ds.entities.removeAll()
    for (const s of sites) {
      const pinned = pins.includes(s.id)
      const isActive = s.id === active
      const color = Cesium.Color.fromCssColorString(CAT_COLOR[s.category] ?? '#fff')
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 1500),
        properties: { siteId: s.id },
        point: {
          pixelSize: isActive ? 15 : pinned ? 12 : 8,
          color,
          outlineColor: isActive ? Cesium.Color.WHITE : Cesium.Color.BLACK,
          outlineWidth: isActive ? 3 : 1.5,
          disableDepthTestDistance: 0,
        },
        label: {
          text: s.name,
          show: pinned || isActive || s.category !== 'poi',
          font: (isActive ? 'bold ' : '') + '12px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(10, -10),
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          distanceDisplayCondition: pinned || isActive ? undefined : new Cesium.DistanceDisplayCondition(0, 6_000_000),
        },
      })
    }
    viewer.scene.requestRender()
  }, [sites, pins, active])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !flyTo) return
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(flyTo.lon, flyTo.lat, flyTo.lat < -80 ? 500_000 : 1_200_000),
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1.4,
    })
  }, [flyTo])

  return <div ref={el} className="globe" aria-label="3D Moon globe. Click a marker to select a site; double-click or right-click the surface to drop a custom site." />
}
