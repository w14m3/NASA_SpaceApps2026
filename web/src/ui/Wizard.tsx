// "Plan a landing" — three-step wizard (contract §6.2): region · mission window · lander and priorities.
// Defaults everywhere; "Find my top 3" is enabled from step 1.
import { useState } from 'react'
import { DAY } from '../core/constants'
import { HERO_REGIONS } from '../core/regions'
import { useT } from './i18n'
import { setState, useStore } from './store'

export default function Wizard({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const s = useStore((x) => x)
  const [step, setStep] = useState(0)
  const [region, setRegion] = useState(s.region)
  const [landing, setLanding] = useState(new Date(s.landing).toISOString().slice(0, 10))
  const [dur, setDur] = useState(s.durDays)
  const [lander, setLander] = useState(s.lander)
  const [h, setH] = useState(s.h <= 6 ? 2 : 10)
  const [persona, setPersona] = useState(s.persona)
  const [layout, setLayout] = useState(s.layout)
  const go = () => {
    const ms = Date.parse(landing + 'T00:00:00Z')
    setState({ region, landing: Number.isFinite(ms) ? ms : s.landing, durDays: dur, lander, h, persona, layout, t: (Number.isFinite(ms) ? ms : s.landing) + DAY, wizard: false, page: 'main', view: 'pole', mode: 'plan', relax: '' })
    onClose()
    setTimeout(() => document.querySelector<HTMLElement>('[data-testid="option-A"]')?.focus(), 50)
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="wiz-title" onClick={(e) => e.stopPropagation()} data-testid="wizard" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <header>
          <h2 id="wiz-title">{t('nav.plan')}</h2>
          <span className="hint">Step {step + 1} / 3</span>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="body">
          {step === 0 && (
            <fieldset style={{ border: 0, padding: 0 }}>
              <legend>1 · Region</legend>
              {HERO_REGIONS.map((r) => (
                <label key={r.id} className="row" style={{ padding: 4 }}>
                  <input type="radio" name="region" checked={region === r.id} onChange={() => setRegion(r.id)} />
                  {r.name} <span className="hint">15 × 15 km, 3,721 candidates · centre {r.status === 'verified' ? 'sourced' : 'unverified coordinate'}</span>
                </label>
              ))}
            </fieldset>
          )}
          {step === 1 && (
            <fieldset style={{ border: 0, padding: 0 }}>
              <legend>2 · Mission window</legend>
              <div className="field">
                <label htmlFor="wl">Landing date (UTC)</label>
                <input id="wl" type="date" className="input" min="2017-01-01" max="2030-12-01" value={landing} onChange={(e) => setLanding(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="wd">Surface duration</label>
                <select id="wd" className="input" value={dur} onChange={(e) => setDur(Number(e.target.value))}>
                  {[3, 7, 14, 30, 60].map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </select>
              </div>
              <p className="hint">Ephemeris span 2017-01-01 → 2031-01-02 (SPICE DE440 from 2026, DE421 before).</p>
            </fieldset>
          )}
          {step === 2 && (
            <fieldset style={{ border: 0, padding: 0 }}>
              <legend>3 · Lander and priorities</legend>
              <div className="field">
                <label htmlFor="wlander">Lander preset (generic, illustrative — every parameter is an assumption)</label>
                <select id="wlander" className="input" value={lander} onChange={(e) => setLander(e.target.value as 'small')}>
                  <option value="small">Generic small</option>
                  <option value="medium">Generic medium</option>
                  <option value="large">Generic large</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="wh">Mast height (candidate grids: 2 m or 10 m)</label>
                <select id="wh" className="input" value={h} onChange={(e) => setH(Number(e.target.value))}>
                  <option value={2}>2 m</option>
                  <option value={10}>10 m (default)</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="wlay">Solar array layout</label>
                <select id="wlay" className="input" value={layout} onChange={(e) => setLayout(e.target.value as 'flat')}>
                  <option value="vertical">Vertical, fixed (azimuth optimised)</option>
                  <option value="box4">Four vertical facets N/E/S/W</option>
                  <option value="track">Vertical, azimuth tracking</option>
                  <option value="twoAxis">Two-axis tracking</option>
                  <option value="flat">Flat, horizontal</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="wp">Priorities (science and engineering)</label>
                <select id="wp" className="input" value={persona} onChange={(e) => setPersona(e.target.value)} data-testid="persona">
                  <option value="balanced">Balanced (default)</option>
                  <option value="crewSafety">Crew safety first</option>
                  <option value="longPower">Long-duration power</option>
                  <option value="scienceIce">Science near ice</option>
                </select>
              </div>
            </fieldset>
          )}
        </div>
        <footer>
          <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </button>
          {step < 2 && (
            <button className="btn" onClick={() => setStep(step + 1)} data-testid="wizard-next">
              Next
            </button>
          )}
          <button className="btn primary" onClick={go} data-testid="find-top3">
            Find my top 3
          </button>
        </footer>
      </div>
    </div>
  )
}
