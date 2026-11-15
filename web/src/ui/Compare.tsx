// Compare 2–4 site-date scenarios side by side (contract §6.12, §6.15 item 2): overlaid sky plots, metric deltas,
// bars; a scenario is a site + landing date, so the same site at different dates can be compared. Season heatmap.
import { useMemo, useState } from 'react'
import { DAY, SYNODIC_MS } from '../core/constants'
import type { SiteAnalysis } from '../core/analysis'
import { fmtUtc, useT } from './i18n'
import { refFromString, refToString, setState, useStore, type SiteRef } from './store'
import { analyseCached, arrayFor, effectiveHeight, resolveCached, stationsFor, useAsync, useSites } from './hooks'
import { SkyPlot } from './SkyPlot'
import { useCurrentSite } from './current'
import { rpc } from './workerClient'
import type { ResolvedSite } from './data'

const COLORS = ['#e8ecf4', '#f7bd4a', '#5cb2ff', '#43c787']

interface Scen {
  ref: SiteRef
  landing: number
}

function parseScen(s: string): Scen[] {
  return s
    .split(';')
    .map((x) => {
      const [r, d] = x.split('@')
      const ref = refFromString(r)
      const landing = Date.parse((d ?? '') + 'T00:00:00Z')
      return ref && Number.isFinite(landing) ? { ref, landing } : null
    })
    .filter((x): x is Scen => !!x)
    .slice(0, 4)
}
function fmtScen(list: Scen[]) {
  return list.map((s) => `${refToString(s.ref)}@${new Date(s.landing).toISOString().slice(0, 10)}`).join(';')
}

