// NASA Moon Trek south-polar WMTS layers (read 2026-11-15 from the Trek catalogue service and each layer's
// WMTSCapabilities.xml): tile matrix set "default028mm", top-left corner (−1,095,930 m, +1,095,930 m) in the south
// polar stereographic frame, 256-px tiles, level-0 scale denominator 3.0578404e7 (0.28 mm pixels → 8,561.95 m/px),
// halving per level. CORS "*". A missing tile (404) means no coverage and is drawn as nothing.
export interface TrekLayer {
  key: string
  id: string
  title: string
  maxZ: number
  /** half-width of the layer extent, m */
  half: number
}

export const TREK_LAYERS: TrekLayer[] = [
  { key: 'trek-lola10', id: 'LRO_LOLA_Shade_SPolar875_10m', title: 'LOLA 10 m shaded relief (87.5–90°S)', maxZ: 8, half: 75_840 },
  { key: 'trek-lola30', id: 'LRO_LOLA_Shade_SPole75_30mp_v04', title: 'LOLA 30 m shaded relief (75–90°S)', maxZ: 6, half: 457_440 },
  { key: 'trek-wac', id: 'LRO_WAC_Mosaic_SPole60_100m_v02', title: 'LRO WAC mosaic (60–90°S)', maxZ: 5, half: 1_095_700 },
  { key: 'trek-psr', id: 'LRO_LOLA_Illumination_SPole65S_240m', title: 'LOLA permanently shadowed regions 240 m', maxZ: 3, half: 770_640 },
]

const X0 = -1_095_930
const Y0 = 1_095_930
const R0 = 3.0578404017857101e7 * 0.00028

export function trekRes(z: number) {
  return R0 / 2 ** z
}

const cache = new Map<string, HTMLImageElement | 'missing' | 'loading'>()
const queue: { url: string; onload: () => void }[] = []
let active = 0
const MAX_ACTIVE = 4 // the service drops connections when hit in rapid bursts (reference/v1 HANDOFF)

function pump() {
  while (active < MAX_ACTIVE && queue.length) {
    const { url, onload } = queue.shift()!
    active++
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => {
      cache.set(url, im)
      active--
      onload()
      pump()
    }
    im.onerror = () => {
      cache.set(url, 'missing')
      active--
      pump()
    }
    im.src = url
  }
}

/** Draw the tiles of `layer` covering the view; `X`/`Y` map polar metres to screen; `s` = screen px per metre. */
export function drawTrek(ctx: CanvasRenderingContext2D, layer: TrekLayer, X: (x: number) => number, Y: (y: number) => number, s: number, view: { x0: number; x1: number; y0: number; y1: number }, onload: () => void, alpha = 1) {
  const z = Math.max(0, Math.min(layer.maxZ, Math.round(Math.log2(R0 * s))))
  const res = trekRes(z)
  const size = 256 * res
  const c0 = Math.max(0, Math.floor((Math.max(view.x0, -layer.half) - X0) / size))
  const c1 = Math.floor((Math.min(view.x1, layer.half) - X0) / size)
  const r0 = Math.max(0, Math.floor((Y0 - Math.min(view.y1, layer.half)) / size))
  const r1 = Math.floor((Y0 - Math.max(view.y0, -layer.half)) / size)
  if ((c1 - c0 + 1) * (r1 - r0 + 1) > 120) return z
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.imageSmoothingEnabled = true
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const url = `https://trek.nasa.gov/tiles/Moon/SP/${layer.id}/1.0.0/default/default028mm/${z}/${r}/${c}.png`
      const t = cache.get(url)
      if (t === undefined) {
        cache.set(url, 'loading')
        queue.push({ url, onload })
        continue
      }
      if (t === 'loading' || t === 'missing') continue
      const x = X0 + c * size
      const y = Y0 - r * size
      ctx.drawImage(t, X(x), Y(y), size * s + 0.5, size * s + 0.5)
    }
  ctx.restore()
  pump()
  return z
}
