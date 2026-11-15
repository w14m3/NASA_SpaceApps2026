// Explore mode — the simple, map-first screen: one 3D Moon you move like a map, one search bar, one card that answers
// "Can it land? Can it make power? Can it talk to Earth?" in plain words, the best three spots nearby, one time bar.
// Experts switch to Plan mode for the full workbench (same data, same core).
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { DAY, HOUR } from '../core/constants'
import { HERO_REGIONS } from '../core/regions'
import { fmtDur, fmtLat, fmtLon, fmtUtc, useT } from './i18n'
import { setState, useStore } from './store'
import { useEphemeris, useSites, useTop3 } from './hooks'
import { useCountdowns, useCurrentSite, useInstant } from './current'
import { useSafety } from './Workbench'
import { Search, Top3Cards, selectSite } from './LeftPanel'
import { Logo, PRODUCT_NAME } from './TopBar'
import type { GlobeHandle, Marker } from './globe/MoonGlobe'

const MoonGlobe = lazy(() => import('./globe/MoonGlobe'))
const LETTERS = ['A', 'B', 'C']

export function ExploreShell() {
  const { t, lang } = useT()
  const eph = useEphemeris()
  const tNow = useStore((s) => s.t)
  const region = useStore((s) => s.region)
  const sites = useSites()
  const top3 = useTop3()
  const { site } = useCurrentSite()
  const [lit, setLit] = useState(false)
  const [exag, setExag] = useState(2)
  const [labelsOn, setLabelsOn] = useState(true)
  const globe = useRef<GlobeHandle | null>(null)
  const markers = useMemo<Marker[]>(() => {
    const out: Marker[] = []
    if (labelsOn)
      for (const s of sites)
        out.push({ id: s.id, lon: s.lon, lat: s.lat, label: s.name, kind: 'site', onClick: () => selectSite({ kind: 'curated', id: s.id }, sites) })
    top3.data?.top.forEach((o, k) =>
      out.push({ id: `top-${k}`, lon: o.lon, lat: o.lat, label: LETTERS[k], kind: 'top', onClick: () => setState({ sel: { kind: 'candidate', region, i: o.i }, chosen: k }) }),
    )
    if (site) out.push({ id: 'selected', lon: site.lon, lat: site.lat, label: '◎', kind: 'selected' })
    return out
  }, [sites, top3.data, site, labelsOn, region])
  const focus = site ? { lon: site.lon, lat: site.lat, key: site.key } : null
  const onPick = useCallback((lon: number, lat: number) => selectSite({ kind: 'custom', lon, lat }, sites), [sites])
  return (
    <div className="explore" id="explore-map" data-testid="explore">
      <Suspense fallback={<div className="globe-loading">{t('loading')}</div>}>
        <MoonGlobe eph={eph} t={tNow} markers={markers} focus={focus} lit={lit} exaggeration={exag} onPick={onPick} onReady={(h) => (globe.current = h)} />
      </Suspense>
      <header className="ex-top">
        <div className="ex-brand">
          <Logo size={28} />
          <b>{PRODUCT_NAME}</b>
        </div>
        <div className="ex-search">
          <Search />
        </div>
        <div className="spacer" />
        <ModeSwitch />
        <button className="btn ghost small" onClick={() => setState({ lang: lang === 'en' ? 'fr' : 'en' })} data-testid="lang">
          {t('lang.switch')}
        </button>
      </header>
      <PlaceCard />
      <div className="map-controls" role="toolbar" aria-label="Map controls">
        <button className="mc" onClick={() => globe.current?.zoom(1 / 2)} aria-label="Zoom in" data-testid="zoom-in">
          +
        </button>
        <button className="mc" onClick={() => globe.current?.zoom(2)} aria-label="Zoom out" data-testid="zoom-out">
          −
        </button>
        <button className="mc" onClick={() => globe.current?.resetNorth()} aria-label="North up, look straight down" title="North up">
          N
        </button>
        <button className="mc wide" onClick={() => globe.current?.flyTo(0, -89.9, 420, 0)} title="Fly to the south pole" data-testid="fly-pole">
          ⊙ {lang === 'fr' ? 'Pôle Sud' : 'South pole'}
        </button>
        <button className="mc wide" onClick={() => globe.current?.flyTo(0, -25, 7200, 0)} title="Whole Moon (near side)" data-testid="fly-moon">
          ◯ {lang === 'fr' ? 'Lune entière' : 'Whole Moon'}
        </button>
        <div className="seg" role="group" aria-label="Lighting">
          <button aria-pressed={!lit} onClick={() => setLit(false)} data-testid="light-map">
            {lang === 'fr' ? 'Carte' : 'Map'}
          </button>
          <button aria-pressed={lit} onClick={() => setLit(true)} data-testid="light-sun">
            ☀ {lang === 'fr' ? 'Soleil réel' : 'Real Sun'}
          </button>
        </div>
        <label className="mc-range">
          {lang === 'fr' ? 'Relief' : 'Relief'} ×{exag}
          <input type="range" min={1} max={5} value={exag} onChange={(e) => setExag(Number(e.target.value))} aria-label="Vertical exaggeration of the 3D relief" data-testid="relief" />
        </label>
        <label className="mc-check">
          <input type="checkbox" checked={labelsOn} onChange={(e) => setLabelsOn(e.target.checked)} /> {lang === 'fr' ? 'Noms' : 'Labels'}
        </label>
      </div>
      <TimeBar />
      <p
        className="ex-credit"
        title={`${exag > 1 ? `Vertical exaggeration ×${exag}, for visibility. ` : 'True-scale relief. '}Imagery: NASA Moon Trek — LRO WAC global mosaic (NASA/GSFC/Arizona State University) and LOLA 30 m / 10 m shaded relief. Terrain heights: LOLA (NASA GSFC PGDA). ${lit ? 'Lit by the true Sun at the time shown; shadows are rendered on the GPU from LOLA terrain (visual only: the numbers come from the validated horizon model).' : 'Flat map lighting.'}`}
      >
        {exag > 1 ? `Relief ×${exag} (exaggerated)` : 'Relief ×1'} · NASA Moon Trek: LRO WAC, LOLA relief · LOLA terrain · {lit ? 'true Sun, GPU shadows (visual)' : 'map lighting'}
      </p>
    </div>
  )
}