export default function Compare() {
  const { t, n } = useT()
  const sites = useSites()
  const scenStr = useStore((s) => s.scen)
  const sel = useStore((s) => s.sel)
  const pins = useStore((s) => s.pins)
  const landing = useStore((s) => s.landing)
  const dur = useStore((s) => s.durDays)
  const h = useStore((s) => s.h)
  const station = useStore((s) => s.station)
  const minEl = useStore((s) => s.minEl)
  const layout = useStore((s) => s.layout)
  const panelAz = useStore((s) => s.panelAz)
  const loadW = useStore((s) => s.loadW)
  const list: Scen[] = useMemo(() => {
    const p = parseScen(scenStr)
    if (p.length) return p
    const base = [sel, ...pins.filter((x) => refToString(x) !== refToString(sel))].slice(0, 4)
    return base.length > 1 ? base.map((ref) => ({ ref, landing })) : [{ ref: sel, landing }, { ref: sel, landing: landing + Math.round(SYNODIC_MS / 2 / DAY) * DAY }]
  }, [scenStr, sel, pins, landing])
  const key = fmtScen(list) + `|${dur}|${h}|${station}|${minEl}|${layout}|${panelAz}|${loadW}`
  const res = useAsync(key, async () => {
    const out: { s: ResolvedSite; a: SiteAnalysis; landing: number }[] = []
    for (const sc of list) {
      const s = await resolveCached(sc.ref, effectiveHeight(sc.ref, h, sites))
      const a = await analyseCached(s, sc.landing, sc.landing + dur * DAY, stationsFor({ station, minEl }), arrayFor({ layout, panelAz }), loadW).promise
      out.push({ s, a, landing: sc.landing })
    }
    return out
  })
  const update = (l: Scen[]) => setState({ scen: fmtScen(l) })
  const rows = res.data ?? []
  const base = rows[0]
  const metric = (label: string, f: (a: SiteAnalysis) => number, unit: string, digits = 1) => (
    <tr key={label}>
      <td>{label}</td>
      {rows.map((r, i) => {
        const v = f(r.a)
        const d = base ? v - f(base.a) : 0
        return (
          <td key={i} className="num">
            {n(v, digits)} {unit}
            {i > 0 && <span className="hint"> ({d >= 0 ? '+' : ''}{n(d, digits)})</span>}
          </td>
        )
      })}
    </tr>
  )
  return (
    <div className="page" role="dialog" aria-modal="true" aria-labelledby="cmp-title" data-testid="compare-page">
      <div className="inner">
        <button className="btn no-print" onClick={() => setState({ page: 'main' })}>
          ← {t('nav.back')}
        </button>
        <h1 id="cmp-title">Compare site-date scenarios</h1>
        <p className="hint">A scenario is a site + landing date (window {dur} days, mast {h} m). Deltas are relative to scenario 1. Pin sites in the workbench to compare them; the default compares the current site now and half a lunar day later.</p>
        <div className="row wrap" data-testid="scenario-list">
          {list.map((s, i) => (
            <div key={i} className="opt" style={{ cursor: 'default', borderColor: COLORS[i] }}>
              <b style={{ color: COLORS[i] }}>{i + 1}.</b> {rows[i]?.s.name ?? '…'}
              <input type="date" className="input" value={new Date(s.landing).toISOString().slice(0, 10)} onChange={(e) => {
                const ms = Date.parse(e.target.value + 'T00:00:00Z')
                if (Number.isFinite(ms)) update(list.map((x, k) => (k === i ? { ...x, landing: ms } : x)))
              }} aria-label={`Landing date of scenario ${i + 1}`} data-testid={`scen-date-${i}`} />
              {list.length > 2 && <button className="btn small" onClick={() => update(list.filter((_, k) => k !== i))}>✕</button>}
            </div>
          ))}
          {list.length < 4 && (
            <button className="btn" onClick={() => update([...list, { ref: list[list.length - 1].ref, landing: list[list.length - 1].landing + 7 * DAY }])} data-testid="scen-add">
              + same site, 7 days later
            </button>
          )}
        </div>
        {!res.data ? (
          <p>{t('computing')}</p>
        ) : (
          <>
            <h2>Overlaid sky plots</h2>
            <SkyPlot layers={rows.map((r, i) => ({ mask: r.s.mask, color: COLORS[i], label: r.s.name }))} analysis={base?.a ?? null} inst={null} height={260} testId="compare-sky" />
            <h2>Metrics and deltas</h2>
            <table className="metrics" data-testid="compare-table">
              <thead>
                <tr>
                  <th />
                  {rows.map((r, i) => (
                    <th key={i} style={{ color: COLORS[i] }}>
                      {i + 1}. {r.s.name}
                      <div className="hint">{fmtUtc(r.landing).slice(0, 10)} · {r.s.h} m · {r.s.terrain}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metric('Sunlit', (a) => a.litFrac.value * 100, '%')}
                {metric('Longest night', (a) => a.longestDarkH.value, 'h', 0)}
                {metric('Earth in view', (a) => a.earthFrac.value * 100, '%')}
                {metric('Direct-to-Earth', (a) => a.dteFrac.value * 100, '%')}
                {metric('Longest DTE gap', (a) => a.longestDteGapH, 'h', 0)}
                {metric('Array energy', (a) => a.energy.electricWh / 1000, 'kWh', 2)}
                {metric('Peak Sun elevation', (a) => a.peakSunEl, '°', 2)}
                {metric('Cold soak', (a) => a.thermal.coldSoakH, 'h', 0)}
              </tbody>
            </table>
            <h2>Sunlight and DTE bars</h2>
            <div className="bars" data-testid="compare-bars">
              {rows.map((r, i) => (
                <Bars key={i} label={`${i + 1}. ${r.s.name}`} lit={r.a.litFrac.value} dte={r.a.dteFrac.value} color={COLORS[i]} />
              ))}
            </div>
          </>
        )}
        <Season />
      </div>
    </div>
  )
}

function Bars({ label, lit, dte, color }: { label: string; lit: number; dte: number; color: string }) {
  return (
    <>
      <span style={{ color }}>{label}</span>
      <span style={{ display: 'grid', gap: 2 }}>
        <span className="bar"><i style={{ width: `${lit * 100}%`, background: 'var(--sun)' }} /></span>
        <span className="bar"><i style={{ width: `${dte * 100}%`, background: 'var(--earth)' }} /></span>
      </span>
      <span className="hint">☀ {Math.round(lit * 100)} % · ● {Math.round(dte * 100)} %</span>
    </>
  )
}

/** Season view (§6.15 item 3): 12 months of lunations × day of lunation, Sun visible fraction and DTE. */
export function Season() {
  const { site } = useCurrentSite()
  const landing = useStore((s) => s.landing)
  const [what, setWhat] = useState<'sun' | 'dte'>('sun')
  const t0 = landing
  const res = useAsync(site ? `${site.key}|${t0}` : null, () => rpc.season({ site: { lon: site!.lon, lat: site!.lat, z0: site!.z0, h: site!.h }, mask: site!.mask, t0, days: 354.4 }))
  const grid = useMemo(() => {
    if (!res.data) return null
    const rows = 12
    const cols = 30
    const v = new Float32Array(rows * cols)
    const cnt = new Float32Array(rows * cols)
    const d = res.data
    for (let k = 0; k < d.n; k++) {
      const ms = (k + 0.5) * 3_600_000
      const lun = Math.floor(ms / SYNODIC_MS)
      const day = Math.floor(((ms % SYNODIC_MS) / SYNODIC_MS) * cols)
      if (lun >= rows) break
      v[lun * cols + day] += what === 'sun' ? (d.sun[k] >= 0.01 ? 1 : 0) : d.dte[k]
      cnt[lun * cols + day]++
    }
    for (let i = 0; i < v.length; i++) v[i] = cnt[i] ? v[i] / cnt[i] : 0
    const tot = Array.from({ length: rows }, (_, r) => v.slice(r * cols, r * cols + cols).reduce((a, b) => a + b, 0) / cols)
    const best = tot.indexOf(Math.max(...tot))
    const worst = tot.indexOf(Math.min(...tot))
    return { rows, cols, v, tot, best, worst }
  }, [res.data, what])
  return (
    <section data-testid="season">
      <h2>Seasons — 12 lunations from {new Date(t0).toISOString().slice(0, 10)} at {site?.name}</h2>
      <div className="seg" role="group" aria-label="Season variable">
        <button aria-pressed={what === 'sun'} onClick={() => setWhat('sun')}>☀ Sunlight</button>
        <button aria-pressed={what === 'dte'} onClick={() => setWhat('dte')}>● Direct-to-Earth</button>
      </div>
      {!grid ? (
        <p className="hint">Computing 8,500 hourly samples…</p>
      ) : (
        <svg viewBox={`0 0 ${grid.cols * 16 + 150} ${grid.rows * 16 + 20}`} width="100%" role="img" aria-label={`Season heatmap: best lunation ${grid.best + 1}, worst ${grid.worst + 1}`}>
          {Array.from({ length: grid.rows }, (_, r) => (
            <g key={r}>
              <text x={0} y={r * 16 + 12} fill="#a7b1c4" fontSize="10">
                L{r + 1} {new Date(t0 + r * SYNODIC_MS).toISOString().slice(0, 7)}
              </text>
              {Array.from({ length: grid.cols }, (_, c) => {
                const v = grid.v[r * grid.cols + c]
                return <rect key={c} x={90 + c * 16} y={r * 16} width={15} height={15} fill={what === 'sun' ? `rgba(247,189,74,${0.08 + 0.92 * v})` : `rgba(92,178,255,${0.08 + 0.92 * v})`} />
              })}
              <text x={90 + grid.cols * 16 + 4} y={r * 16 + 12} fill={r === grid.best ? '#43c787' : r === grid.worst ? '#ff6b6b' : '#a7b1c4'} fontSize="10">
                {Math.round(grid.tot[r] * 100)}%{r === grid.best ? ' best' : r === grid.worst ? ' worst' : ''}
              </text>
            </g>
          ))}
          <text x={90} y={grid.rows * 16 + 14} fill="#7b879d" fontSize="10">
            day of lunation → (columns of 0.98 d), rows = successive lunations; cell = fraction of hours
          </text>
        </svg>
      )}
    </section>
  )
}
