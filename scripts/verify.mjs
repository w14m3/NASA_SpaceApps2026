// Full quality gate, cross-platform: lint, typecheck, vitest, offline pytest, build, Playwright e2e, objectives.
// Usage: node scripts/verify.mjs            (everything)
//        node scripts/verify.mjs pytest     (one step: lint | typecheck | unit | pytest | build | e2e | objectives)
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'reports'), { recursive: true })
const isWin = process.platform === 'win32'
const npm = isWin ? 'npm.cmd' : 'npm'

function python() {
  for (const cand of isWin ? ['python', 'py'] : ['python3', 'python']) {
    const r = spawnSync(cand, ['--version'], { encoding: 'utf8' })
    if (r.status === 0) return cand
  }
  throw new Error('Python 3.11+ not found on PATH')
}

const steps = {
  lint: [npm, ['run', 'lint']],
  typecheck: [npm, ['run', 'typecheck']],
  unit: [npm, ['run', 'test']],
  pytest: [() => python(), ['-m', 'pytest', '-q', 'pipeline/tests', '-m', 'not network', `--junitxml=${join('reports', 'pytest.xml')}`]],
  build: [npm, ['run', 'build']],
  e2e: [npm, ['run', 'e2e']],
  objectives: [process.execPath, [join('scripts', 'objectives.mjs')]],
}

const only = process.argv[2]
const order = only ? [only] : Object.keys(steps)
const results = []
for (const name of order) {
  const step = steps[name]
  if (!step) {
    console.error(`unknown step ${name}`)
    process.exit(2)
  }
  const cmd = typeof step[0] === 'function' ? step[0]() : step[0]
  const t0 = Date.now()
  console.log(`\n=== ${name}: ${cmd} ${step[1].join(' ')}`)
  const r = spawnSync(cmd, step[1], { cwd: root, stdio: 'inherit', shell: isWin })
  const ok = r.status === 0
  results.push({ name, ok, s: ((Date.now() - t0) / 1000).toFixed(1) })
  // objectives must always run, so keep going after a failure and report at the end
}
console.log('\n=== verify summary')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.s} s)`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
