// Site Workbench: verdict, countdowns, sky plot, metrics, compare table, exports.
import { useMemo, useRef } from 'react'
import type { Ephemeris } from '../core/ephem'
import { siteFrame } from '../core/geom'
import {
  countdown,
  fmtDuration,
  fmtUtc,
  HOUR,
  PANEL_LABEL,
  quickScore,
  DAY,
  type Analysis,
  type PanelKind,
} from '../core/analysis'
import { sample } from '../core/visibility'
import type { MaskEntry, SiteInfo, State, Manifest } from '../state'
import { SkyPlot } from './SkyPlot'

export interface SiteResult {
  site: SiteInfo
  entry: MaskEntry
  a: Analysis
}

interface Props {
  eph: Ephemeris
  state: State
  results: SiteResult[]
  manifest: Manifest | null
  set: (patch: Partial<State>) => void
  unpin: (id: string) => void
  select: (id: string) => void
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`
const dur = (iv: { start: number; end: number } | null) => (iv ? fmtDuration(iv.end - iv.start) : '0 h')

function Def({ term, children }: { term: string; children: string }) {
  return (
    <abbr className="def" title={children} tabIndex={0}>
      {term}
    </abbr>
  )
}

function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export function Workbench({ eph, state, results, manifest, set, unpin, select }: Props) {
  const active = results.find((r) => r.site.id === state.active) ?? results[0]
  const skyCanvas = useRef<HTMLCanvasElement | null>(null)

  const live = useMemo(() => {
    if (!active) return null
    const f = siteFrame({ lon: active.site.lon, lat: active.site.lat, z0: active.entry.z0, h: state.h })
    const now = sample(eph, f, active.entry.mask, state.t)
    return {
      f,
      now,
      sun: countdown(eph, f, active.entry.mask, 'SUN', state.t),
      earth: countdown(eph, f, active.entry.mask, 'EARTH', state.t),
    }
    // countdowns are recomputed per minute of simulated time, not per frame
  }, [eph, active, state.h, Math.round(state.t / 60_000)])

  // schedule slip: same site, mission of `missionDays`, start date moved by -14..+14 days
  const missionDays = Math.min(state.windowDays, 30)
  const slip = useMemo(() => {
    if (!active) return null
    const s = { lon: active.site.lon, lat: active.site.lat, z0: active.entry.z0, h: state.h }
    const day0 = Math.floor(state.t / DAY) * DAY
    const out = []
    for (let k = -14; k <= 14; k++) {
      const start = day0 + k * DAY
      if (!eph.covers(start) || !eph.covers(start + missionDays * DAY)) continue
      out.push({ k, q: quickScore(eph, s, active.entry.mask, start, missionDays) })
    }
    return out
  }, [eph, active, state.h, Math.floor(state.t / DAY), missionDays])

  if (!active || !live) {
    return (
      <aside className="workbench empty">
        <h2>Pick a site</h2>
        <p>
          Click a marker on the Moon, or switch to the <b>South pole</b> map and click anywhere between 80°S and 90°S.
          You get two answers straight away: <b>can the lander make power</b> and <b>can it talk to Earth</b>.
        </p>
        <p className="muted">Double-click (or right-click) the 3D globe to drop a custom site. Pin up to 4 sites to compare them.</p>
      </aside>
    )
  }

  const { a, site, entry } = active
  const terrain = entry.mask.kind !== 'sphere'
  // share of the horizon set by ground closer than 3 DEM pixels: there the result depends on relief the DEM cannot resolve
  const px = entry.mask.kind === 'dem80' ? 0.08 : 0.24
  let near = 0
  if (entry.mask.dist) {
    for (let i = 0; i < entry.mask.n; i++) if (entry.mask.dist[i] < 3 * px) near++
    near /= entry.mask.n
  }
  const baseE = a.energyWhM2.flat
  const best = (Object.keys(a.energyWhM2) as PanelKind[]).reduce((x, y) => (a.energyWhM2[y] > a.energyWhM2[x] ? y : x))
  const days = (a.t1 - a.t0) / (24 * HOUR)

  const cd = (c: typeof live.sun, body: string) => (
    <div className={`card ${c.now ? 'on' : 'off'}`}>
      <div className="card-k">
        {body} {c.now ? 'is up' : 'is hidden'} <span aria-hidden>{c.now ? '▲' : '▼'}</span>
      </div>
      <div className="card-v">
        {c.next === null ? `no change in 60 d` : `${c.now ? 'sets' : 'rises'} in ${fmtDuration(c.next - state.t)}`}
      </div>
      <div className="card-s">
        {c.next !== null && fmtUtc(c.next)}
        {c.next !== null && c.pm !== null && c.pm >= 1000 && ` ± ${fmtDuration(c.pm)}`}
      </div>
    </div>
  )

  const exportCsv = () => {
    const rows = ['utc,sun_az_deg,sun_el_deg,sun_disk_fraction,earth_az_deg,earth_el_deg,earth_disk_fraction,sun_earth_sep_deg,flux_w_m2']
    for (const s of a.series)
      rows.push(
        [new Date(s.t).toISOString(), s.sun.az.toFixed(4), s.sun.el.toFixed(4), s.sunFrac.toFixed(4), s.earth.az.toFixed(4), s.earth.el.toFixed(4), s.earthFrac.toFixed(4), s.sep.toFixed(3), s.flux.toFixed(1)].join(','),
      )
    download(`${site.id}_series.csv`, rows.join('\n'), 'text/csv')
  }
  const exportJson = () =>
    download(
      `${site.id}_report.json`,
      JSON.stringify(
        {
          site,
          instrument_height_m: state.h,
          terrain_height_m: entry.z0,
          horizon: entry.label,
          horizon_note: entry.note ?? null,
          window_utc: [new Date(a.t0).toISOString(), new Date(a.t1).toISOString()],
          metrics: {
            sunlit_time_fraction: a.litFrac,
            sunlit_time_fraction_band: a.litFracBand,
            earth_in_view_time_fraction: a.earthFrac,
            earth_in_view_time_fraction_band: a.earthFracBand,
            longest_sunlit_h: a.longestLit ? (a.longestLit.end - a.longestLit.start) / HOUR : 0,
            longest_dark_h: a.longestDark ? (a.longestDark.end - a.longestDark.start) / HOUR : 0,
            longest_link_gap_h: a.longestLinkGap ? (a.longestLinkGap.end - a.longestLinkGap.start) / HOUR : 0,
            incident_energy_wh_per_m2: a.energyWhM2,
            power_score: a.powerScore,
            link_score: a.linkScore,
          },
          sun_intervals_utc: a.sunIv.map((i) => [new Date(i.start).toISOString(), new Date(i.end).toISOString()]),
          earth_intervals_utc: a.earthIv.map((i) => [new Date(i.start).toISOString(), new Date(i.end).toISOString()]),
          conventions: 'MOON_ME frame, east-positive longitude, R = 1737.4 km, azimuth clockwise from north, UTC',
          limits: 'Geometric visibility only: illumination is not electrical power, Earth in view is not link closure.',
          manifest,
        },
        null,
        1,
      ),
      'application/json',
    )
  const exportPng = () => {
    const c = skyCanvas.current
    if (!c) return
    const a2 = document.createElement('a')
    a2.href = c.toDataURL('image/png')
    a2.download = `${site.id}_skyplot.png`
    a2.click()
  }

  return (
    <aside className="workbench">
      <div className="tabs" role="tablist" aria-label="Pinned sites">
        {results.map((r) => (
          <span key={r.site.id} className={`tab ${r.site.id === site.id ? 'sel' : ''}`}>
            <button role="tab" aria-selected={r.site.id === site.id} onClick={() => select(r.site.id)}>
              {r.site.name}
            </button>
            <button className="x" aria-label={`Unpin ${r.site.name}`} onClick={() => unpin(r.site.id)}>
              ×
            </button>
          </span>
        ))}
      </div>

      <header className="site-head">
        <h2>{site.name}</h2>
        <div className="muted">
          {Math.abs(site.lat).toFixed(4)}°{site.lat < 0 ? 'S' : 'N'}, {site.lon.toFixed(4)}°E · terrain {entry.z0.toFixed(0)} m ·
          instrument {state.h} m above ground
          {site.source_url && (
            <>
              {' · '}
              <a href={site.source_url} target="_blank" rel="noreferrer">
                source{site.status === 'unverified' ? ' (unverified)' : ''}
              </a>
            </>
          )}
        </div>
        <div className={`horizon-kind ${terrain ? '' : 'warn'}`}>
          <span aria-hidden>{terrain ? '⛰' : '⚠'}</span> {entry.label}
          {entry.note && <div className="note">{entry.note}</div>}
          {near > 0.25 && (
            <div className="note">
              {Math.round(near * 100)}% of this horizon is set by ground closer than {Math.round(3 * px * 1000)} m. Relief smaller
              than the DEM pixel ({px * 1000} m) is not resolved, so numbers for a {state.h} m mast are indicative — compare with the
              taller mast.
            </div>
          )}
        </div>
      </header>

      <section className="verdict" aria-label="Verdict">
        <div className="score">
          <div className="score-n sun">{a.powerScore.toFixed(0)}</div>
          <div className="score-l">
            <Def term="Power score">
              100 × (0.6 × fraction of the window with ≥1% of the Sun's disk visible + 0.4 × (1 − longest dark gap ÷ half a synodic month)). A transparent heuristic index of illumination, not electrical power.
            </Def>
          </div>
        </div>
        <div className="score">
          <div className="score-n earth">{a.linkScore.toFixed(0)}</div>
          <div className="score-l">
            <Def term="Link score">
              100 × (0.6 × fraction of the window with ≥50% of Earth's disk above the terrain + 0.4 × (1 − longest gap ÷ half a synodic month)). Geometric line of sight only — not link closure.
            </Def>
          </div>
        </div>
        <div className="score">
          <div className="score-n">{a.combined.toFixed(0)}</div>
          <div className="score-l">
            <Def term="Combined">Geometric mean of the Power and Link scores: a site must do both to rank high.</Def>
          </div>
        </div>
      </section>

      <section className="cards" aria-label="Countdowns" aria-live="polite">
        {cd(live.sun, 'Sun')}
        {cd(live.earth, 'Earth')}
      </section>

      <section>
        <h3>Sky from the site</h3>
        <SkyPlot eph={eph} frame={live.f} mask={entry.mask} t={state.t} trailDays={Math.min(30, state.windowDays)} onCanvas={(c) => (skyCanvas.current = c)} />
      </section>

      <section>
        <h3>
          Over the next {days.toFixed(0)} days <span className="muted">from {fmtUtc(a.t0)}</span>
        </h3>
        <table className="metrics">
          <tbody>
            <tr>
              <th><Def term="Sunlit time">Share of the window in which at least 1% of the Sun's disk is above the terrain horizon. The range in brackets re-runs the calculation with the horizon shifted down/up by the DEM's 1-sigma height error.</Def></th>
              <td>{pct(a.litFrac)}{a.litFracBand[0] !== a.litFracBand[1] && <span className="muted"> ({pct(a.litFracBand[0])}–{pct(a.litFracBand[1])})</span>}</td>
            </tr>
            <tr>
              <th><Def term="Longest sunlight / darkness">Longest unbroken stretch with the Sun visible, and longest unbroken stretch with it hidden, inside the window. A stretch cut by the window edge is at least this long.</Def></th>
              <td>{dur(a.longestLit)} / {dur(a.longestDark)}</td>
            </tr>
            <tr>
              <th><Def term="Earth in view">Share of the window in which at least half of Earth's disk is above the terrain horizon, seen from the instrument height. Direction is computed from the site, not the Moon's centre.</Def></th>
              <td>{pct(a.earthFrac)}{a.earthFracBand[0] !== a.earthFracBand[1] && <span className="muted"> ({pct(a.earthFracBand[0])}–{pct(a.earthFracBand[1])})</span>}</td>
            </tr>
            <tr>
              <th><Def term="Longest link gap">Longest unbroken stretch with Earth hidden by terrain or below the horizon.</Def></th>
              <td>{dur(a.longestLinkGap)}</td>
            </tr>
            <tr>
              <th><Def term="Right now">Fraction of the Sun's disk and of Earth's disk above the horizon at the selected time.</Def></th>
              <td>Sun {Math.round(live.now.sunFrac * 100)}% · Earth {Math.round(live.now.earthFrac * 100)}%</td>
            </tr>
            {state.expert && (
              <>
                <tr>
                  <th><Def term="Sun–Earth separation">Angle between the Sun and Earth seen from the site. Small angles mean the antenna looks towards the Sun (solar noise) — a flag, not a link calculation.</Def></th>
                  <td>{live.now.sep.toFixed(1)}°</td>
                </tr>
                <tr>
                  <th><Def term="Earth range / light time">Distance to Earth's centre and one-way light time at the selected instant.</Def></th>
                  <td>{Math.round(live.now.earth.range).toLocaleString()} km · {(live.now.earth.range / 299792.458).toFixed(3)} s</td>
                </tr>
                <tr>
                  <th><Def term="Solar flux">Inverse-square flux from 1360.8 W/m² at 1 au, before terrain occlusion.</Def></th>
                  <td>{live.now.flux.toFixed(0)} W/m²</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Solar panel layout <span className="muted">(illumination, not electrical power)</span></h3>
        <label className="row">
          Layout
          <select value={state.panel} onChange={(e) => set({ panel: e.target.value as PanelKind })}>
            {(Object.keys(PANEL_LABEL) as PanelKind[]).map((k) => (
              <option key={k} value={k}>{PANEL_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <p className="headline">
          {baseE > 0 ? (
            <>
              <b>{PANEL_LABEL[state.panel]}</b> collects <b>{(a.energyWhM2[state.panel] / baseE).toFixed(1)}×</b> the energy of a flat panel
            </>
          ) : (
            <>A flat panel collects nothing here in this window</>
          )}{' '}
          — {(a.energyWhM2[state.panel] / 1000).toFixed(1)} kWh per m² of panel over {days.toFixed(0)} d
          {best !== state.panel && <> · best layout: {PANEL_LABEL[best]}</>}
        </p>
        <div className="bars" role="img" aria-label="Incident energy by panel layout">
          {(Object.keys(PANEL_LABEL) as PanelKind[]).map((k) => (
            <div key={k} className={`bar ${k === state.panel ? 'sel' : ''}`}>
              <span className="bar-l">{PANEL_LABEL[k]}</span>
              <span className="bar-t"><span className="bar-f" style={{ width: `${(100 * a.energyWhM2[k]) / Math.max(1, a.energyWhM2[best])}%` }} /></span>
              <span className="bar-v">{(a.energyWhM2[k] / 1000).toFixed(1)}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          Incident energy = ∫ flux × visible Sun fraction × cos(incidence) dt at the instrument height. Assumes a one-sided panel, no
          self-shadowing, no reflected light from terrain, no thermal or dust losses. Multiply by panel area, cell efficiency and
          system losses for electrical energy.
        </p>
      </section>

      {slip && slip.length > 2 && (() => {
        const cur = slip.find((x) => x.k === 0) ?? slip[0]
        const best = slip.reduce((a, b) => (b.q.combined > a.q.combined + 1e-9 ? b : a))
        const max = Math.max(1, ...slip.map((x) => x.q.combined))
        const why: string[] = []
        if (best.k !== cur.k) {
          if (Math.abs(best.q.lit - cur.q.lit) >= 0.005) why.push(`sunlit time ${pct(cur.q.lit)} → ${pct(best.q.lit)}`)
          if (Math.abs(best.q.darkH - cur.q.darkH) >= 1) why.push(`longest darkness ${cur.q.darkH} h → ${best.q.darkH} h`)
          if (Math.abs(best.q.earth - cur.q.earth) >= 0.005) why.push(`Earth in view ${pct(cur.q.earth)} → ${pct(best.q.earth)}`)
          if (Math.abs(best.q.gapH - cur.q.gapH) >= 1) why.push(`longest link gap ${cur.q.gapH} h → ${best.q.gapH} h`)
        }
        return (
          <section>
            <h3>What if the date slips? <span className="muted">{missionDays}-day mission, start moved ±14 d</span></h3>
            <div className="slipchart" role="group" aria-label="Combined score by start date">
              {slip.map((x) => (
                <button
                  key={x.k}
                  className={`slipbar ${x.k === 0 ? 'cur' : ''} ${x.k === best.k ? 'best' : ''}`}
                  title={`${x.k > 0 ? '+' : ''}${x.k} d (${fmtUtc(x.q.start).slice(0, 10)}): combined ${x.q.combined.toFixed(0)}, power ${x.q.power.toFixed(0)}, link ${x.q.link.toFixed(0)}`}
                  aria-label={`Start ${x.k > 0 ? '+' : ''}${x.k} days: combined score ${x.q.combined.toFixed(0)}`}
                  onClick={() => set({ t: x.q.start + (state.t % DAY), playing: false })}
                >
                  <span style={{ height: `${Math.max(3, (100 * x.q.combined) / max)}%` }} />
                </button>
              ))}
            </div>
            <div className="slipaxis"><span>−14 d</span><span>today&apos;s date ▲</span><span>+14 d</span></div>
            <p className="headline">
              {best.k === cur.k ? (
                <>The selected date is already the best start within ±14 days (combined {cur.q.combined.toFixed(0)}).</>
              ) : (
                <>
                  Best start: <b>{best.k > 0 ? '+' : '−'}{Math.abs(best.k)} d</b> ({fmtUtc(best.q.start).slice(0, 10)}), combined{' '}
                  <b>{best.q.combined.toFixed(0)}</b> vs {cur.q.combined.toFixed(0)} now
                  {why.length > 0 && <> — because {why.join(', ')}</>}.
                </>
              )}
            </p>
            <p className="muted small">Scored on hourly samples (durations rounded to 1 h). Click a bar to jump to that start date.</p>
          </section>
        )
      })()}

      {results.length > 1 && (
        <section>
          <h3>Compare pinned sites</h3>
          <div className="scroll-x">
            <table className="compare">
              <thead>
                <tr>
                  <th>Site</th><th>Power</th><th>Link</th><th>Sunlit</th><th>Longest dark</th><th>Earth in view</th><th>Longest gap</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const top = (f: (x: SiteResult) => number, hi = true) =>
                    results.every((o) => (hi ? f(r) >= f(o) : f(r) <= f(o))) ? 'best' : ''
                  const d = (iv: { start: number; end: number } | null) => (iv ? iv.end - iv.start : 0)
                  return (
                    <tr key={r.site.id} className={r.site.id === site.id ? 'sel' : ''}>
                      <th><button className="link" onClick={() => select(r.site.id)}>{r.site.name}</button></th>
                      <td className={top((x) => x.a.powerScore)}>{r.a.powerScore.toFixed(0)}</td>
                      <td className={top((x) => x.a.linkScore)}>{r.a.linkScore.toFixed(0)}</td>
                      <td className={top((x) => x.a.litFrac)}>{pct(r.a.litFrac)}</td>
                      <td className={top((x) => d(x.a.longestDark), false)}>{dur(r.a.longestDark)}</td>
                      <td className={top((x) => x.a.earthFrac)}>{pct(r.a.earthFrac)}</td>
                      <td className={top((x) => d(x.a.longestLinkGap), false)}>{dur(r.a.longestLinkGap)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">★ marks the best value in each column. Same window and instrument height for every site.</p>
        </section>
      )}

      <section className="exports">
        <button onClick={exportCsv}>CSV time series</button>
        <button onClick={exportJson}>JSON report</button>
        <button onClick={exportPng}>Sky plot PNG</button>
        <button onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy share link</button>
      </section>
    </aside>
  )
}
