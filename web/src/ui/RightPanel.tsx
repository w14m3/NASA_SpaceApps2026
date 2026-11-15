import { useMemo } from 'react'
import { HOUR } from '../core/constants'
import { fmtDur, fmtUtc, useT } from './i18n'
import { setState, useStore } from './store'
import { useCountdowns, useCurrentSite, useInstant } from './current'
import { useTop3 } from './hooks'
import { SkyPlot } from './SkyPlot'
import { Workbench } from './Workbench'

export function TimeInput() {
  const { t } = useT()
  const tNow = useStore((s) => s.t)
  const v = new Date(tNow).toISOString().slice(0, 16)
  return (
    <div className="field">
      <label htmlFor="mtime">{t('right.time')}</label>
      <input
        id="mtime"
        type="datetime-local"
        className="input"
        value={v}
        min="2017-01-01T00:00"
        max="2031-01-02T00:00"
        onChange={(e) => {
          const ms = Date.parse(e.target.value + ':00Z')
          if (Number.isFinite(ms)) setState({ t: ms, playing: false })
        }}
        data-testid="mission-time"
      />
      <span className="hint">{fmtUtc(tNow)}</span>
    </div>
  )
}

export function RightPanel() {
  const { t, lang } = useT()
  const { site, analysis } = useCurrentSite()
  const inst = useInstant(site)
  const cd = useCountdowns(site)
  const tNow = useStore((s) => s.t)
  const top3 = useTop3()
  const winH = useStore((s) => s.durDays) * 24
  const layers = useMemo(() => (site ? [{ mask: site.mask, color: '#e8ecf4', label: site.name }] : []), [site])
  const card = (k: string, ms: number | null, pm: number | null, testid: string) => (
    <div className="card" data-testid={testid}>
      <div className="k">{t(k)}</div>
      <div className="v">{ms === null ? '—' : fmtDur(ms - tNow, lang)}</div>
      <div className="k">{pm !== null && ms !== null ? `± ${fmtDur(pm, lang)} (horizon ±1σ)` : ms === null ? t('cd.none') : ''}</div>
    </div>
  )
  return (
    <>
      <div className="section">
        <TimeInput />
        <h2>{t('right.conditions')}</h2>
        {inst ? (
          <div className="row wrap" data-testid="conditions">
            <span className={inst.sunFrac >= 0.01 ? 'chip sun' : 'chip off'}>{inst.sunFrac >= 0.01 ? `☀ ${t('cond.sun')}` : `☾ ${t('cond.dark')}`}</span>
            <span className={inst.dte ? 'chip earth' : 'chip off'}>{inst.dte ? `● ${t('cond.earth')}` : `○ ${t('cond.noEarth')}`}</span>
            <GroundChip />
          </div>
        ) : (
          <p className="hint">{site ? t('outside') : t('loading')}</p>
        )}
      </div>
      <div className="section">
        <div className="cd">
          {card(cd?.sun.visible ? 'cd.sunsets' : 'cd.sunrises', cd?.sun.next ?? null, cd?.sun.pm ?? null, 'cd-sun')}
          {card(cd?.earth.visible ? 'cd.earthsets' : 'cd.earthrises', cd?.earth.next ?? null, cd?.earth.pm ?? null, 'cd-earth')}
          {card(cd?.dte.visible ? 'cd.dteends' : 'cd.dtestarts', cd?.dte.next ?? null, cd?.dte.pm ?? null, 'cd-dte')}
          <div className="card">
            <div className="k">{t('wb.grade')}</div>
            <div className="v">
              <span className={`badge grade-${site?.grade}`}>{site?.grade ?? '—'}</span>
            </div>
            <div className="k">{site ? t(`grade.${site.grade}`) : ''}</div>
          </div>
        </div>
      </div>
      <div className="section">
        <h2>{t('sky.title')}</h2>
        <SkyPlot layers={layers} analysis={analysis} inst={inst} />
        {site && <p className="hint">{t(`terrain.${site.terrain}`)}</p>}
      </div>
      {top3.data && top3.data.top.length > 0 && (
        <div className="section">
          <h2>{t('tradeoff.title')}</h2>
          <TradeOff rows={top3.data.top.map((o, k) => ({ label: 'ABC'[k], sun: o.lit * winH, dte: o.dte * winH, night: o.nightH, margin: o.margin }))} />
        </div>
      )}
      <Workbench />
    </>
  )
}

function GroundChip() {
  const { site } = useCurrentSite()
  const safety = useStore((s) => s.lander)
  void safety
  if (!site || site.terrain === 'sphere') return <span className="chip off">⛰ —</span>
  return <SafetyChip />
}

import { useSafety } from './Workbench'
function SafetyChip() {
  const { t } = useT()
  const s = useSafety()
  if (!s) return <span className="chip off">⛰ …</span>
  const v = s.tip.verdict
  return (
    <span className={`chip ${v === 'green' ? 'ok' : v === 'amber' ? 'warn' : 'bad'}`} data-testid="ground-chip">
      ⛰ {t(v === 'green' ? 'cond.safe' : v === 'amber' ? 'cond.caution' : 'cond.unsafe')}
    </span>
  )
}

function TradeOff({ rows }: { rows: { label: string; sun: number; dte: number; night: number; margin: number }[] }) {
  const cols: { k: 'sun' | 'dte' | 'night' | 'margin'; name: string; unit: string; better: 'high' | 'low' }[] = [
    { k: 'sun', name: 'Sunlight', unit: 'h', better: 'high' },
    { k: 'dte', name: 'DTE', unit: 'h', better: 'high' },
    { k: 'night', name: 'Longest night', unit: 'h', better: 'low' },
    { k: 'margin', name: 'Tilt margin', unit: '°', better: 'high' },
  ]
  return (
    <div className="bars" style={{ gridTemplateColumns: 'auto repeat(3, 1fr)' }} data-testid="tradeoff">
      <span />
      {rows.map((r) => (
        <b key={r.label} style={{ textAlign: 'center' }}>
          {r.label}
        </b>
      ))}
      {cols.map((c) => {
        const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r[c.k])))
        return (
          <FragmentRow key={c.k} name={`${c.name} (${c.unit}) ${c.better === 'high' ? '↑' : '↓'}`} values={rows.map((r) => r[c.k])} max={max} />
        )
      })}
    </div>
  )
}

function FragmentRow({ name, values, max }: { name: string; values: number[]; max: number }) {
  return (
    <>
      <span>{name}</span>
      {values.map((v, i) => (
        <span key={i} title={v.toFixed(1)} style={{ display: 'grid', gap: 2 }}>
          <span className="bar">
            <i style={{ width: `${(100 * Math.max(0, v)) / max}%` }} />
          </span>
          <span className="hint" style={{ textAlign: 'center' }}>
            {v.toFixed(v >= 100 ? 0 : 1)}
          </span>
        </span>
      ))}
    </>
  )
}

export const HOURS = HOUR
