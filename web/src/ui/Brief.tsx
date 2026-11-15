// Mission Brief (contract §6.2 step 5): chosen site, two alternatives, reasons, risks, assumptions, uncertainty,
// science and engineering constraints, manifest and share link. Printable (browser "Save as PDF").
import { HERO_REGIONS } from '../core/regions'
import { LANDERS } from '../core/safety'
import { PERSONAS } from '../core/top3'
import { fmtLat, fmtLon, fmtUtc, useT } from './i18n'
import { setState, shareUrl, useStore } from './store'
import { useTop3 } from './hooks'
import { fmtVars } from './LeftPanel'

const LETTERS = ['A', 'B', 'C']

export default function Brief() {
  const { t, n, lang } = useT()
  const top = useTop3()
  const chosen = useStore((s) => s.chosen)
  const region = useStore((s) => s.region)
  const landing = useStore((s) => s.landing)
  const dur = useStore((s) => s.durDays)
  const lander = useStore((s) => s.lander)
  const persona = useStore((s) => s.persona)
  const r = HERO_REGIONS.find((x) => x.id === region)
  const d = top.data
  const opts = d?.top ?? []
  const c = opts[chosen]
  const p = LANDERS[lander]
  return (
    <div className="page" role="dialog" aria-modal="true" aria-labelledby="brief-title" data-testid="brief-page">
      <div className="inner">
        <div className="row no-print">
          <button className="btn" onClick={() => setState({ page: 'main' })}>
            ← {t('nav.back')}
          </button>
          <button className="btn primary" onClick={() => window.print()} data-testid="print">
            Print / save as PDF
          </button>
        </div>
        <h1 id="brief-title">Mission Brief — {r?.name}</h1>
        <p className="hint">
          Generated {fmtUtc(Date.now())} by Sightline from the scenario at <a href={shareUrl()}>{shareUrl().slice(0, 90)}…</a>
        </p>
        {!d ? (
          <p>{t('computing')}</p>
        ) : !c ? (
          <p>{t('top3.none')}</p>
        ) : (
          <>
            <h2>
              Crew choice: Option {LETTERS[chosen]} — {t(`strength.${c.label}`)}
            </h2>
            <p style={{ fontSize: 16 }}>
              <b>
                {fmtLat(c.lat)} {fmtLon(c.lon)}
              </b>
              , terrain height {n(c.z0, 0)} m. Landing window {fmtUtc(landing)} + {dur} days; best landing date in the window {fmtUtc(c.bestStart).slice(0, 10)}.
            </p>
            <ul>
              {c.reasons.map((rs) => (
                <li key={rs.key}>{t(rs.key, fmtVars(rs.v, rs.key, lang))}</li>
              ))}
            </ul>
            <p>
              <b>{t('top3.risk')}:</b> {t(c.risk.key, fmtVars(c.risk.v, c.risk.key, lang))}
            </p>
            <table className="metrics" data-testid="brief-table">
              <thead>
                <tr>
                  <th />
                  {opts.map((o, k) => (
                    <th key={o.i}>
                      {LETTERS[k]}
                      {k === chosen ? ' (chosen)' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="Position" vals={opts.map((o) => `${fmtLat(o.lat)} ${fmtLon(o.lon)}`)} />
                <Row label="Sunlit (% of window)" vals={opts.map((o) => n(o.lit * 100, 1))} />
                <Row label="Longest night (h)" vals={opts.map((o) => n(o.nightH, 0))} />
                <Row label="Direct-to-Earth (% of window)" vals={opts.map((o) => n(o.dte * 100, 1))} />
                <Row label="Longest DTE gap (h)" vals={opts.map((o) => n(o.dteGapH, 0))} />
                <Row label="Slope at 720 m baseline (°)" vals={opts.map((o) => n(o.slope, 1))} />
                <Row label="Tip-over margin (°) · v_crit (m/s)" vals={opts.map((o) => `${n(o.margin, 1)} · ${n(o.vCrit, 2)}`)} />
                <Row label="Safe-area fraction (500 m)" vals={opts.map((o) => `${Math.round(o.safeArea * 100)} %`)} />
                <Row label="Scores S / P / L / R" vals={opts.map((o) => `${Math.round(o.scores.safety)} / ${Math.round(o.scores.power)} / ${Math.round(o.scores.link)} / ${Math.round(o.scores.robustness)}`)} />
                <Row label="Combined (viability)" vals={opts.map((o) => String(Math.round(o.combined)))} />
                <Row label="Confidence" vals={opts.map((o) => (o.nearShare > 0.25 ? 'C' : 'B'))} />
              </tbody>
            </table>
            <h2>Constraints signed off by both teams</h2>
            <div className="row wrap" style={{ alignItems: 'flex-start', gap: 24 }}>
              <div>
                <h3>Engineering</h3>
                <ul data-testid="brief-engineering">
                  <li>Slope ≤ {d.constraints.maxSlope}° at the DEM baseline (720 m)</li>
                  <li>Safe-area fraction ≥ {Math.round(d.constraints.minSafeArea * 100)} % within 500 m</li>
                  <li>Tip-over margin ≥ {d.constraints.minMargin}°</li>
                  <li>Sunlit ≥ {Math.round(d.constraints.minSunlit * 100)} % · longest night ≤ {d.constraints.maxNightH} h</li>
                  <li>Direct-to-Earth ≥ {Math.round(d.constraints.minDte * 100)} %</li>
                </ul>
              </div>
              <div>
                <h3>Science</h3>
                <ul data-testid="brief-science">
                  <li>{d.constraints.excludeZeroIllumination ? 'Landing outside zero-illumination cells (hazard and power)' : 'Zero-illumination cells allowed'}</li>
                  <li>Priority profile: {persona} (weights {JSON.stringify(PERSONAS[persona])})</li>
                  <li>Distance from option to the nearest zero-illumination cell: {opts.map((o, k) => `${LETTERS[k]} ${Number.isFinite(o.distZeroKm) ? n(o.distZeroKm, 1) + ' km' : 'none in region'}`).join(' · ')}</li>
                </ul>
              </div>
            </div>
            <h2>Assumptions and uncertainty</h2>
            <ul>
              <li>Generic {lander} lander (illustrative): {p.legs} legs, pad radius {p.padRadius} m, CG height {p.cgHeight} m, radius of gyration {p.gyration} m, minimum margin {p.minMargin}°, design lateral velocity {p.vDesign} m/s, slope uncertainty 2°.</li>
              <li>Mast {d.heightUsed} m. Horizons from LOLA 240 m (screening resolution, confidence at most B); candidate masks 360 azimuths, 0.1° quantisation.</li>
              <li>Ground stations: DSN DSS-14, DSS-63, DSS-43 with 10° minimum elevation (assumption). Geometric visibility, not link closure.</li>
              <li>Illumination, not electrical power; no reflected light, thermal or dust effects. Screening estimates, not certification.</li>
              <li>Region centre from the curated point "{r?.anchor}" ({r?.status}).</li>
            </ul>
            <h2>Provenance</h2>
            <p className="hint">Ephemeris: SPICE DE440 (2026–2031) and JPL DE421 (2017–2026), LT+S, MOON_ME. Terrain: LOLA PGDA product 90. Validation records: see Methods & Trust. Same URL, same result (seeded, deterministic).</p>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, vals }: { label: string; vals: string[] }) {
  return (
    <tr>
      <td>{label}</td>
      {vals.map((v, i) => (
        <td key={i} className="num">
          {v}
        </td>
      ))}
    </tr>
  )
}
