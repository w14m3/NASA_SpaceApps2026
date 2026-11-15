// Earth-link inputs (contract §6.9): the minimum station elevation, a user-defined ground station, and an optional link
// budget computed only from values the user types (no invented hardware figures). Geometry from the core.
import { useState } from 'react'
import type { SiteAnalysis } from '../core/analysis'
import { BANDS, linkMarginDb } from '../core/link'
import { setState, useStore } from './store'

export function StationForm() {
  const station = useStore((s) => s.station)
  const minEl = useStore((s) => s.minEl)
  const [p0, p1, p2, p3] = station ? station.split(',') : ['', '', '', '']
  const [lat, setLat] = useState(p0 ?? '')
  const [lon, setLon] = useState(p1 ?? '')
  const [hm, setHm] = useState(p2 ?? '0')
  const [me, setMe] = useState(p3 ?? '10')
  const la = Number(lat)
  const lo = Number(lon)
  const valid = lat !== '' && lon !== '' && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && Number.isFinite(Number(hm)) && Number(me) >= 0 && Number(me) <= 45
  return (
    <details data-testid="station-form">
      <summary>Ground stations: DSN DSS-14, DSS-63, DSS-43{station ? ' + your station' : ''} · minimum elevation {minEl}°</summary>
      <label className="field">
        <span>Minimum elevation of the Moon at the DSN stations (assumption, default 10°): {minEl}°</span>
        <input type="range" min={0} max={30} value={minEl} onChange={(e) => setState({ minEl: Number(e.target.value) })} data-testid="min-el" />
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) setState({ station: `${la},${lo},${Number(hm)},${Number(me)}` })
        }}
        aria-label="Add your own ground station"
      >
        <div className="row wrap">
          <label className="field" style={{ flex: 1 }}>
            <span>Latitude (° geodetic)</span>
            <input className="input" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} data-testid="gs-lat" />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Longitude (°E)</span>
            <input className="input" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} data-testid="gs-lon" />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Height (m)</span>
            <input className="input" inputMode="decimal" value={hm} onChange={(e) => setHm(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Min. elevation (°)</span>
            <input className="input" inputMode="decimal" value={me} onChange={(e) => setMe(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button className="btn small" type="submit" disabled={!valid} data-testid="gs-add">
            {station ? 'Update my station' : 'Add my station'}
          </button>
          {station && (
            <button className="btn small ghost" type="button" onClick={() => setState({ station: '' })}>
              Remove
            </button>
          )}
          <span className="hint">Counts toward direct-to-Earth windows in every view and in the Top 3.</span>
        </div>
      </form>
    </details>
  )
}

const FIELDS = [
  { k: 'tx', label: 'Transmit power (W)' },
  { k: 'gt', label: 'Lander antenna gain (dBi)' },
  { k: 'gr', label: 'Ground antenna gain (dBi)' },
  { k: 'ts', label: 'System noise temperature (K)' },
  { k: 'rb', label: 'Data rate (bit/s)' },
  { k: 'req', label: 'Required Eb/N0 (dB)' },
  { k: 'loss', label: 'Other losses (dB)' },
] as const

export function LinkBudget({ a }: { a: SiteAnalysis }) {
  const [v, setV] = useState<Record<string, string>>({ loss: '0' })
  const [band, setBand] = useState<string>('X')
  const num = (k: string) => Number(v[k])
  const ready = FIELDS.every((f) => v[f.k] !== undefined && v[f.k] !== '' && Number.isFinite(num(f.k))) && num('tx') > 0 && num('ts') > 0 && num('rb') > 0
  const ghz = BANDS.find((b) => b.id === band)!.ghz
  const margin = (rangeKm: number) =>
    linkMarginDb({ txPowerW: num('tx'), txGainDbi: num('gt'), rxGainDbi: num('gr'), rangeKm, ghz, systemTempK: num('ts'), dataRateBps: num('rb'), requiredEbN0Db: num('req'), lossesDb: num('loss') })
  return (
    <details data-testid="link-budget">
      <summary>Link budget (optional — your own values)</summary>
      <p className="hint">Sightline supplies the geometry (distance, path loss); every hardware figure below is yours. No default values are invented.</p>
      <div className="row wrap">
        <label className="field">
          <span>Band</span>
          <select className="input" value={band} onChange={(e) => setBand(e.target.value)} data-testid="lb-band">
            {BANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} ({b.ghz} GHz, nominal)
              </option>
            ))}
          </select>
        </label>
        {FIELDS.map((f) => (
          <label key={f.k} className="field" style={{ minWidth: 140 }}>
            <span>{f.label}</span>
            <input className="input" inputMode="decimal" value={v[f.k] ?? ''} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} data-testid={`lb-${f.k}`} />
          </label>
        ))}
      </div>
      {ready ? (
        <p data-testid="lb-result">
          Eb/N0 margin: <b>{margin(a.link.rangeKm[1]).toFixed(1)} dB</b> at the longest range ({Math.round(a.link.rangeKm[1]).toLocaleString('en-GB')} km), {margin(a.link.rangeKm[0]).toFixed(1)} dB at the shortest ·{' '}
          {margin(a.link.rangeKm[1]) >= 0 ? '✔ closes over the whole window (with your inputs)' : '✖ does not close at the longest range (with your inputs)'}
        </p>
      ) : (
        <p className="hint">Fill every field to compute the margin. Margin = EIRP − path loss − losses + ground gain − N0 − 10·log10(data rate) − required Eb/N0 (Boltzmann −228.6 dBW/K/Hz).</p>
      )}
    </details>
  )
}
