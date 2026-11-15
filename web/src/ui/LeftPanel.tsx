import { useMemo, useState } from 'react'
import { HERO_REGIONS } from '../core/regions'
import { fmtLat, fmtLon, fmtUtc, useT } from './i18n'
import { effectiveHeight, useSites, useTop3 } from './hooks'
import { sameRef, setState, useStore, type SiteRef } from './store'
import type { CuratedSite } from './data'
import { ConstraintsPanel } from './Constraints'

const LETTERS = ['A', 'B', 'C']

export function selectSite(ref: SiteRef, sites: CuratedSite[]) {
  setState((s) => ({ sel: ref, h: effectiveHeight(ref, s.h, sites), page: 'main' }))
}

export function parseCoords(q: string): { lat: number; lon: number } | null {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?$/i)
  if (!m) return null
  let lat = Number(m[1])
  let lon = Number(m[3])
  if (m[2]?.toUpperCase() === 'S') lat = -Math.abs(lat)
  if (m[4]?.toUpperCase() === 'W') lon = -Math.abs(lon)
  if (Math.abs(lat) > 90 || lon < -180 || lon > 360) return null
  return { lat, lon: ((lon + 540) % 360) - 180 }
}

function Search() {
  const { t } = useT()
  const sites = useSites()
  const [q, setQ] = useState('')
  const coords = parseCoords(q)
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2 || coords) return []
    const regionHits = HERO_REGIONS.filter((r) => r.name.toLowerCase().includes(s)).map((r) => ({ kind: 'region' as const, id: r.id, name: r.name }))
    const siteHits = sites.filter((x) => (x.name + ' ' + x.description).toLowerCase().includes(s)).map((x) => ({ kind: 'site' as const, id: x.id, name: x.name }))
    return [...siteHits, ...regionHits].slice(0, 8)
  }, [q, sites, coords])
  return (
    <div className="field" role="search">
      <label htmlFor="search">{t('search.label')}</label>
      <input
        id="search"
        className="input"
        value={q}
        placeholder={t('search.placeholder')}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (coords) selectSite({ kind: 'custom', ...coords }, sites)
          else if (hits[0]?.kind === 'site') selectSite({ kind: 'curated', id: hits[0].id }, sites)
          else if (hits[0]?.kind === 'region') setState({ region: hits[0].id, view: 'pole' })
        }}
        aria-describedby="search-results"
        data-testid="search"
      />
      <div id="search-results" aria-live="polite">
        {coords && (
          <button className="btn small" onClick={() => selectSite({ kind: 'custom', ...coords }, sites)} data-testid="search-go">
            {t('search.coords')}: {fmtLat(coords.lat)} {fmtLon(coords.lon)}
          </button>
        )}
        {hits.length > 0 && (
          <ul className="sites">
            {hits.map((h) => (
              <li key={h.kind + h.id}>
                <button onClick={() => (h.kind === 'site' ? selectSite({ kind: 'curated', id: h.id }, sites) : setState({ region: h.id, view: 'pole' }))}>{h.name}</button>
              </li>
            ))}
          </ul>
        )}
        {q.trim().length >= 2 && !coords && hits.length === 0 && <span className="hint">{t('search.none')}</span>}
      </div>
    </div>
  )
}

function CustomForm() {
  const { t } = useT()
  const sites = useSites()
  const [lat, setLat] = useState('-89.50')
  const [lon, setLon] = useState('-140.00')
  const la = Number(lat)
  const lo = Number(lon)
  const valid = lat.trim() !== '' && lon.trim() !== '' && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && lo >= -180 && lo <= 360
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) selectSite({ kind: 'custom', lat: la, lon: ((lo + 540) % 360) - 180 }, sites)
      }}
      aria-label={t('custom.title')}
    >
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="clat">{t('custom.lat')}</label>
          <input id="clat" className="input" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} aria-invalid={!valid} data-testid="custom-lat" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="clon">{t('custom.lon')}</label>
          <input id="clon" className="input" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} aria-invalid={!valid} data-testid="custom-lon" />
        </div>
      </div>
      {!valid && <p className="err" role="alert">{t('custom.invalid')}</p>}
      <div className="row">
        <button className="btn" type="submit" disabled={!valid} data-testid="custom-apply">
          {t('custom.apply')}
        </button>
        <span className="hint">{t('custom.hint')}</span>
      </div>
    </form>
  )
}

