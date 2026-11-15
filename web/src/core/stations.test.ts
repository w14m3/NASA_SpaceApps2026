import { describe, expect, it } from 'vitest'
import { DSN, moonFromStation, stationFrame } from './stations'
import { fsplDb, linkMarginDb } from './link'
import { readJson, testEphemeris } from './testdata'
import { record } from './record'

describe('link geometry', () => {
  it('free-space path loss and link margin follow their closed forms', () => {
    // FSPL = 20 log10(4π d f / c): 384,400 km at 8.4 GHz
    const d = 384_400e3
    const f = 8.4e9
    expect(fsplDb(384_400, 8.4)).toBeCloseTo(20 * Math.log10((4 * Math.PI * d * f) / 299_792_458), 9)
    // margin: 10 W (10 dBW) + 20 dBi − FSPL + 74 dBi − (−228.6 + 10·log10 20 K) − 10·log10(1e5) − 2 dB
    const m = linkMarginDb({ txPowerW: 10, txGainDbi: 20, rxGainDbi: 74, rangeKm: 384_400, ghz: 8.4, systemTempK: 20, dataRateBps: 1e5, requiredEbN0Db: 2, lossesDb: 0 })
    const exp = 10 + 20 - fsplDb(384_400, 8.4) + 74 - (-228.6 + 10 * Math.log10(20)) - 50 - 2
    expect(m).toBeCloseTo(exp, 9)
  })
})

describe('ground stations', () => {
  it('V11 Moon elevation at DSN sites (runtime chain) vs JPL Horizons, 240 instants <= 0.05 deg', async () => {
    const eph = await testEphemeris()
    const { rows } = readJson<{ rows: { station: string; unix_ms: number; el: number; az: number }[] }>('web/src/core/__fixtures__/dsn_moon_horizons.json')
    const frames = Object.fromEntries(DSN.map((s) => [s.id, stationFrame(s)]))
    let worst = 0
    let worstAz = 0
    let ss = 0
    for (const r of rows) {
      const m = moonFromStation(eph, frames[r.station], r.unix_ms)
      const d = Math.abs(m.el - r.el)
      worst = Math.max(worst, d)
      if (r.el > 5) worstAz = Math.max(worstAz, Math.abs(((m.az - r.az + 540) % 360) - 180) * Math.cos((r.el * Math.PI) / 180))
      ss += d * d
    }
    const rms = Math.sqrt(ss / rows.length)
    record('V11', {
      test: 'Moon topocentric elevation at DSS-14, DSS-63, DSS-43: runtime chain (DE421 Moon in CIRS + ERA(UT1), no polar motion) vs JPL Horizons apparent airless az/el, 240 seeded instants 2026–2030 (responses cached in data/raw/horizons_dsn/)',
      criterion: '<= 0.05 deg',
      measured: { max_el_deg: worst, rms_el_deg: rms, max_az_cos_el_deg: worstAz, n: rows.length },
      summary: `elevation max ${worst.toFixed(4)}°, RMS ${rms.toFixed(4)}°; azimuth·cos(el) max ${worstAz.toFixed(4)}° (n=${rows.length})`,
      pass: worst <= 0.05 && rows.length >= 200,
    })
    expect(rows.length).toBeGreaterThanOrEqual(200)
    expect(worst).toBeLessThanOrEqual(0.05)
  })

  it('V11b Moon elevation at DSN sites vs an independent astropy/ERFA chain (240 instants x 3 stations) <= 0.05 deg', async () => {
    const eph = await testEphemeris()
    const { rows } = readJson<{ rows: { station: string; unix_ms: number; el: number; az: number }[] }>('web/src/core/__fixtures__/dsn_moon_astropy.json')
    const frames = Object.fromEntries(DSN.map((s) => [s.id, stationFrame(s)]))
    let worst = 0
    let ss = 0
    for (const r of rows) {
      const m = moonFromStation(eph, frames[r.station], r.unix_ms)
      const d = Math.abs(m.el - r.el)
      worst = Math.max(worst, d)
      ss += d * d
    }
    const rms = Math.sqrt(ss / rows.length)
    record('V11b', {
      test: 'Moon topocentric elevation at DSS-14, DSS-43, DSS-63 (runtime chain: DE421 Moon in CIRS + ERA(UT1), no polar motion) vs astropy (built-in ERFA Moon theory, full IERS-A chain), 720 rows 2026–2030. Substitute for V11 while JPL Horizons is unreachable',
      criterion: '<= 0.05 deg',
      measured: { max_deg: worst, rms_deg: rms, n: rows.length },
      summary: `max ${worst.toFixed(4)}°, RMS ${rms.toFixed(4)}° (n=${rows.length})`,
      pass: worst <= 0.05,
    })
    expect(worst).toBeLessThanOrEqual(0.05)
  })
})
