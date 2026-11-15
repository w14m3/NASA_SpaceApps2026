// Prints a computed "Who blocks the Sun" example for the docs (Connecting Ridge site 001 and Malapert M1, 2 m mast).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { maskFromV1, type V1MaskFile } from '../src/core/mask'
import { siteFrame } from '../src/core/topo'
import { intervals } from '../src/core/events'
import { bodyFn, DEFAULT_THRESHOLDS } from '../src/core/analysis'
import { whoBlocks } from '../src/core/whoblocks'
import { testEphemeris, PUBLIC } from '../src/core/testdata'
const eph = await testEphemeris()
const sites = JSON.parse(readFileSync(join(PUBLIC, 'data/sites.json'), 'utf8')).sites
for (const id of ['poi_site001_connecting_ridge', 'poi_bussey2010_M1_malapert']) for (const h of ['2', '10']) {
  const f = JSON.parse(readFileSync(join(PUBLIC, 'data/masks', id + '.json'), 'utf8')) as V1MaskFile
  const s = sites.find((x: { id: string }) => x.id === id)
  const m = maskFromV1(f, h)
  const fr = siteFrame({ lon: s.lon, lat: s.lat, z0: f.z0, h: Number(h) })
  const t0 = Date.UTC(2026, 11, 11), t1 = t0 + 60 * 86400e3
  const iv = intervals(bodyFn(eph, fr, m, 'SUN', DEFAULT_THRESHOLDS, 'mid'), t0, t1)
  const b = whoBlocks(eph, fr, m, f.z0 + Number(h), iv, t0, t1)
  console.log(id, h + ' m', b.slice(0, 3).map((x) => `${x.hours.toFixed(0)} h from ${new Date(x.start).toISOString().slice(0, 16)} ${x.cause} ${x.distKm?.toFixed(1)} km az ${x.az.toFixed(0)}`).join(' | '))
}
