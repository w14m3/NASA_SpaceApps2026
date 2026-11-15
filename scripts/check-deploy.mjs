// P13: check the public GitHub Pages URL and, when it answers 200, run the golden-path e2e against it.
// Writes data/validation/DEPLOY.json. Usage: node scripts/check-deploy.mjs [url]
// Behind an HTTPS proxy (cloud sessions) run with NODE_USE_ENV_PROXY=1 so fetch uses it.
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = process.argv[2] ?? 'https://w14m3.github.io/NASA_SpaceApps2026/'
let code = 0
let err = ''
try {
  const r = await fetch(url, { redirect: 'follow' })
  code = r.status
} catch (e) {
  err = String(e?.cause?.code ?? e?.message ?? e)
}
let golden = 'not run'
if (code === 200) {
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'test', '--trace', 'off', '-g', 'golden path'], {
    cwd: join(root, 'web'),
    stdio: 'inherit',
    env: { ...process.env, E2E_BASE_URL: url },
    shell: process.platform === 'win32',
  })
  golden = r.status === 0 ? 'pass' : 'fail'
}
const pass = code === 200 && golden === 'pass'
const rec = {
  id: 'DEPLOY',
  test: `Public URL ${url} returns 200 and the golden-path e2e passes against it`,
  criterion: 'HTTP 200 and golden path pass',
  measured: { http_status: code, error: err || null, golden_path: golden },
  summary: code === 200 ? `HTTP 200, golden path ${golden}` : `HTTP ${code || err} — GitHub Pages not live (enable Settings → Pages → Source: GitHub Actions)`,
  status: pass ? 'pass' : 'fail',
  generated_utc: new Date().toISOString(),
  generator: 'scripts/check-deploy.mjs',
}
writeFileSync(join(root, 'data', 'validation', 'DEPLOY.json'), JSON.stringify(rec, null, 1))
console.log(rec.summary)
