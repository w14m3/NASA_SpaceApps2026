// Science and Engineering constraint panels (contract §6.15 item 4): both feed the Top 3 engine and are recorded in
// the Mission Brief so both teams sign off on the same scenario. Defaults are labelled assumptions.
import { DEFAULT_CONSTRAINTS, type Constraints as C } from '../core/top3'
import { parseCons } from './hooks'
import { setState, useStore } from './store'

type NumKey = 'maxSlope' | 'minSafeArea' | 'minMargin' | 'minSunlit' | 'maxNightH' | 'minDte'
const ENG: { k: NumKey; label: string; min: number; max: number; step: number; scale: number; unit: string; src: string }[] = [
  { k: 'maxSlope', label: 'Max slope (720 m baseline)', min: 2, max: 20, step: 1, scale: 1, unit: '°', src: '8° default: literature example (Barker et al. 2021)' },
  { k: 'minMargin', label: 'Min tip-over margin', min: 0, max: 30, step: 1, scale: 1, unit: '°', src: 'assumption' },
  { k: 'minSafeArea', label: 'Min safe-area fraction (500 m)', min: 0, max: 100, step: 5, scale: 100, unit: '%', src: 'assumption' },
  { k: 'minSunlit', label: 'Min sunlit time', min: 0, max: 100, step: 5, scale: 100, unit: '%', src: 'assumption' },
  { k: 'maxNightH', label: 'Max longest night', min: 12, max: 720, step: 12, scale: 1, unit: 'h', src: 'assumption' },
  { k: 'minDte', label: 'Min direct-to-Earth time', min: 0, max: 100, step: 5, scale: 100, unit: '%', src: 'assumption' },
]

export function ConstraintsPanel() {
  const cons = useStore((s) => s.cons)
  const persona = useStore((s) => s.persona)
  const cur: C = { ...DEFAULT_CONSTRAINTS, ...(parseCons(cons) as Partial<C>) }
  const set = (k: keyof C, v: number | boolean) => {
    const next = { ...parseCons(cons), [k]: v }
    setState({ cons: Object.entries(next).map(([a, b]) => `${a}=${typeof b === 'boolean' ? (b ? 1 : 0) : b}`).join(','), relax: '' })
  }
  return (
    <details data-testid="constraints">
      <summary>Science & engineering constraints</summary>
      <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, marginTop: 6 }} data-testid="constraints-engineering">
        <legend>Engineering</legend>
        {ENG.map((e) => (
          <label key={e.k} className="field">
            <span>
              {e.label}: <b>{Math.round((cur[e.k] as number) * e.scale)} {e.unit}</b> <span className="hint">({e.src})</span>
            </span>
            <input type="range" min={e.min} max={e.max} step={e.step} value={Math.round((cur[e.k] as number) * e.scale)} onChange={(ev) => set(e.k, Number(ev.target.value) / e.scale)} data-testid={`cons-${e.k}`} />
          </label>
        ))}
      </fieldset>
      <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, marginTop: 6 }} data-testid="constraints-science">
        <legend>Science</legend>
        <label className="row">
          <input type="checkbox" checked={cur.excludeZeroIllumination} onChange={(e) => set('excludeZeroIllumination', e.target.checked)} data-testid="cons-zero" />
          Exclude zero-illumination cells (landing in permanent shadow)
        </label>
        <label className="field">
          <span>Priority profile</span>
          <select className="input" value={persona} onChange={(e) => setState({ persona: e.target.value })} data-testid="cons-persona">
            <option value="balanced">Balanced</option>
            <option value="crewSafety">Crew safety first</option>
            <option value="longPower">Long-duration power</option>
            <option value="scienceIce">Science near ice (rewards proximity to zero-illumination cells)</option>
          </select>
        </label>
      </fieldset>
      <button className="btn small" style={{ marginTop: 6 }} onClick={() => setState({ cons: '', relax: '' })}>
        Reset to defaults
      </button>
    </details>
  )
}