function ModeSwitch() {
  const { t } = useT()
  const mode = useStore((s) => s.mode)
  return (
    <div className="seg" role="group" aria-label="Mode">
      {(['explore', 'plan', 'learn'] as const).map((m) => (
        <button key={m} aria-pressed={mode === m} onClick={() => setState({ mode: m, tour: m === 'learn' ? 0 : -1 })}>
          {t(`mode.${m}`)}
        </button>
      ))}
    </div>
  )
}

type Q = 'good' | 'fair' | 'poor' | 'unknown'
const ICON: Record<Q, string> = { good: '✔', fair: '◐', poor: '✖', unknown: '…' }

function Answer({ q, title, verdict, text, testid }: { q: Q; title: string; verdict: string; text: string; testid: string }) {
  return (
    <div className={`answer a-${q}`} data-testid={testid}>
      <span className="a-icon" aria-hidden="true">
        {ICON[q]}
      </span>
      <div>
        <div className="a-title">
          {title} <b className="a-verdict">{verdict}</b>
        </div>
        <div className="a-text">{text}</div>
      </div>
    </div>
  )
}

function PlaceCard() {
  const { lang } = useT()
  const fr = lang === 'fr'
  const { site, analysis: a } = useCurrentSite()
  const inst = useInstant(site)
  const cd = useCountdowns(site)
  const safety = useSafety()
  const tNow = useStore((s) => s.t)
  const dur = useStore((s) => s.durDays)
  const region = useStore((s) => s.region)
  const [open, setOpen] = useState(true)
  const r = HERO_REGIONS.find((x) => x.id === region)
  if (!site) return <aside className="place-card">{fr ? 'Chargement…' : 'Loading…'}</aside>
  const pct = (v: number) => `${Math.round(v * 100)} %`
  const land: Q = site.terrain === 'sphere' ? 'unknown' : !safety ? 'unknown' : safety.tip.verdict === 'green' ? 'good' : safety.tip.verdict === 'amber' ? 'fair' : 'poor'
  const power: Q = !a ? 'unknown' : a.litFrac.value >= 0.6 ? 'good' : a.litFrac.value >= 0.3 ? 'fair' : 'poor'
  const link: Q = !a ? 'unknown' : a.dteFrac.value >= 0.5 ? 'good' : a.dteFrac.value >= 0.15 ? 'fair' : 'poor'
  const word = (q: Q) => (fr ? { good: 'Oui', fair: 'Possible', poor: 'Difficile', unknown: '…' } : { good: 'Yes', fair: 'Maybe', poor: 'Hard', unknown: '…' })[q]
  return (
    <aside className={'place-card' + (open ? '' : ' closed')} aria-label={fr ? 'Ce lieu' : 'This place'} data-testid="place-card">
      <button className="pc-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '▾' : '▸'}
      </button>
      <div className="pc-head">
        <h1>{site.name}</h1>
        <div className="hint">
          {fmtLat(site.lat)} {fmtLon(site.lon)} · {fr ? 'mât' : 'mast'} {site.h} m{site.status === 'unverified' ? (fr ? ' · coordonnée non vérifiée' : ' · coordinate unverified') : ''}
        </div>
      </div>
      {open && (
        <>
          {inst && (
            <div className="pc-now" data-testid="now-line">
              <span className={inst.sunFrac > 0 ? 'chip sun' : 'chip off'}>
                {inst.sunFrac > 0 ? '☀' : '☾'} {fr ? 'Soleil' : 'Sun'} {inst.sunAboveHorizon >= 0 ? '+' : '−'}
                {Math.abs(inst.sunAboveHorizon).toFixed(1)}° {fr ? 'au-dessus de l’horizon' : 'above the skyline'}
              </span>
              {cd && cd.sun.next !== null && (
                <span className="chip off">
                  {cd.sun.visible ? (fr ? 'se couche dans' : 'sets in') : fr ? 'se lève dans' : 'rises in'} {fmtDur(cd.sun.next - tNow, lang)}
                </span>
              )}
              <span className={inst.dte ? 'chip earth' : 'chip off'}>{inst.dte ? (fr ? '● Liaison Terre' : '● Earth link') : fr ? '○ Pas de liaison' : '○ No Earth link'}</span>
            </div>
          )}
          <div className="answers">
            <Answer
              q={land}
              title={fr ? 'Peut-on s’y poser ?' : 'Can it land?'}
              verdict={word(land)}
              testid="answer-land"
              text={
                site.terrain === 'sphere'
                  ? fr
                    ? 'Pas de données de relief ici (relief disponible au sud de 80°S).'
                    : 'No terrain data here (terrain is available south of 80°S).'
                  : !safety
                    ? '…'
                    : fr
                      ? `Pente ${safety.fit.slope.toFixed(1)}° sur ${safety.fit.baseline} m. Un atterrisseur moyen générique bascule au-delà de ${safety.tip.vCrit.toFixed(1)} m/s latéralement.`
                      : `Slope ${safety.fit.slope.toFixed(1)}° over ${safety.fit.baseline} m. A generic medium lander tips over only above ${safety.tip.vCrit.toFixed(1)} m/s sideways.`
              }
            />
            <Answer
              q={power}
              title={fr ? 'Énergie solaire ?' : 'Can it make power?'}
              verdict={word(power)}
              testid="answer-power"
              text={!a ? '…' : fr ? `Éclairé ${pct(a.litFrac.value)} des ${dur} prochains jours ; plus longue nuit ${Math.round(a.longestDarkH.value)} h.` : `Sunlit ${pct(a.litFrac.value)} of the next ${dur} days; longest night ${Math.round(a.longestDarkH.value)} h.`}
            />
            <Answer
              q={link}
              title={fr ? 'Contact avec la Terre ?' : 'Can it talk to Earth?'}
              verdict={word(link)}
              testid="answer-link"
              text={!a ? '…' : fr ? `Liaison directe ${pct(a.dteFrac.value)} du temps (Terre visible et une antenne du DSN voit la Lune) ; plus long silence ${Math.round(a.longestDteGapH)} h.` : `Direct link ${pct(a.dteFrac.value)} of the time (Earth in view and a Deep Space Network dish sees the Moon); longest silence ${Math.round(a.longestDteGapH)} h.`}
            />
          </div>
          <div className="pc-actions">
            <button className="btn small" onClick={() => setState({ mode: 'plan' })} data-testid="full-analysis">
              {fr ? 'Analyse complète' : 'Full analysis'}
            </button>
            <button className="btn small" onClick={() => setState({ mode: 'plan', view: 'street' })}>
              {fr ? 'Vue au sol' : 'Street View'}
            </button>
            <button className="btn small" onClick={() => setState({ page: 'trust' })}>
              {fr ? 'Méthodes' : 'How we know'}
            </button>
          </div>
          <h2 className="pc-sub">
            {fr ? 'Les 3 meilleurs endroits' : 'Best 3 spots'} · {r?.name}
          </h2>
          <Top3Cards compact />
          <p className="hint">{fr ? 'Cliquez n’importe où sur la Lune pour analyser ce point.' : 'Click anywhere on the Moon to analyse that spot.'} {fr ? 'Estimations de dépistage, hypothèses dans Analyse complète.' : 'Screening estimates; assumptions in Full analysis.'}</p>
        </>
      )}
    </aside>
  )
}

