// Site Workbench (contract §6.7–6.10, §7.14): verdict, scores with confidence, metrics with definitions, energy,
// connectivity, safety and thermal panels, exports. Every number comes from the core.
import { useMemo, useState } from 'react'
import { HOUR } from '../core/constants'
import type { SiteAnalysis } from '../core/analysis'
import { LANDERS } from '../core/safety'
import { linkScore, powerScore, safetyScore } from '../core/top3'
import { fmtDur, fmtLat, fmtLon, fmtUtc, useT } from './i18n'
import { sameRef, setState, shareUrl, useStore } from './store'
import { useAsync } from './hooks'
import { useCurrentSite, useInstant } from './current'
import { rpc } from './workerClient'
import type { ResolvedSite } from './data'
import { Insights } from './Insights'

export function useSafety() {
  const { site } = useCurrentSite()
  const lander = useStore((s) => s.lander)
  const key = site && site.terrain !== 'sphere' ? `${site.lon.toFixed(5)},${site.lat.toFixed(5)},${lander}` : null
  return useAsync(key, () => rpc.safety({ lon: site!.lon, lat: site!.lat, lander, ellipse: { a: 100, b: 50, orientation: 0 }, maxSlope: 8, seed: 1 })).data
}

export function useEnergyOpt(site: ResolvedSite | null) {
  const landing = useStore((s) => s.landing)
  const dur = useStore((s) => s.durDays)
  const [objective, setObjective] = useState<'total' | 'worst'>('total')
  const key = site ? `${site.key}|${landing}|${dur}|${objective}` : null
  const res = useAsync(key, async () => {
    const masks: Record<string, ResolvedSite['mask']> = {}
    if (site!.terrain === 'precomputed' || site!.terrain === 'live') {
      // both heights where available (curated: 80 m-based masks at 2 and 10 m; live: computed now)
      const { resolveCached } = await import('./hooks')
      for (const h of [2, 10]) masks[String(h)] = (await resolveCached(site!.ref, h)).mask
    } else masks[String(site!.h)] = site!.mask
    return rpc.optimise({ site: { lon: site!.lon, lat: site!.lat, z0: site!.z0, h: site!.h }, masks, t0: landing, t1: landing + dur * 86_400_000, objective })
  })
  return { ...res, objective, setObjective }
}

export function verdictParts(a: SiteAnalysis, tip: { verdict: string; vCrit: number } | null) {
  return {
    power: a.litFrac.value >= 0.6 ? 'good' : a.litFrac.value >= 0.3 ? 'fair' : 'poor',
    link: a.dteFrac.value >= 0.5 ? 'good' : a.dteFrac.value >= 0.15 ? 'fair' : 'poor',
    land: tip ? (tip.verdict === 'green' ? 'good' : tip.verdict === 'amber' ? 'fair' : 'poor') : 'unknown',
  }
}

const DEF: Record<string, string> = {
  lit: 'Share of the window with ≥ 1 % of the solar disk above the terrain horizon (instrument at mast height). ± = with the upper/lower horizon masks.',
  earth: 'Share of the window with ≥ 50 % of Earth’s disk above the terrain horizon.',
  dte: 'Direct-to-Earth: Earth in view at the site AND at least one ground station sees the Moon above its minimum elevation.',
  night: 'Longest continuous interval without sunlight inside the window (open-ended if it reaches the window edge).',
  gap: 'Longest interval without a direct-to-Earth window.',
  energy: 'Electrical energy of the array over the window: η · A · ∫ S · f☉ · cos i dt · (1 − losses). Assumptions: η 30 %, A 2 m², losses 15 %.',
  cf: 'Capacity factor = E / (η · A · S₀ · T): energy relative to a panel always facing a fully visible Sun at 1 au.',
  storage: 'Battery needed to cross the longest night: P_load · T_dark / (DoD · η_batt); mass at 150 Wh/kg (assumption).',
  range: 'Distance site–Earth centre over the window; light time = range / c.',
  fspl: 'Free-space path loss 20·log₁₀(4π d f / c) at nominal S (2.2 GHz), X (8.4 GHz), Ka (32 GHz).',
  envelope: 'Smallest cone holding every Earth direction while Earth is in view: best fixed antenna boresight and its half-angle (gimbal range).',
  sep: 'Hours with Sun–Earth separation below 5° while the Sun is up (solar interference flag; threshold is an assumption).',
  peak: 'Highest true elevation of the Sun centre in the window (above the local horizontal, not the terrain).',
}

