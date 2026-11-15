// Build candidate grids for the hero regions (contract §7.11). One child process per region.
// Usage: npx tsx scripts/build-candidates.ts            (all regions, in parallel)
//        npx tsx scripts/build-candidates.ts <regionId> (one region)
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { computeHorizon } from '../src/core/horizon'
import { planeFit } from '../src/core/safety'
import { gridPoints } from '../src/core/candidates'
import { CANDIDATE_HEIGHTS, CANDIDATE_NAZ, HERO_REGIONS, MASK_STEP_DEG } from '../src/core/regions'
import { PUBLIC, testDem } from '../src/core/testdata'
import { hasCachedDem, loadCachedDem } from '../src/core/cachedem'
import type { DemGrid } from '../src/core/dem'

const OUT = join(PUBLIC, 'data', 'candidates')

/** Terrain: LOLA 80 m (80–90°S) then LOLA 240 m (60–90°S) when the NASA products are in data/cache (preferred, the
 *  same inputs as the validated curated masks, O2); otherwise the committed 240 m artifact. */
async function terrain(): Promise<{ grids: DemGrid[]; fine: DemGrid; baseline: number; label: string }> {
  if (hasCachedDem('LDEM_80S_80MPP_ADJ') && hasCachedDem('LDEM_60S_240MPP_ADJ')) {
    const g80 = loadCachedDem('LDEM_80S_80MPP_ADJ', 'LOLA 80 m', 0.29)
    const g240 = loadCachedDem('LDEM_60S_240MPP_ADJ', 'LOLA 240 m', 3)
    return { grids: [g80, g240], fine: g80, baseline: 240, label: 'LOLA 80 m + 240 m' }
  }
  const g = await testDem()
  return { grids: [g], fine: g, baseline: 720, label: g.label }
}

async function one(id: string) {
  const region = HERO_REGIONS.find((r) => r.id === id)!
  const { grids, fine, baseline: BASELINE, label } = await terrain()
  const { nx, pts } = gridPoints(region)
  const n = pts.length
  const f = (k: number) => new Float32Array(n)
  const [lon, lat, x, y, z0, slope, downhill, rough] = [0, 1, 2, 3, 4, 5, 6, 7].map(f)
  const offs = CANDIDATE_HEIGHTS.map(() => new Int16Array(n))
  const masks = CANDIDATE_HEIGHTS.map(() => new Uint8Array(n * CANDIDATE_NAZ))
  const near = CANDIDATE_HEIGHTS.map(() => new Uint8Array(n))
  let clipped = 0
  const t0 = Date.now()
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    lon[i] = p.lon
    lat[i] = p.lat
    x[i] = p.x
    y[i] = p.y
    const pf = planeFit(fine, p.lon, p.lat, BASELINE)
    slope[i] = pf ? pf.slope : NaN
    downhill[i] = pf ? pf.downhill : NaN
    rough[i] = pf ? pf.roughness : NaN
    CANDIDATE_HEIGHTS.forEach((h, hi) => {
      const r = computeHorizon(grids, p.lon, p.lat, h, { nAz: CANDIDATE_NAZ, bands: false })
      if (!r) return
      z0[i] = r.z0
      let mn = Infinity
      for (let k = 0; k < CANDIDATE_NAZ; k++) mn = Math.min(mn, r.mask.mid[k])
      const off = Math.floor(mn / MASK_STEP_DEG)
      offs[hi][i] = off
      for (let k = 0; k < CANDIDATE_NAZ; k++) {
        let q = Math.round(r.mask.mid[k] / MASK_STEP_DEG - off)
        if (q > 255) {
          q = 255
          clipped++
        }
        masks[hi][i * CANDIDATE_NAZ + k] = q
      }
      near[hi][i] = Math.round((r.mask.nearShare ?? 0) * 100)
    })
    if (i % 500 === 0) console.log(`${id}: ${i}/${n} (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  }
  const parts: Uint8Array[] = []
  for (const a of [lon, lat, x, y, z0, slope, downhill, rough]) parts.push(new Uint8Array(a.buffer))
  CANDIDATE_HEIGHTS.forEach((_, hi) => {
    parts.push(new Uint8Array(offs[hi].buffer), masks[hi], near[hi])
    const used = n * 2 + n * CANDIDATE_NAZ + n
    const pad = Math.ceil(used / 4) * 4 - used
    if (pad) parts.push(new Uint8Array(pad))
  })
  const total = parts.reduce((s, p) => s + p.length, 0)
  const buf = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    buf.set(p, o)
    o += p.length
  }
  mkdirSync(OUT, { recursive: true })
  const gz = gzipSync(buf, { level: 9 })
  writeFileSync(join(OUT, `${id}.bin.gz`), gz)
  const meta = {
    region,
    n,
    nx,
    heights: [...CANDIDATE_HEIGHTS],
    n_az: CANDIDATE_NAZ,
    mask_step_deg: MASK_STEP_DEG,
    slope_baseline_m: BASELINE,
    dem_label: label,
    finest_px: fine.px,
    clipped_mask_values: clipped,
    file: `${id}.bin.gz`,
    bytes_gzip: gz.length,
    built_utc: new Date().toISOString(),
    seconds: (Date.now() - t0) / 1000,
    method: `computeHorizon (web/src/core/horizon.ts) on ${label}, 360 azimuths, s_max 300 km, refinement on, no bands; planeFit over a ${BASELINE} m disk (3 pixels of the finest grid)`,
  }
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify(meta, null, 1))
  console.log(`${id}: done, ${n} candidates, ${(gz.length / 1e6).toFixed(2)} MB gzip, ${meta.seconds.toFixed(0)} s, clipped ${clipped}`)
}

const arg = process.argv[2]
if (arg) await one(arg)
else {
  await Promise.all(
    HERO_REGIONS.map(
      (r) =>
        new Promise<void>((res, rej) => {
          const c = spawn(process.execPath, ['--import', 'tsx', 'scripts/build-candidates.ts', r.id], { stdio: 'inherit' })
          c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${r.id} failed`))))
        }),
    ),
  )
  writeFileSync(join(OUT, 'index.json'), JSON.stringify({ regions: HERO_REGIONS.map((r) => r.id) }, null, 1))
}
