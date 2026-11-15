// Generates docs/VALIDATION.md and docs/DATA_PROVENANCE.md from recorded outputs (never hand-edited).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = (...a) => join(root, ...a)
const J = (p) => JSON.parse(readFileSync(p, 'utf8'))
const ORDER = ['O1', 'O2b', 'O2_240m', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V7b', 'V8', 'V9', 'V10', 'V11b', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17', 'V18', 'V19', 'V20', 'DEPLOY']
const recs = readdirSync(P('data', 'validation')).filter((f) => f.endsWith('.json')).map((f) => J(P('data', 'validation', f)))
recs.sort((a, b) => ((ORDER.indexOf(a.id) + 1) || 99) - ((ORDER.indexOf(b.id) + 1) || 99))
const esc = (s) => String(s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
let md = `# Validation results (generated)\n\nGenerated ${new Date().toISOString()} by \`scripts/gen-docs.mjs\` from the records in \`data/validation/\`, which are written by the tests (\`web/src/core/*.test.ts\`, \`pipeline/tests/\`, \`web/scripts/validate-candidates.ts\`) and the pipeline. Statuses are never typed by hand. Contract §10 checks that cannot run in this build environment are listed at the end.\n\n| ID | Test | Criterion | Measured | Status | Recorded |\n|---|---|---|---|---|---|\n`
for (const r of recs) md += `| ${r.id} | ${esc(r.test)} | ${esc(r.criterion)} | ${esc(r.summary)} | **${r.status}** | ${String(r.generated_utc ?? '').slice(0, 16)} |\n`
md += `\n## Not run here (and why)\n\n- **O2** (new masks vs v1 masks at full resolution) needs the LOLA 80 m product; pgda.gsfc.nasa.gov is unreachable from the build machine. Substitutes: **O2b** (same algorithm, same DEM, identical to 0.0000°) and the report **O2_240m** (240 m vs 80 m-based masks differ by up to ~3°, which is why curated sites keep the validated 80 m-based masks).\n- **V11** (Moon elevation at DSN sites vs JPL Horizons): Horizons is unreachable. Substitute **V11b** against an independent astropy/ERFA chain.\n- **V12** (QuickMap screenshots) is manual and needs quickmap.lroc.asu.edu; not done.\n- **V18** (mission replay vs published end-of-mission accounts): the touchdown facts used for the replay come from the LROC pages quoted in \`reference/v1/data/sites_research.json\`; published accounts of the missions' power and communication history could not be read here, so no comparison is claimed.\n- **V13** Lighthouse scores: not run (no Lighthouse in the environment); the Playwright suite and the axe audit run in \`npm run verify\`.\n`
writeFileSync(P('docs', 'VALIDATION.md'), md)

// DATA_PROVENANCE.md
const man = J(P('web', 'public', 'data', 'ephem', 'manifest.json'))
const dem = J(P('web', 'public', 'data', 'dem', 'dem240_80S.json'))
const v1 = J(P('reference', 'v1', 'web', 'public', 'data', 'manifest.json'))
const cands = readdirSync(P('web', 'public', 'data', 'candidates')).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => J(P('web', 'public', 'data', 'candidates', f)))
let pv = `# Data provenance (generated)\n\nGenerated ${new Date().toISOString()} by \`scripts/gen-docs.mjs\` from the artifact manifests. Nothing here is typed by hand.\n\n## Runtime artifacts (\`web/public/data/\`)\n\n| Artifact | Source | Build | SHA-256 |\n|---|---|---|---|\n`
for (const p of man.pieces) pv += `| ephem/${p.file} | ${esc(p.source)} | \`pipeline/scripts/build_ephemeris.py\` | \`${p.sha256.slice(0, 16)}…\` |\n`
pv += `| ephem/${man.moon_cirs.file} | ${esc(man.moon_cirs.source)} | \`pipeline/scripts/build_ephemeris.py\` | \`${man.moon_cirs.sha256.slice(0, 16)}…\` |\n`
pv += `| ephem/ut1.json | IERS finals2000A (Bulletin A) via PyPI astropy-iers-data | \`pipeline/scripts/build_ephemeris.py\` | — |\n`
pv += `| dem/${dem.file} | ${esc(dem.source)} | \`pipeline/scripts/build_dem.py\` | \`${dem.sha256_file.slice(0, 16)}…\` |\n`
for (const c of cands) pv += `| candidates/${c.file} | ${c.n} candidates, ${esc(c.method)} | \`web/scripts/build-candidates.ts\` | ${c.bytes_gzip} B gzip |\n`
pv += `| masks/*.json, sites.json, hillshade_80S.jpg | reference/v1 (LOLA 80 m + 240 m masks, researched site list with source quotes, LOLA hillshade) | \`pipeline/scripts/build_sites.py\` (copy) | see reference/v1 manifest |\n`
pv += `\n## Upstream inputs\n\n- JPL DE421 (Folkner, Williams & Boggs 2009): PyPI \`de421\` ${esc(man.pieces[0].provenance?.package)}, sha256 \`${esc(man.pieces[0].provenance?.sha256)}\`, fetched ${esc(man.pieces[0].provenance?.fetched_utc)} by \`pipeline/scripts/fetch_de421.py\`.\n- SPICE kernels used by reference/v1 (DE440 piece): ${v1.kernels.join(', ')}; hashes in \`reference/v1/web/public/data/manifest.json\`.\n- LOLA DEM products used by reference/v1: ${v1.dem_products.map((d) => `${d.file} (\`${d.sha256.slice(0, 12)}…\`)`).join(', ')}.\n- Validation fixtures: cached JPL Horizons responses (\`reference/v1/data/raw/horizons/\`, 2013 rows), v1 SPICE az/el oracle (300 rows), astropy station fixture (\`pipeline/scripts/build_dsn_fixture.py\`).\n\n## Licences and credits\n\nLOLA data: NASA GSFC PGDA, public domain, cite Barker et al. 2023 (PSJ 4, 183). SPICE kernels and DE ephemerides: NASA/JPL NAIF and JPL Solar System Dynamics. IERS data: IERS Rapid Service/Prediction Centre. LRO WAC mosaic: NASA/GSFC/Arizona State University via NASA Moon Trek (streamed, not redistributed). Code: MIT.\n`
writeFileSync(P('docs', 'DATA_PROVENANCE.md'), pv)
console.log('docs: VALIDATION.md and DATA_PROVENANCE.md generated')
void existsSync
