// Fixes reference/v1 defect 1: IM-1 Odysseus (80.13°S) lies inside the LOLA 80 m product, but v1 computed its
// horizon on the 240 m grid only ("site lies outside the 80 m product"). Recomputes the mask at 2 m and 10 m on the
// LOLA 80 m + 240 m (60°S) cascade with the uncertainty band (σ = median of the 80 m _ERR raster, 3 m for 240 m) and
// writes it in the v1 mask format to web/public/data/masks/im1_odysseus.json. Needs data/cache/dem.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeHorizon } from '../src/core/horizon'
import { loadCachedDem, CACHE_DEM } from '../src/core/cachedem'
import { PUBLIC } from '../src/core/testdata'

const errMed = JSON.parse(readFileSync(join(CACHE_DEM, 'LDEM_80S_80MPP_ADJ_ERR.json'), 'utf8')).median as number
const g80 = loadCachedDem('LDEM_80S_80MPP_ADJ', 'LOLA 80 m', errMed)
const g240 = loadCachedDem('LDEM_60S_240MPP_ADJ', 'LOLA 240 m (60°S)', 3)
const sites = JSON.parse(readFileSync(join(PUBLIC, 'data/sites.json'), 'utf8')).sites
const s = sites.find((x: { id: string }) => x.id === 'im1_odysseus')
const b64 = (a: Float32Array, scale: number) => {
  const i16 = new Int16Array(a.length)
  for (let k = 0; k < a.length; k++) i16[k] = Math.max(-32768, Math.min(32767, Math.round(a[k] / scale)))
  return Buffer.from(i16.buffer).toString('base64')
}
const heights: Record<string, { mid: string; lo: string; hi: string; dist: string }> = {}
let z0 = 0
for (const h of [2, 10]) {
  const r = computeHorizon([g80, g240], s.lon, s.lat, h, { nAz: 1440 })!
  z0 = r.z0
  heights[String(h)] = { mid: b64(r.mask.mid, 0.002), lo: b64(r.mask.lo, 0.002), hi: b64(r.mask.hi, 0.002), dist: b64(r.mask.dist!, 0.01) }
  console.log(`h=${h}: near_share ${r.mask.nearShare?.toFixed(3)}, z0 ${r.z0.toFixed(1)} m`)
}
writeFileSync(
  join(PUBLIC, 'data/masks/im1_odysseus.json'),
  JSON.stringify({ id: 'im1_odysseus', n_az: 1440, scale_deg: 0.002, s_max_km: 300, label: 'LOLA 80 m + 240 m (precomputed by Sightline; replaces the v1 240 m-only mask, defect 1)', z0, heights, z0_err: errMed, max_void_frac: 0 }),
)
