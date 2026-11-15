// O2 (contract §10): new horizon masks vs the reference/v1 masks for the 13 curated south-pole sites at 2 m and 10 m,
// on the same inputs v1 used: LOLA 80 m (80-90 S) then LOLA 240 m (60-90 S), 1440 azimuths, s_max 300 km.
// Writes data/validation/O2.json. Needs data/cache/dem (python codex/fetch_nasa_data.py, then
// python pipeline/scripts/export_dem_raw.py).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { computeHorizon } from '../src/core/horizon'
import { maskFromV1, type V1MaskFile } from '../src/core/mask'
import { loadCachedDem } from '../src/core/cachedem'
import { record } from '../src/core/record'
import { ROOT } from '../src/core/testdata'

const g80 = loadCachedDem('LDEM_80S_80MPP_ADJ', 'LOLA 80 m', 0.29)
const g240 = loadCachedDem('LDEM_60S_240MPP_ADJ', 'LOLA 240 m (60°S)', 3)
const dir = join(ROOT, 'reference/v1/web/public/data/masks')
const sites = JSON.parse(readFileSync(join(ROOT, 'reference/v1/web/public/data/sites.json'), 'utf8')) as { id: string; lon: number; lat: number }[]
const out: Record<string, unknown> = {}
let worst = 0
let worstRef = 0
let worstZ0 = 0
for (const f of readdirSync(dir).sort()) {
  const v1 = JSON.parse(readFileSync(join(dir, f), 'utf8')) as V1MaskFile
  const s = sites.find((x) => x.id === v1.id)!
  const row: Record<string, number> = {}
  for (const h of ['2', '10']) {
    const m1 = maskFromV1(v1, h)
    const a = computeHorizon([g80, g240], s.lon, s.lat, Number(h), { nAz: v1.n_az, bands: false, refine: false })!
    const b = computeHorizon([g80, g240], s.lon, s.lat, Number(h), { nAz: v1.n_az, bands: false, refine: true })!
    let d = 0
    let dr = 0
    let ss = 0
    for (let i = 0; i < v1.n_az; i++) {
      const e = Math.abs(a.mask.mid[i] - m1.mid[i])
      d = Math.max(d, e)
      ss += e * e
      dr = Math.max(dr, Math.abs(b.mask.mid[i] - m1.mid[i]))
    }
    row[`max_h${h}`] = d
    row[`rms_h${h}`] = Math.sqrt(ss / v1.n_az)
    row[`refined_max_h${h}`] = dr
    worst = Math.max(worst, d)
    worstRef = Math.max(worstRef, dr)
    worstZ0 = Math.max(worstZ0, Math.abs(a.z0 - v1.z0))
  }
  out[v1.id] = row
  console.log(v1.id, JSON.stringify(row))
}
record('O2', {
  test: 'Oracle: new horizon masks (web/src/core/horizon.ts, refinement off) vs reference/v1 precomputed masks for the 13 curated south-pole sites at 2 m and 10 m, same inputs (LOLA 80 m then LOLA 240 m 60°S, 1440 azimuths, 300 km); v1 masks are quantised at 0.002°. The production refinement (D5) is reported separately',
  criterion: '<= 0.05 deg (report max, explain differences)',
  measured: { per_site: out, max_deg: worst, refined_max_deg: worstRef, max_z0_diff_m: worstZ0 },
  summary: `max ${worst.toFixed(4)}° over 26 masks × 1440 azimuths (with golden-section refinement: ${worstRef.toFixed(3)}°)`,
  pass: worst <= 0.05,
})
console.log('O2 max', worst, 'refined', worstRef, 'z0', worstZ0)