function TimeBar() {
  const { lang } = useT()
  const fr = lang === 'fr'
  const tNow = useStore((s) => s.t)
  const landing = useStore((s) => s.landing)
  const dur = useStore((s) => s.durDays)
  const playing = useStore((s) => s.playing)
  const t0 = landing
  const t1 = landing + dur * DAY
  const f = Math.max(0, Math.min(1, (tNow - t0) / (t1 - t0)))
  return (
    <div className="timebar" role="group" aria-label={fr ? 'Temps' : 'Time'}>
      <button className="btn small" onClick={() => setState((s) => ({ t: s.t - DAY, landing: s.t - DAY < s.landing ? s.landing - DAY : s.landing }))} aria-label="One day earlier">
        −1 {fr ? 'j' : 'd'}
      </button>
      <button className="btn small primary" onClick={() => setState((s) => ({ playing: !s.playing, speed: 6 * 3600, t: s.t >= t1 ? t0 : s.t }))} aria-pressed={playing} data-testid="play">
        {playing ? '❚❚' : '▶'}
      </button>
      <button className="btn small" onClick={() => setState((s) => ({ t: s.t + DAY, landing: s.t + DAY > s.landing + s.durDays * DAY ? s.landing + DAY : s.landing }))} aria-label="One day later">
        +1 {fr ? 'j' : 'd'}
      </button>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(f * 1000)}
        onChange={(e) => setState({ t: Math.round(t0 + (Number(e.target.value) / 1000) * (t1 - t0)), playing: false })}
        aria-label={fr ? 'Heure dans la fenêtre de mission' : 'Time within the mission window'}
        aria-valuetext={fmtUtc(tNow)}
        data-testid="time-slider"
      />
      <span className="tb-time" data-testid="time-label">
        {fmtUtc(tNow)}
      </span>
      <span className="hint tb-window">
        {fr ? 'fenêtre' : 'window'} {new Date(t0).toISOString().slice(0, 10)} + {dur} {fr ? 'j' : 'd'} · {Math.round((tNow - t0) / HOUR)} h
      </span>
    </div>
  )
}
