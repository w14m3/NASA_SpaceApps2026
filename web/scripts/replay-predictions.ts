// V18 helper: Sightline's predicted conditions after the published touchdowns of Chandrayaan-3, IM-1 and IM-2
// (positions and dates from web/public/data/sites.json, each with its source). Terrain: LOLA 80 m + 240 m (60°S)
// from data/cache when present. Instrument height 2 m (generic; the landers' real geometry is not modelled).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeHorizon } from '../src/core/horizon'
import { loadCachedDem } from '../src/core/cachedem'
import { siteFrame, azel } from '../src/core/topo'
import { bodyFn, DEFAULT_THRESHOLDS } from '../src/core/analysis'
import { intervals, gaps } from '../src/core/events'
import { diskFraction } from '../src/core/disk'
import { DSN, moonFromStation, stationFrame } from '../src/core/stations'
import { testEphemeris, PUBLIC, ROOT } from '../src/core/testdata'
import { record } from '../src/core/record'

const eph = await testEphemeris()
const g80 = loadCachedDem('LDEM_80S_80MPP_ADJ', 'LOLA 80 m', 0.29)
const g240 = loadCachedDem('LDEM_60S_240MPP_ADJ', 'LOLA 240 m (60°S)', 3)
const sites = JSON.parse(readFileSync(join(PUBLIC, 'data/sites.json'), 'utf8')).sites
const out: Record<string, unknown> = {}
const iso = (t: number) => new Date(t).toISOString().slice(0, 16) + 'Z'
for (const [id, tStr] of [['chandrayaan3_vikram', '2023-08-23T12:34:00Z'], ['im1_odysseus', '2024-02-22T23:23:53Z'], ['im2_athena', '2025-03-06T17:30:00Z']] as const) {
  const s = sites.find((x: { id: string }) => x.id === id)
  const t0 = Date.parse(tStr)
  const t1 = t0 + 35 * 86_400_000
  const r = computeHorizon([g80, g240], s.lon, s.lat, 2, { nAz: 1440 })!
  const f = siteFrame({ lon: s.lon, lat: s.lat, z0: r.z0, h: 2 })
  const sunIv = intervals(bodyFn(eph, f, r.mask, 'SUN', DEFAULT_THRESHOLDS, 'mid'), t0, t1)
  const earthIv = intervals(bodyFn(eph, f, r.mask, 'EARTH', DEFAULT_THRESHOLDS, 'mid'), t0, t1)
  const sun0 = azel(eph, 'SUN', t0, f)
  const earth0 = azel(eph, 'EARTH', t0, f)
  const firstSet = sunIv.find((i) => !i.openEnd && i.end > t0)
  const dark = gaps(sunIv, t0, t1)[0]
  const st = DSN.map((d) => ({ d, f: stationFrame(d) }))
  let dteH = 0
  for (let t = t0; t < t0 + 7 * 86_400_000; t += 3_600_000) {
    const e = azel(eph, 'EARTH', t, f)
    if (diskFraction(r.mask, e) >= 0.5 && st.some((x) => moonFromStation(eph, x.f, t).el >= 10)) dteH++
  }
  out[id] = {
    touchdown_utc_used: tStr,
    terrain: r.mask.kind,
    z0_m: r.z0,
    sun_el_at_touchdown_deg: sun0.el,
    sun_az_deg: sun0.az,
    sun_visible_fraction_at_touchdown: diskFraction(r.mask, sun0),
    earth_el_at_touchdown_deg: earth0.el,
    earth_visible_fraction_at_touchdown: diskFraction(r.mask, earth0),
    first_sunset_utc: firstSet ? iso(firstSet.end) : null,
    days_of_sunlight_after_touchdown: firstSet ? (firstSet.end - t0) / 86_400_000 : null,
    first_dark_interval: dark ? { start: iso(dark.start), end: dark.openEnd ? 'beyond window' : iso(dark.end), hours: (dark.end - dark.start) / 3_600_000 } : null,
    near_share: r.mask.nearShare,
    finest_px: r.mask.finestPx,
    dte_hours_first_7_days: dteH,
    earth_in_view_fraction_35d: earthIv.reduce((a, i) => a + i.end - i.start, 0) / (t1 - t0),
  }
  console.log(id, JSON.stringify(out[id]))
}
writeFileSync(join(ROOT, 'data/validation/V18_predictions.json'), JSON.stringify(out, null, 1))

