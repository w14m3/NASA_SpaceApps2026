// V14: rebuild every artifact from its inputs and check the hashes are identical to the committed ones.
// Usage: node scripts/rebuild-check.mjs [--candidates]   (candidate grids take ~12 min on 4 cores)
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const py = isWin ? 'python' : 'python3'
const withCands = process.argv.includes('--candidates')
const D = (...a) => join(root, 'web', 'public', 'data', ...a)
// hash decoded content for gzip files (gzip headers can differ between zlib builds)
const h = (p) => {
  let b = readFileSync(p)
  if (p.endsWith('.gz')) b = gunzipSync(b)
  return createHash('sha256').update(b).digest('hex')
}
const files = [
  D('ephem', existsSync(D('ephem', 'sun_earth_spice_2017_2026.bin')) ? 'sun_earth_spice_2017_2026.bin' : 'sun_earth_de421_2017_2026.bin'),
  D('ephem', 'sun_earth_de440_2026_2031.bin'),
  D('ephem', 'moon_cirs_2017_2031.bin'),
  D('ephem', 'ut1.json'),
  D('dem', 'dem240_80S.i16d.gz'),
  D('sites.json'),
  ...readdirSync(D('masks')).map((f) => D('masks', f)),
  join(root, 'web', 'src', 'core', '__fixtures__', 'horizons_azel.json'),
  join(root, 'web', 'src', 'core', '__fixtures__', 'v1_spice_azel.json'),
  ...(withCands ? readdirSync(D('candidates')).filter((f) => f.endsWith('.bin.gz')).map((f) => D('candidates', f)) : []),
]
const before = Object.fromEntries(files.filter(existsSync).map((f) => [f, h(f)]))
const run = (cmd, args, cwd = root) => {
  console.log('>', cmd, args.join(' '))
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin })
  if (r.status !== 0) throw new Error(`${cmd} failed`)
}
run(py, ['pipeline/scripts/fetch_de421.py'])
run(py, ['pipeline/scripts/build_ephemeris.py'])
run(py, ['pipeline/scripts/build_dem.py'])
run(py, ['pipeline/scripts/build_sites.py'])
run(py, ['pipeline/scripts/build_fixtures.py'])
if (withCands) run(isWin ? 'npx.cmd' : 'npx', ['tsx', 'scripts/build-candidates.ts'], join(root, 'web'))
const diff = files.filter((f) => before[f] !== h(f)).map((f) => f.replace(root, ''))
const rec = {
  id: 'V14',
  test: `Rebuild from inputs with one command (node scripts/rebuild-check.mjs${withCands ? ' --candidates' : ''}): ephemeris pieces, UT1 table, DEM, sites, masks, test fixtures${withCands ? ', candidate grids' : ' (candidate grids: run with --candidates, ~12 min)'}; content hashes compared with the committed artifacts`,
  criterion: 'identical hashes (pass) or documented',
  measured: { files: files.length, differing: diff },
  summary: diff.length ? `${diff.length} of ${files.length} files differ` : `${files.length} files rebuilt with identical content hashes${withCands ? '' : ' (candidates not rebuilt in this run)'}`,
  status: diff.length ? 'fail' : 'pass',
  generated_utc: new Date().toISOString(),
  generator: 'scripts/rebuild-check.mjs',
}
writeFileSync(join(root, 'data', 'validation', 'V14.json'), JSON.stringify(rec, null, 1))
console.log(rec.summary)
process.exit(diff.length ? 1 : 0)