function Def({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="def" title={DEF[k]} tabIndex={0} aria-label={`${typeof children === 'string' ? children : ''}: ${DEF[k]}`}>
      {children}
    </span>
  )
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)} %`
}

export function Workbench() {
  const { t, n, lang } = useT()
  const { site, analysis: a, analysisLoading } = useCurrentSite()
  const inst = useInstant(site)
  const safety = useSafety()
  const opt = useEnergyOpt(site)
  const lander = useStore((s) => s.lander)
  const pins = useStore((s) => s.pins)
  const h = useStore((s) => s.h)
  const [copied, setCopied] = useState(false)
  const scores = useMemo(() => {
    if (!a) return null
    const p = powerScore(a.litFrac.value, a.longestDarkH.value)
    const l = linkScore(a.dteFrac.value, a.longestDteGapH)
    const s = safety ? safetyScore(safety.tip.margin, safety.tip.vCrit, safety.mc.pSafe, LANDERS[lander]) : null
    const parts = [p, l, ...(s !== null ? [s] : [])].map((x) => Math.max(1e-9, x / 100))
    const comb = 100 * Math.exp(parts.reduce((acc, x) => acc + Math.log(x), 0) / parts.length)
    return { p, l, s, comb }
  }, [a, safety, lander])
  if (!site) return null
  const pinned = pins.some((p) => sameRef(p, site.ref))
  const vp = a ? verdictParts(a, safety?.tip ?? null) : null
  const word = (q: string) => (q === 'good' ? '✔' : q === 'fair' ? '◐' : q === 'poor' ? '✖' : '?')
  return (
    <div data-testid="workbench">
      <div className="section">
        <h2>{site.name}</h2>
        <div className="hint">
          {fmtLat(site.lat)} {fmtLon(site.lon)} · z₀ {n(site.z0, 0)} m · {t(`terrain.${site.terrain}`)}
          {site.status === 'unverified' && <> · ⚠ {t('site.unverified')}</>}
        </div>
        {site.curated && (
          <div className="hint">
            Source: <a href={site.curated.source_url} target="_blank" rel="noreferrer">{site.curated.source_title}</a>
          </div>
        )}
        <div className="row wrap" style={{ marginTop: 8 }}>
          <label className="row">
            {t('wb.mast')}
            <select className="input" style={{ width: 'auto' }} value={site.h} onChange={(e) => setState({ h: Number(e.target.value) })} data-testid="mast">
              {(site.terrain === 'precomputed' ? [2, 10] : [1, 2, 5, 10, 20, 30]).map((v) => (
                <option key={v} value={v}>
                  {v} m
                </option>
              ))}
            </select>
          </label>
          <button className="btn small" onClick={() => setState((s) => ({ pins: pinned ? s.pins.filter((p) => !sameRef(p, site.ref)) : [...s.pins, site.ref].slice(-4) }))} data-testid="pin">
            {pinned ? t('wb.unpin') : t('wb.pin')}
          </button>
          <button
            className="btn small"
            onClick={() => {
              navigator.clipboard?.writeText(shareUrl()).catch(() => undefined)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            data-testid="share"
          >
            {copied ? t('wb.copied') : t('wb.share')}
          </button>
          <button className="btn small" onClick={() => setState({ view: 'street' })}>
            {t('wb.street')}
          </button>
          <a className="btn small" href="https://quickmap.lroc.im-ldi.com/" target="_blank" rel="noreferrer" title="QuickMap (now hosted at quickmap.lroc.im-ldi.com) keeps its view in undocumented URL parameters, so this opens its home page; copy the coordinates shown above.">
            {t('wb.quickmap')} ↗
          </a>
        </div>
        {site.curated?.landing_utc && <Replay landing={site.curated.landing_utc} name={site.name} />}
        {h !== site.h && <p className="hint">Mast {h} m requested; precomputed 80 m-based masks exist at 2 m and 10 m, nearest used.</p>}
      </div>
      <div className="section" aria-live="polite">
        <h2>{t('wb.verdict')}</h2>
        {!a || analysisLoading ? (
          <p className="hint">{t('computing')}</p>
        ) : (
          <>
            <p data-testid="verdict">
              {word(vp!.power)} {t('verdict.power', { lit: pct(a.litFrac.value), night: fmtDur(a.longestDarkH.value * HOUR, lang) })} {word(vp!.link)} {t('verdict.earth', { dte: pct(a.dteFrac.value), gap: fmtDur(a.longestDteGapH * HOUR, lang) })}{' '}
              {safety ? (
                <>
                  {word(vp!.land)} {t('verdict.land', { s: n(safety.fit.slope, 1), b: String(safety.fit.baseline), v: n(safety.tip.vCrit, 2) })}
                </>
              ) : site.terrain === 'sphere' ? (
                'Landing: no terrain data here.'
              ) : (
                '…'
              )}
            </p>
            {scores && (
              <div className="bars">
                <ScoreBar label={t('wb.power')} v={scores.p} />
                <ScoreBar label={t('wb.link')} v={scores.l} />
                {scores.s !== null && <ScoreBar label={t('wb.safety')} v={scores.s} />}
                <ScoreBar label={t('wb.combined')} v={scores.comb} />
              </div>
            )}
            <p className="hint">
              {t('wb.grade')}: <span className={`badge grade-${site.grade}`}>{site.grade}</span> {t(`grade.${site.grade}`)}
              {site.mask.nearShare !== undefined && ` · near-field share ${Math.round(site.mask.nearShare * 100)} %`}
            </p>
          </>
        )}
      </div>
      {a && (
        <>
          <div className="section">
            <h2>{t('wb.metrics')}</h2>
            <p className="hint">
              {fmtUtc(a.t0)} → {fmtUtc(a.t1)} · mast {site.h} m · scan {a.scanStepMs / 60000} min + bisection to 1 s
            </p>
            <table className="metrics" data-testid="metrics">
              <tbody>
                <tr>
                  <td><Def k="lit">Sunlit</Def></td>
                  <td className="num">{pct(a.litFrac.value)}</td>
                  <td className="num hint">[{pct(a.litFrac.band[0])} – {pct(a.litFrac.band[1])}]</td>
                </tr>
                <tr>
                  <td><Def k="night">Longest night</Def></td>
                  <td className="num">{n(a.longestDarkH.value, 1)} h</td>
                  <td className="num hint">[{n(a.longestDarkH.band[1], 1)} – {n(a.longestDarkH.band[0], 1)} h]</td>
                </tr>
                <tr>
                  <td><Def k="earth">Earth in view</Def></td>
                  <td className="num">{pct(a.earthFrac.value)}</td>
                  <td className="num hint">[{pct(a.earthFrac.band[0])} – {pct(a.earthFrac.band[1])}]</td>
                </tr>
                <tr>
                  <td><Def k="dte">Direct-to-Earth</Def></td>
                  <td className="num">{pct(a.dteFrac.value)}</td>
                  <td className="num hint">[{pct(a.dteFrac.band[0])} – {pct(a.dteFrac.band[1])}]</td>
                </tr>
                <tr>
                  <td><Def k="gap">Longest DTE gap</Def></td>
                  <td className="num">{n(a.longestDteGapH, 1)} h</td>
                  <td />
                </tr>
                <tr>
                  <td><Def k="peak">Peak Sun elevation</Def></td>
                  <td className="num">{n(a.peakSunEl, 2)}°</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <EnergyPanel a={a} opt={opt} />
          <ConnectivityPanel a={a} />
          <SafetyPanel />
          <Insights site={site} />
          <div className="section">
            <h2>{t('wb.thermal')}</h2>
            <p data-testid="thermal">
              Cold soak (longest darkness): <b>{n(a.thermal.coldSoakH, 1)} h</b> → survival-heater energy <b>{n(a.thermal.heaterWh, 0)} Wh</b> at 20 W (assumption).{' '}
              {inst && inst.plateK !== null ? (
                <>
                  Now: a Sun-facing plate (α 0.9, ε 0.85, assumptions) reaches <b>{n(inst.plateK, 0)} K</b> ({n(inst.plateK - 273.15, 0)} °C) at radiative equilibrium.
                </>
              ) : (
                <>Now: in shadow — radiating to deep space, heaters required.</>
              )}
            </p>
            <p className="hint">Screening proxy: no conduction, no terrain infrared, no internal dissipation (§7.14).</p>
          </div>
          <Exports a={a} site={site} />
        </>
      )}
    </div>
  )
}

/** Mission replay (contract §6.4/§11, P11): jump to the published touchdown time and replay the first days. */
function Replay({ landing, name }: { landing: string; name: string }) {
  const hasTime = landing.length > 10
  const ms = Date.parse(hasTime ? landing : landing + 'T12:00:00Z')
  const inSpan = ms >= Date.UTC(2017, 0, 1) && ms < Date.UTC(2031, 0, 2)
  return (
    <div className="row wrap" style={{ marginTop: 6 }}>
      <button
        className="btn small"
        disabled={!inSpan}
        onClick={() => setState({ landing: Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), new Date(ms).getUTCDate()), durDays: 14, t: ms, view: 'street', playing: false })}
        data-testid="replay"
        title={inSpan ? '' : 'Outside the 2017–2031 ephemeris span'}
      >
        ⟲ Replay landing ({landing.slice(0, 16).replace('T', ' ')}{hasTime ? ' UTC' : ', time not published: 12:00 UTC used'})
      </button>
      <span className="hint">{name}: touchdown time and position from the cited source; conditions are Sightline predictions.</span>
    </div>
  )
}

function ScoreBar({ label, v }: { label: string; v: number }) {
  return (
    <>
      <span>{label}</span>
      <span className="bar" role="img" aria-label={`${label} ${Math.round(v)} out of 100`}>
        <i style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </span>
      <span>{Math.round(v)}</span>
    </>
  )
}

function EnergyPanel({ a, opt }: { a: SiteAnalysis; opt: ReturnType<typeof useEnergyOpt> }) {
  const { t, n } = useT()
  const o = opt.data
  const headline =
    o && o.baseline && o.best
      ? {
          gain: ((o.best.wh - o.baseline.wh) / Math.max(1e-9, o.baseline.wh)) * 100,
          blackout: o.baseline.darkH - o.best.darkH,
        }
      : null
  return (
    <div className="section" data-testid="energy">
      <h2>{t('wb.energy')}</h2>
      <p>
        Array: {a.energy.layout === 'vertical' ? `vertical panel facing ${a.energy.azimuth}°` : a.energy.layout === 'box4' ? `four vertical facets (rotated ${a.energy.azimuth}°)` : a.energy.layout}
        {a.energy.optimisedAzimuth ? ' (azimuth optimised for this window)' : ''}, 2 m², η 30 %, losses 15 % (assumptions).{' '}
        <Def k="energy">Array energy</Def>: <b>{n(a.energy.electricWh / 1000, 2)} kWh</b> over the window ({n(a.energy.perLunarDayWh / 1000, 2)} kWh per lunar day) · <Def k="cf">capacity factor</Def> {n(a.energy.capacityFactor * 100, 1)} %
      </p>
      <p>
        <Def k="storage">Storage for the longest night</Def>: {n(a.storage.wh / 1000, 2)} kWh ≈ {n(a.storage.massKg, 0)} kg of battery at 100 W load ·{' '}
        {a.survival.emptyAtHour >= 0 ? (
          <b style={{ color: 'var(--bad)' }}>✖ 2 kWh battery empty at {fmtUtc(a.t0 + a.survival.emptyAtHour * HOUR)}</b>
        ) : (
          <b style={{ color: 'var(--ok)' }}>✔ survives the window (min charge {Math.round(a.survival.minSoc * 100)} %)</b>
        )}
      </p>
      <SocChart soc={a.survival.soc} />
      <div className="row" style={{ marginTop: 6 }}>
        <span className="hint">Optimise for</span>
        <div className="seg" role="group" aria-label="Optimiser objective">
          <button aria-pressed={opt.objective === 'total'} onClick={() => opt.setObjective('total')}>
            total energy
          </button>
          <button aria-pressed={opt.objective === 'worst'} onClick={() => opt.setObjective('worst')}>
            worst day
          </button>
        </div>
      </div>
      {headline && o ? (
        <p data-testid="energy-headline" style={{ fontSize: 15 }}>
          <b>{t('energy.headline', { g: `${headline.gain >= 0 ? '+' : ''}${n(headline.gain, 0)}`, h: n(Math.max(0, headline.blackout), 1) })}</b>{' '}
          {t('energy.baseline', { h: String(o.baseline.h), az: String(o.baseline.azimuth), best: o.best.layout === 'vertical' ? `${t('energy.vertical')} ${o.best.azimuth}°` : o.best.layout, bh: String(o.best.h) })}
          {o.flat2 && <span className="hint"> Educational: a flat panel at {o.flat2.h} m collects {n(o.flat2.wh / 1000, 2)} kWh.</span>}
        </p>
      ) : (
        <p className="hint">{t('computing')}</p>
      )}
      <p className="hint">{t('wb.illumNotPower')} Not modelled: light reflected by terrain, temperature, dust, self-shadowing.</p>
    </div>
  )
}

function SocChart({ soc }: { soc: Float32Array }) {
  const w = 300
  const h = 40
  const pts: string[] = []
  const step = Math.max(1, Math.floor(soc.length / w))
  for (let i = 0; i < soc.length; i += step) pts.push(`${(i / (soc.length - 1)) * w},${h - soc[i] * h}`)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="Battery state of charge over the window">
      <rect x="0" y="0" width={w} height={h} fill="#0a1220" />
      <polyline points={pts.join(' ')} fill="none" stroke="#43c787" strokeWidth="1.5" />
    </svg>
  )
}

function ConnectivityPanel({ a }: { a: SiteAnalysis }) {
  const { t, n } = useT()
  const env = a.link.envelope
  return (
    <div className="section" data-testid="connectivity">
      <h2>{t('wb.connectivity')}</h2>
      <p>
        <Def k="range">Range</Def> {n(a.link.rangeKm[0], 0)}–{n(a.link.rangeKm[1], 0)} km · light time {n(a.link.lightTimeS[0], 3)}–{n(a.link.lightTimeS[1], 3)} s
      </p>
      <p>
        <Def k="fspl">Path loss</Def>: {a.link.fsplDb.map((b) => `${b.band} ${n(b.min, 1)}–${n(b.max, 1)} dB (Δ ${n(b.max - b.min, 2)})`).join(' · ')}
      </p>
      {env ? (
        <p>
          <Def k="envelope">Antenna pointing</Def>: best fixed boresight az {n(env.az, 1)}°, el {n(env.el, 1)}°, half-angle {n(env.halfAngle, 2)}° · gimbal az {n(env.azRange[0], 1)}…{n(env.azRange[1], 1)}°, el {n(env.elRange[0], 1)}…{n(env.elRange[1], 1)}° · within 3°: {Math.round((env.within.find((w) => w.beta === 3)?.frac ?? 0) * 100)} % of the time
        </p>
      ) : (
        <p className="hint">Earth never in view in this window.</p>
      )}
      <p>
        <Def k="sep">Solar interference</Def>: {a.link.interferenceHours} h flagged · min Sun–Earth separation {n(a.link.minSepDeg, 1)}°
      </p>
      <p className="hint">Stations: DSN Goldstone DSS-14, Madrid DSS-63, Canberra DSS-43 (NAIF/DSN 810-005), min elevation 10° (assumption). {t('wb.visNotLink')}</p>
    </div>
  )
}

function SafetyPanel() {
  const { t, n } = useT()
  const s = useSafety()
  const lander = useStore((st) => st.lander)
  const { site } = useCurrentSite()
  if (!site || site.terrain === 'sphere') return null
  return (
    <div className="section" data-testid="safety">
      <h2>{t('wb.safetyPanel')}</h2>
      <label className="row">
        Lander
        <select className="input" style={{ width: 'auto' }} value={lander} onChange={(e) => setState({ lander: e.target.value as 'small' })} data-testid="lander">
          <option value="small">Generic small lander — illustrative</option>
          <option value="medium">Generic medium lander — illustrative</option>
          <option value="large">Generic large lander — illustrative</option>
        </select>
      </label>
      {!s ? (
        <p className="hint">{t('computing')}</p>
      ) : (
        <>
          <Gauge margin={s.tip.margin} tip={s.tip.tipAngle} verdict={s.tip.verdict} />
          <p style={{ fontSize: 14 }}>
            {t('safety.sentence', { v: n(s.tip.vCrit, 2) })}
          </p>
          <table className="metrics">
            <tbody>
              <tr><td>Footprint slope (plane fit, {s.fit.baseline} m disk)</td><td className="num">{n(s.fit.slope, 1)}° toward {n(s.fit.downhill, 0)}°</td></tr>
              <tr><td>Roughness (RMS residual) · max step</td><td className="num">{n(s.fit.roughness, 1)} m · {n(s.fit.maxStep, 1)} m</td></tr>
              <tr><td>Static tip angle atan(r/h) · effective tilt</td><td className="num">{n(s.tip.tipAngle, 1)}° · {n(s.tip.tilt, 1)}°</td></tr>
              <tr><td>Static margin M</td><td className="num">{n(s.tip.margin, 1)}°</td></tr>
              <tr><td>Landing ellipse 100 × 50 m (3σ), 500 seeded samples: P(safe)</td><td className="num">{Math.round(s.mc.pSafe * 100)} %</td></tr>
              <tr><td>Slope P10 / P50 / P90</td><td className="num">{s.mc.slope.map((v) => n(v, 1)).join(' / ')}°</td></tr>
            </tbody>
          </table>
          <p className="hint">
            {t('wb.screening', { b: String(s.fit.baseline), dem: s.demLabel })} Assumptions (generic {s.lander.id}): {s.lander.legs} legs, pad radius {s.lander.padRadius} m, CG height {s.lander.cgHeight} m, radius of gyration {s.lander.gyration} m, slope uncertainty 2° (LOLA typical, labelled), attitude dispersion {s.lander.attitudeDispersion}°. Ignores leg stroke, crush cores, plume–surface interaction, soil failure, rocks smaller than a pixel.
          </p>
        </>
      )}
    </div>
  )
}

function Gauge({ margin, tip, verdict }: { margin: number; tip: number; verdict: string }) {
  const f = Math.max(0, Math.min(1, margin / Math.max(1, tip)))
  const color = verdict === 'green' ? 'var(--ok)' : verdict === 'amber' ? 'var(--warn)' : 'var(--bad)'
  const label = verdict === 'green' ? '✔ margin above minimum' : verdict === 'amber' ? '◐ positive but below minimum margin' : '✖ tips over statically'
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={Math.round(tip)} aria-valuenow={Math.round(margin)} aria-label={`Tip-over margin ${margin.toFixed(1)} degrees: ${label}`} data-testid="safety-gauge">
      <div className="bar" style={{ height: 12 }}>
        <i style={{ width: `${f * 100}%`, background: color }} />
      </div>
      <span style={{ color }}>{label}</span>
    </div>
  )
}

function Exports({ a, site }: { a: SiteAnalysis; site: ResolvedSite }) {
  const { t } = useT()
  const download = (name: string, text: string, type: string) => {
    const b = new Blob([text], { type })
    const u = URL.createObjectURL(b)
    const el = document.createElement('a')
    el.href = u
    el.download = name
    el.click()
    URL.revokeObjectURL(u)
  }
  const csv = () =>
    ['utc,sun_az_deg,sun_el_deg,sun_visible_fraction,earth_az_deg,earth_el_deg,earth_visible_fraction,dte,power_w']
      .concat(a.hourly.map((s) => [new Date(s.t).toISOString(), s.sunAz.toFixed(4), s.sunEl.toFixed(4), s.sunFrac.toFixed(4), s.earthAz.toFixed(4), s.earthEl.toFixed(4), s.earthFrac.toFixed(4), s.dte ? 1 : 0, s.powerW.toFixed(2)].join(',')))
      .join('\n')
  const json = () =>
    JSON.stringify(
      {
        site: { name: site.name, lon: site.lon, lat: site.lat, z0_m: site.z0, mast_m: site.h, terrain: site.terrain, grade: site.grade },
        window: { start: new Date(a.t0).toISOString(), end: new Date(a.t1).toISOString() },
        metrics: { litFrac: a.litFrac, earthFrac: a.earthFrac, dteFrac: a.dteFrac, longestDarkH: a.longestDarkH, longestDteGapH: a.longestDteGapH, energy: a.energy, link: { ...a.link }, thermal: a.thermal },
        conventions: 'MOON_ME, planetocentric, east-positive, azimuth clockwise from north, UTC',
        share: shareUrl(),
        generated_utc: new Date().toISOString(),
      },
      null,
      1,
    )
  return (
    <div className="section">
      <h2>{t('wb.exports')}</h2>
      <div className="row wrap">
        <button className="btn small" onClick={() => download('sightline_timeseries.csv', csv(), 'text/csv')} data-testid="export-csv">
          CSV
        </button>
        <button className="btn small" onClick={() => download('sightline_report.json', json(), 'application/json')} data-testid="export-json">
          JSON
        </button>
        <button
          className="btn small"
          onClick={() => {
            const c = document.querySelector<HTMLCanvasElement>('canvas.sky')
            if (c) {
              const el = document.createElement('a')
              el.href = c.toDataURL('image/png')
              el.download = 'sightline_skyplot.png'
              el.click()
            }
          }}
        >
          PNG (sky plot)
        </button>
        <button className="btn small" onClick={() => setState({ page: 'brief' })}>
          {t('nav.brief')}
        </button>
      </div>
    </div>
  )
}
