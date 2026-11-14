// Methods, limits and the public validation ("Trust") page. Numbers come from the pipeline's test output.
import { useEffect, useState } from 'react'
import type { Data } from '../state'

interface Check {
  id: string
  test: string
  tolerance: string
  status: 'pass' | 'fail' | 'not run'
  result: string
}

export function Trust({ data, onBack }: { data: Data; onBack: () => void }) {
  const [checks, setChecks] = useState<Check[] | null>(null)
  useEffect(() => {
    fetch(`${data.base}data/validation.json`)
      .then((r) => r.json())
      .then((j) => setChecks(j.checks), () => setChecks([]))
  }, [data.base])
  const m = data.manifest
  const e = data.eph.meta

  return (
    <div className="trust">
      <button className="ghost" onClick={onBack}>← Back to the map</button>
      <h1>Methods, limits and validation</h1>
      <p className="lead">
        Every number in this tool is computed from public NASA data with the conventions below. This page shows what was
        tested, what passed, and what the tool does <b>not</b> model.
      </p>

      <h2>Validation results</h2>
      {checks === null ? (
        <p>Loading…</p>
      ) : checks.length === 0 ? (
        <p className="warn">No validation file found. Run the pipeline tests to generate it.</p>
      ) : (
        <div className="scroll-x">
          <table className="checks">
            <thead>
              <tr><th>ID</th><th>Test</th><th>Pass criterion</th><th>Status</th><th>Measured</th></tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <th>{c.id}</th>
                  <td>{c.test}</td>
                  <td>{c.tolerance}</td>
                  <td className={`st ${c.status.replace(' ', '-')}`}>{c.status === 'pass' ? '✔ pass' : c.status === 'fail' ? '✖ fail' : '○ not run'}</td>
                  <td>{c.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Conventions</h2>
      <ul>
        <li>Time: UTC for input and display. The ephemeris is evaluated in TDB inside the pipeline (leap-second kernel naif0012).</li>
        <li>Frame: Moon Mean Earth / Polar Axis (<code>MOON_ME</code>, DE440), the frame used by LOLA and JPL Horizons. East-positive longitude, planetocentric latitude.</li>
        <li>Reference sphere R = 1737.4 km; terrain heights are relative to it.</li>
        <li>Azimuth clockwise from local north; elevation above the local horizontal. Instrument height above terrain is always stated.</li>
        <li>No atmosphere, so no refraction: the horizon is terrain plus the curvature of the Moon.</li>
      </ul>

      <h2>How it is computed</h2>
      <ul>
        <li><b>Sun and Earth positions</b>: SPICE (DE440s, lunar orientation moon_pa_de440) with light-time and stellar-aberration corrections, compressed to Chebyshev polynomials ({e.degree}th degree, {e.seg_seconds / 86400}-day segments, {e.epoch_utc.slice(0, 10)} + {Math.round((e.n_segments * e.seg_seconds) / 86400)} d). Measured fit error from the surface: Sun {e.max_error_deg.SUN.max_deg_from_surface.toExponential(1)}°, Earth {e.max_error_deg.EARTH.max_deg_from_surface.toExponential(1)}°.</li>
        <li><b>Earth direction</b> is taken from the site, not the Moon's centre (parallax up to 0.26°).</li>
        <li><b>Horizon mask</b>: for each azimuth, march along the great circle and keep the highest terrain elevation angle, ε(s) = atan2(ρ·cosθ − ρ₀, ρ·sinθ) with θ = s/R. Curated south-pole sites use the LOLA 80 m DEM (Barker et al. 2023) with 0.25° azimuth spacing and half-pixel steps; custom sites use the same algorithm on a 240 m copy in your browser.</li>
        <li><b>Visibility</b>: fraction of the Sun's (≈0.53°) or Earth's (≈1.9°) disk above the mask, by 200-strip quadrature. "Sunlit" means ≥1% of the Sun's disk; "Earth in view" means ≥50% of Earth's disk.</li>
        <li><b>Events</b>: 10-minute scan, then bisection to 1 s. ± values come from re-running with the horizon shifted by the DEM's 1-sigma height error.</li>
        <li><b>Energy</b>: ∫ S₀·(1 au/d)²·(visible Sun fraction)·cos(incidence) dt with S₀ = 1360.8 W/m² (Kopp &amp; Lean 2011).</li>
      </ul>

      <h2>Known limits — read before trusting a number</h2>
      <ul>
        <li><b>Illumination is not electrical power.</b> No cell efficiency, temperature, dust or battery model is applied to the energy figures.</li>
        <li><b>Earth in view is not link closure.</b> No link budget, antenna pattern or ground-station schedule is modelled; Deep Space Network station windows are not yet included.</li>
        <li>An 80 m DEM cannot resolve boulders, small craters or the lander's own shadow. Features smaller than about 80 m are invisible to it; custom sites use 240 m.</li>
        <li>Terrain is only available between 80°S and 90°S. Elsewhere the tool says so and uses a smooth-sphere horizon.</li>
        <li>For custom sites the horizon ignores terrain north of 80°S, which matters for sites near the edge of the map.</li>
        <li>No light reflected from sunlit terrain, no thermal environment, no slope or hazard analysis yet.</li>
        <li>The "points of interest" near the pole are test locations from the literature, <b>not approved landing sites</b>.</li>
        <li>Power and Link scores are simple, documented indices for ranking — not mission requirements.</li>
      </ul>

      <h2>Reproducibility manifest</h2>
      {m ? (
        <dl className="manifest">
          <dt>Built</dt><dd>{m.built_utc}</dd>
          <dt>Commit</dt><dd><code>{m.git_commit}</code></dd>
          <dt>Kernels</dt><dd>{m.kernels.join(', ')}</dd>
          <dt>DEM products</dt>
          <dd>
            {m.dem_products.map((d) => (
              <div key={d.file}><a href={d.url}>{d.file}</a> <code>sha256 {d.sha256.slice(0, 16)}…</code></div>
            ))}
          </dd>
          <dt>Masks</dt><dd>{m.mask.n_az} azimuths, search radius {m.mask.s_max_km} km, heights {m.mask.heights_m.join(', ')} m</dd>
        </dl>
      ) : (
        <p className="warn">Manifest not found.</p>
      )}

      <h2>Data credits</h2>
      <p>
        Topography: LOLA south-pole DEMs, NASA GSFC Planetary Geodesy Data Archive (Barker et al. 2023, Planet. Sci. J. 4, 183,
        doi:10.3847/PSJ/acf3e1). Imagery: LRO WAC global mosaic (NASA/GSFC/Arizona State University) served by NASA Moon Trek.
        Ephemerides and kernels: NASA/JPL NAIF (SPICE). Independent check: NASA/JPL Horizons. Site coordinates carry their own
        source links in the app.
      </p>
    </div>
  )
}