export function Top3Cards({ compact = false }: { compact?: boolean }) {
  const { t, n, lang } = useT()
  const sel = useStore((s) => s.sel)
  const region = useStore((s) => s.region)
  const relax = useStore((s) => s.relax)
  const { data, progress, loading, error } = useTop3()
  const r = HERO_REGIONS.find((x) => x.id === region)
  if (error) return <p className="err" role="alert">Top 3 failed: {error.split('\n')[0]}</p>
  if (!data || loading)
    return (
      <div aria-live="polite" data-testid="top3-loading">
        <p className="hint">{t('top3.computing', { n: 3721 })}</p>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
    )
  if (!data.top.length) {
    const worst = Object.entries(data.failedCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    return (
      <div role="status">
        <p>{t('top3.none')}</p>
        {worst && (
          <button className="btn small" onClick={() => setState({ relax: [relax, worst].filter(Boolean).join(',') })} data-testid="relax">
            {t('top3.relax')} ({worst})
          </button>
        )}
      </div>
    )
  }
  return (
    <div data-testid="top3">
      <p className="hint">
        {t('top3.region')}: {r?.name} · {t('top3.feasible', { f: String(data.feasibleCount), n: String(data.total) })} · {data.heightUsed} m mast · {data.demLabel}, slope baseline {data.slopeBaselineM} m
      </p>
      {data.top.map((o, k) => {
        const ref: SiteRef = { kind: 'candidate', region, i: o.i }
        const active = sameRef(sel, ref)
        return (
          <article
            key={o.i}
            className={'opt' + (active ? ' active' : '')}
            onClick={() => setState({ sel: ref, chosen: k })}
            data-testid={`option-${LETTERS[k]}`}
          >
            <h3>
              <span className="letter" aria-hidden="true">
                {LETTERS[k]}
              </span>
              <button className="btn ghost small" style={{ padding: 0, border: 0, fontWeight: 650 }} onClick={(e) => (e.stopPropagation(), setState({ sel: ref, chosen: k }))}>
                {t('top3.option', { k: LETTERS[k] })} · {t(`strength.${o.label}`)}
              </button>
              <span className="spacer" />
              <span className={`badge grade-${o.nearShare >= 0.25 ? 'C' : 'B'}`} title={t(`grade.${o.nearShare >= 0.25 ? 'C' : 'B'}`)}>
                {o.nearShare >= 0.25 ? 'C' : 'B'}
              </span>
            </h3>
            <div className="hint">
              {fmtLat(o.lat)} {fmtLon(o.lon)} · z {n(o.z0, 0)} m
            </div>
            {!compact && (
              <>
                <ul>
                  {o.reasons.map((rs) => (
                    <li key={rs.key}>{t(rs.key, fmtVars(rs.v, rs.key, lang))}</li>
                  ))}
                </ul>
                <div className="hint">
                  ⚠ {t('top3.risk')}: {t(o.risk.key, fmtVars(o.risk.v, o.risk.key, lang))}
                </div>
              </>
            )}
            <div className="bars" style={{ marginTop: 6 }}>
              {(['safety', 'power', 'link'] as const).map((k2) => (
                <Bar key={k2} label={t(k2 === 'safety' ? 'wb.safety' : k2 === 'power' ? 'wb.power' : 'wb.link')} v={o.scores[k2]} />
              ))}
              <Bar label={t('wb.combined')} v={o.combined} />
            </div>
            {!compact && <div className="hint">{t('top3.bestDate', { d: fmtUtc(o.bestStart).slice(0, 10) })}</div>}
            {active && !compact && (
              <button className="btn primary small" style={{ marginTop: 6 }} onClick={(e) => (e.stopPropagation(), setState({ page: 'brief', chosen: k }))} data-testid="choose">
                {t('top3.choose')}
              </button>
            )}
          </article>
        )
      })}
    </div>
  )
}

/** Format reason values: hours and percentages without decimals, angles and distances with one, speeds with two. */
export function fmtVars(v: Record<string, number | string>, reasonKey = '', lang: 'en' | 'fr' = 'en') {
  const o: Record<string, string> = {}
  const angle = reasonKey.endsWith('.slope') || reasonKey.endsWith('.margin')
  for (const [k, x] of Object.entries(v)) {
    if (typeof x !== 'number') {
      o[k] = x
      continue
    }
    const digits = k === 'v' ? 2 : k === 'km' || k === 'm' || k === 's' || (k === 'med' && angle) ? 1 : 0
    o[k] = x.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  }
  return o
}

function Bar({ label, v }: { label: string; v: number }) {
  return (
    <>
      <span>{label}</span>
      <span className="bar" role="img" aria-label={`${label} ${Math.round(v)} / 100`}>
        <i style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </span>
      <span>{Math.round(v)}</span>
    </>
  )
}

const LAYERS = ['relief', 'trek-lola10', 'trek-lola30', 'trek-wac', 'trek-psr', 'lighting', 'lit', 'night', 'zero', 'earth', 'dte', 'slope', 'viability', 'gain', 'rays', 'top3', 'pins', 'regions'] as const

export function Overlays() {
  const { t } = useT()
  const layers = useStore((s) => s.layers)
  const toggle = (l: string) => setState((s) => ({ layers: s.layers.includes(l) ? s.layers.filter((x) => x !== l) : [...s.layers.filter((x) => !(['lit', 'night', 'zero', 'earth', 'dte', 'slope', 'viability', 'gain'].includes(x) && ['lit', 'night', 'zero', 'earth', 'dte', 'slope', 'viability', 'gain'].includes(l))), l] }))
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }} data-testid="layers-panel">
      <legend className="sr-only">{t('layers.title')}</legend>
      {LAYERS.map((l) => (
        <label key={l} className="row" style={{ padding: '3px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={layers.includes(l)} onChange={() => toggle(l)} data-testid={`layer-${l}`} />
          <span>{t(`layer.${l}`)}</span>
        </label>
      ))}
    </fieldset>
  )
}