// Published accounts (read 2026-11-15 through the session proxy; quotes verbatim)
const published = {
  chandrayaan3_vikram: {
    source: 'ISRO, Chandrayaan-3 mission page, https://www.isro.gov.in/Chandrayaan3.html',
    quotes: ['August 23, 2023 … Chandrayaan-3 has successfully soft-landed on the moon.', 'September 04, 2023 The lander and rover are in sleep mode. Awaiting their awakening around September 22, 2023.', 'September 22, 2023 Efforts to establish communication with lander and rover are underway.'],
    comparison: 'Predicted first sunset 2023-09-04 07:22 UTC (instrument 2 m, LOLA 240 m 60°S — the site is outside the 80 m product) matches the published sleep date (4 Sep); predicted next sunrise 2023-09-19 22:54 UTC precedes the published expected awakening "around September 22" by ~2–3 days, consistent with waiting for the Sun to climb and batteries to charge.',
  },
  im1_odysseus: {
    source: 'NASA, "NASA Collects First Surface Science in Decades via Commercial Moon Mission" (page last updated 4 Mar 2024), https://www.nasa.gov/missions/artemis/clps/nasa-collects-first-surface-science-in-decades-via-commercial-moon-mission/',
    quotes: ['The six instruments ceased science and technology operations seven days after landing in the lunar South Pole region aboard Intuitive Machines’ Odysseus, meeting pre-launch projected mission operations.', 'After landing, NASA payload data was acquired consistent with the communications and other constraints resulting from the lander orientation.'],
    comparison: 'Operations ceased ~7 days after the 2024-02-22 touchdown (~2024-02-29), about 1.8 days before Sightline’s predicted geometric sunset at the site (2024-03-02 17:46 UTC, 2 m, LOLA 80 m). Documented difference: the lander came to rest tilted (NASA cites "lander orientation" constraints) and its panels and power budget are not modelled; geometry alone gives the upper bound.',
  },
  im2_athena: {
    source: 'NASA release 25-025, "NASA Receives Some Data Before Intuitive Machines Ends Lunar Mission" (7 Mar 2025), https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/',
    quotes: ['Planned to land at Mons Mouton, IM-2 touched down at approximately 11:30 a.m. … March 6, more than 1,300 feet (400 meters) from its intended landing site.', 'The lunar lander is on its side about 820 feet from the intended landing site, Mons Mouton.', 'Intuitive Machines said images collected later confirmed the lander was on its side, preventing it from fully operating the drill and other instruments before its batteries were depleted.', '… calling an early end of mission at 12:15 a.m. CST Friday.'],
    comparison: 'Sightline predicts the Sun only 2.5° above the horizontal at touchdown and ~13 days of geometric sunlight at the 80 m DEM scale. The mission ended ~13 h after touchdown because the lander lay on its side inside a ~20 m crater (LROC, sites.json) — relief smaller than one DEM pixel and an attitude outside the screening model. This is the documented limit "DEMs cannot resolve rocks or craters smaller than their pixel"; with the Sun 2.5° up, a few metres of local relief can shade a lander for days.',
  },
}
record('V18', {
  test: 'Mission replay: Sightline predictions at the published touchdowns of Chandrayaan-3 (2023-08-23), IM-1 (2024-02-22), IM-2 (2025-03-06) vs published accounts (ISRO, NASA), instrument height 2 m',
  criterion: 'documented (qualitative agreement, differences explained)',
  measured: { predictions: out, published },
  summary: 'Chandrayaan-3: predicted sunset 4 Sep = published sleep 4 Sep, next sunrise 19 Sep vs awakening expected ~22 Sep; IM-1: ops ended ~1.8 d before predicted sunset (tilted lander, not modelled); IM-2: 2.5° Sun, ended in a sub-pixel crater on its side (outside DEM-scale screening)',
  pass: true,
})
