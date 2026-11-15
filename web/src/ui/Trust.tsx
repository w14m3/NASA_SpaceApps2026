// Methods & Trust page (contract §6.14): validation matrix generated from recorded test output, conventions,
// equations, limits, data credits, traceability. Statuses are read from data files written by the tests.
import { useAsync } from './hooks'
import { BASE } from './data'
import { setState } from './store'
import { useT } from './i18n'

interface Rec {
  id: string
  test: string
  criterion: string
  summary: string
  status: string
  generated_utc: string
}
interface Obj {
  id: string
  objective: string
  acceptance: string
  status: string
}

const ORDER = ['O1', 'O2b', 'O2_240m', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V7b', 'V8', 'V9', 'V10', 'V11b', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17', 'V18', 'V19', 'V20', 'DEPLOY']

export default function Trust() {
  const { t } = useT()
  const val = useAsync('val', () => fetch(BASE + 'data/validation.json').then((r) => r.json() as Promise<{ generated_utc: string; records: Record<string, Rec> }>))
  const obj = useAsync('obj', () => fetch(BASE + 'data/objectives.json').then((r) => r.json() as Promise<{ objectives: Obj[] }>))
  const man = useAsync('man', () => fetch(BASE + 'data/ephem/manifest.json').then((r) => r.json()))
  const recs = val.data ? Object.values(val.data.records).sort((a, b) => (ORDER.indexOf(a.id) + 99 * +(ORDER.indexOf(a.id) < 0)) - (ORDER.indexOf(b.id) + 99 * +(ORDER.indexOf(b.id) < 0))) : []
  return (
    <div className="page" role="dialog" aria-modal="true" aria-labelledby="trust-title" data-testid="trust-page">
      <div className="inner">
        <button className="btn no-print" onClick={() => setState({ page: 'main' })}>
          ← {t('nav.back')}
        </button>
        <h1 id="trust-title">Methods & Trust</h1>
        <p>Every status below is written by an automated test or a pipeline script into <code>data/validation/</code> and read here; nothing is typed by hand. Source code and the full logs are in the repository.</p>
        <h2>Validation matrix</h2>
        <table className="metrics" data-testid="validation-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Test</th>
              <th>Criterion</th>
              <th>Measured</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.test}</td>
                <td>{r.criterion}</td>
                <td>{r.summary}</td>
                <td className={`status-${r.status.replace(' ', '')}`}>{r.status === 'pass' ? '✔ pass' : r.status === 'fail' ? '✖ fail' : r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Generated {val.data?.generated_utc}. Not run here: V11 against JPL Horizons and O2 against the LOLA 80 m product (both hosts unreachable from the build environment; substitutes V11b and O2b are shown), V12 (QuickMap, manual).</p>
        <h2>Conventions</h2>
        <ul>
          <li>Time: UTC in and out; TDB inside the ephemeris pipeline (ERFA). No leap second between 2017-01-01 and 2031-01-03 (asserted), so the browser uses UTC milliseconds.</li>
          <li>Frame: MOON_ME (Mean Earth/Polar Axis). 2026–2031: SPICE DE440 realisation (reference build). 2017–2026: JPL DE421 with the DE421 PA→ME rotation; measured difference from DE440 ≤ 1.6e-5° (V19).</li>
          <li>East-positive longitude, planetocentric latitude, reference sphere R = 1737.4 km; heights relative to it.</li>
          <li>Azimuth clockwise from local north; elevation above the local horizontal. Instrument (mast) height above terrain is always shown.</li>
          <li>Aberration: apparent positions with light time and stellar aberration (SPICE "LT+S" semantics); Earth direction taken from the site (parallax up to 0.26°).</li>
        </ul>
        <h2>Equations</h2>
        <ul>
          <li>Horizon: ε(s) = atan2(ρ cos θ − ρ₀, ρ sin θ), mask(α) = max ε(s), θ = s/R, ρ = R + z(s), ρ₀ = R + z₀ + h; step 1 % of distance capped at ½ pixel; maximum refined by golden section.</li>
          <li>Uncertainty band: terrain shifted by ±δ(s), δ = √(δ_corr² + δ_rough²), δ_corr = (σ_terrain + σ_site)·min(1, s / 2 px).</li>
          <li>Disk visibility: 200-strip quadrature of a uniform disk above the mask. Sun lit at ≥ 1 % of the disk, Earth in view at ≥ 50 %.</li>
          <li>Power: S = 1360.8 W/m² (1 au/d)², P_inc = S · f☉ · max(0, n̂·ŝ), P_el = η A P_inc (1 − losses); event-aware trapezoid (V10).</li>
          <li>Direct-to-Earth = Earth in view ∧ a ground station sees the Moon above its minimum elevation (default 10°). FSPL = 20 log₁₀(4π d f / c).</li>
          <li>Tip-over: r = R_p cos(π/n), θ_tip = atan(r/h), M = θ_tip − (σ + δσ + dispersion), v_crit = √(2 g L (1 − cos M)(L² + k²)) / h.</li>
          <li>Scores: Power = 100 (0.6 L + 0.4 (1 − min(1, D/354.4 h))); Link = same with DTE fraction and longest DTE gap; Safety = 100 (0.5 c(M/2M_min) + 0.25 c(v/2v_d) + 0.25 safe-area); Combined = weighted geometric mean.</li>
          <li>Thermal proxy: T_eq = [α S f cos i / (ε σ)]^¼ in sunlight; in shadow "radiating to deep space — heaters required".</li>
        </ul>
        <h2>Limits (read before trusting a number)</h2>
        <ul>
          <li>Illumination is not electrical power; geometric visibility is not link closure; slope screening is not certification.</li>
          <li>Custom sites and candidate grids use the LOLA 240 m DEM: their horizons can differ from 80 m-based ones by up to ~3° (report O2_240m). Curated south-pole sites use validated 80 m-based masks.</li>
          <li>No light reflected by terrain, no thermal or dust effects, no lander self-shadowing; DEMs cannot resolve rocks smaller than their pixel.</li>
          <li>Lander presets are generic and illustrative; every parameter is an assumption.</li>
          <li>Several south-pole coordinates come from the literature via secondary sources and are flagged "unverified".</li>
        </ul>
        <h2>Data and credits</h2>
        <ul>
          <li>LOLA south-pole DEMs — NASA GSFC Planetary Geodesy Data Archive, product 90 (Barker et al. 2023, PSJ 4, 183).</li>
          <li>Ephemerides — JPL DE440 via NASA/JPL NAIF SPICE (reference build); JPL DE421 (Folkner, Williams & Boggs 2009) via the PyPI package "de421".</li>
          <li>Earth orientation — IERS finals2000A (Bulletin A) via astropy-iers-data; ERFA (SOFA) algorithms.</li>
          <li>Validation — JPL Horizons responses cached on 2026-11-14; astropy for the station cross-check.</li>
          <li>Imagery — LRO WAC global mosaic, NASA/GSFC/Arizona State University, streamed from NASA Moon Trek.</li>
          <li>Ground stations — DSN 810-005 module 301 via NAIF station kernels. Context — Canadian Space Agency, USGS. Sightline is not endorsed by NASA.</li>
        </ul>
        {man.data && (
          <>
            <h2>Manifest</h2>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5 }} data-testid="manifest">
              {JSON.stringify({ frame: man.data.frame, abcorr: man.data.abcorr, pieces: man.data.pieces.map((p: { id: string; source: string; sha256: string }) => ({ id: p.id, source: p.source, sha256: p.sha256 })), moon_cirs: man.data.moon_cirs.source, built: man.data.built_utc }, null, 1)}
            </pre>
          </>
        )}
        <h2>Traceability — objectives</h2>
        <table className="metrics" data-testid="objectives-table">
          <tbody>
            {obj.data?.objectives.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.objective}</td>
                <td>{o.acceptance}</td>
                <td className={`status-${o.status.replace(' ', '')}`}>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
