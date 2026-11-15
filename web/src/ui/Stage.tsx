import { lazy, Suspense } from 'react'
import { fmtDur, useT } from './i18n'
import { setState, useStore, type View } from './store'
import { useCountdowns, useCurrentSite, useInstant } from './current'
import { PolarMap } from './PolarMap'

const Globe = lazy(() => import('./Globe'))
const Site3D = lazy(() => import('./Site3D'))
const StreetView = lazy(() => import('./StreetView'))

export function Stage() {
  const { t } = useT()
  const view = useStore((s) => s.view)
  const { site } = useCurrentSite()
  return (
    <>
      <div className="views seg" role="tablist" aria-label="Views">
        {(['pole', 'globe', 'site3d', 'street'] as View[]).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setState({ view: v })} data-testid={`view-${v}`}>
            {t(`view.${v}`)}
          </button>
        ))}
      </div>
      <Suspense fallback={<div className="float solar">{t('loading')}</div>}>
        {view === 'pole' && <PolarMap site={site} />}
        {view === 'globe' && <Globe site={site} />}
        {view === 'site3d' && <Site3D site={site} />}
        {view === 'street' && <StreetView site={site} />}
      </Suspense>
      <SolarCard />
      <DteCard />
      {site && (
        <div className="float label-site" aria-live="polite" data-testid="site-label">
          <b>{site.name}</b> · {site.h} m mast
        </div>
      )}
    </>
  )
}

function SolarCard() {
  const { t, n, lang } = useT()
  const { site } = useCurrentSite()
  const inst = useInstant(site)
  const cd = useCountdowns(site)
  const tNow = useStore((s) => s.t)
  if (!site) return null
  if (!inst)
    return (
      <div className="float solar" role="status">
        {t('outside')}
      </div>
    )
  const above = inst.sunAboveHorizon
  const trend = inst.sun.el // trend from the next hour
  const next = cd?.sun.next ?? null
  const pm = cd?.sun.pm ?? null
  return (
    <section className="float solar" aria-label={t('card.solarEl')} data-testid="solar-card">
      <div className="label">{t('card.solarEl')}</div>
      <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
        <span className="big" data-testid="solar-el">
          {above >= 0 ? '+' : '−'}
          {n(Math.abs(above), 2)}°
        </span>
        <span className={inst.sunFrac > 0 ? 'chip sun' : 'chip off'}>{inst.sunFrac > 0 ? `☀ ${t('cond.sun')}` : `☾ ${t('cond.dark')}`}</span>
      </div>
      <div className="label">{t('card.trueEl', { el: Number(inst.sun.el.toFixed(2)), m: Number(inst.sunMaskEl.toFixed(2)), f: Math.round(inst.sunFrac * 100) })}</div>
      {cd && (
        <div className="label" style={{ marginTop: 4 }} data-testid="sun-countdown">
          {cd.sun.visible ? t('cd.sunsets') : t('cd.sunrises')}{' '}
          <b style={{ color: 'var(--text)' }}>{next === null ? t('cd.none') : fmtDur(next - tNow, lang)}</b>
          {pm !== null && next !== null ? ` ± ${fmtDur(pm, lang)}` : ''}
        </div>
      )}
      <span className="sr-only">{trend}</span>
    </section>
  )
}

function DteCard() {
  const { t, lang } = useT()
  const { site } = useCurrentSite()
  const inst = useInstant(site)
  const cd = useCountdowns(site)
  const tNow = useStore((s) => s.t)
  if (!site || !inst) return null
  const active = inst.dte
  const next = cd?.dte.next ?? null
  return (
    <section className="float dte" aria-label={t('card.dte')} data-testid="dte-card">
      <div className="label">{t('card.dte')}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: active ? 'var(--earth)' : 'var(--muted)' }}>
        {active ? '● ' : '○ '}
        {active ? t('card.dteActive', { d: next ? fmtDur(next - tNow, lang) : '—' }) : t('card.dteNext', { d: next ? fmtDur(next - tNow, lang) : '—' })}
      </div>
      <div className="label">
        {t('card.stations', { s: inst.stationsUp.length ? inst.stationsUp.map((s) => `${s.id} ${s.el.toFixed(0)}°`).join(', ') : '—' })}
      </div>
      <div className="label">
        Earth el {inst.earth.el.toFixed(2)}° · horizon {inst.earthMaskEl.toFixed(2)}° · disk {Math.round(inst.earthFrac * 100)}%
      </div>
      <div className="hint">{t('wb.visNotLink')}</div>
    </section>
  )
}