export function LeftPanel() {
  const { t } = useT()
  const mode = useStore((s) => s.mode)
  const sites = useSites()
  const sel = useStore((s) => s.sel)
  const region = useStore((s) => s.region)
  const groups = ['southPole', 'clps', 'international', 'apollo'] as const
  return (
    <>
      {mode === 'explore' && (
        <div className="section" style={{ background: 'var(--panel-2)' }} data-testid="promise">
          <p style={{ margin: 0 }}>{t('app.promise')}</p>
        </div>
      )}
      <div className="section">
        <h2>{t('left.title')}</h2>
        <Search />
        <label className="field">
          <span className="hint">{t('top3.region')}</span>
          <select className="input" value={region} onChange={(e) => setState({ region: e.target.value })} data-testid="region">
            {HERO_REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.status === 'unverified' ? ' *' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="section">
        <h2>{t('top3.title')}</h2>
        <ConstraintsPanel />
        <Top3Cards />
      </div>
      <div className="section">
        <details open>
          <summary>{t('group.southPole')} · {sites.length} sites</summary>
          {groups.map((g) => (
            <div key={g}>
              <div className="group-title">{t(`group.${g}`)}</div>
              <ul className="sites" data-testid={`group-${g}`}>
                {sites
                  .filter((s) => s.group === g)
                  .map((s) => {
                    const cur = sel.kind === 'curated' && sel.id === s.id
                    return (
                      <li key={s.id}>
                        <button aria-current={cur} onClick={() => selectSite({ kind: 'curated', id: s.id }, sites)} data-testid={`site-${s.id}`}>
                          <span className="radio" aria-hidden="true" />
                          <span style={{ flex: 1 }}>
                            {s.name}
                            <span className="hint" style={{ display: 'block' }}>
                              {fmtLat(s.lat)} {fmtLon(s.lon)}
                              {s.landing_utc ? ` · ${s.landing_utc.slice(0, 10)}` : ''}
                            </span>
                          </span>
                          <span className="badge" title={s.source_title}>
                            {s.status === 'verified' ? t('site.verified') : t('site.unverified')}
                          </span>
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </div>
          ))}
        </details>
      </div>
      <div className="section">
        <h2>{t('custom.title')}</h2>
        <CustomForm />
      </div>
      <div className="section">
        <h2>{t('layers.title')}</h2>
        <Overlays />
      </div>
      <p className="credits">{t('credits')}</p>
    </>
  )
}
