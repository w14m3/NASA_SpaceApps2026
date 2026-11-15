// Records a Lighthouse JSON report (run separately) as data/validation/LIGHTHOUSE.json.
// Usage: npx lighthouse <url> --output=json --output-path=report.json --chrome-flags="--headless --no-sandbox"
//        node scripts/lighthouse-record.mjs report.json
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const s = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)]))
const pass = (s.performance ?? 0) >= 85 && (s.accessibility ?? 0) >= 95
writeFileSync(
  join(root, 'data', 'validation', 'LIGHTHOUSE.json'),
  JSON.stringify(
    {
      id: 'LIGHTHOUSE',
      test: `Lighthouse ${r.lighthouseVersion} on ${r.finalDisplayedUrl ?? r.finalUrl} (${r.configSettings.formFactor}, ${r.configSettings.throttlingMethod} throttling)`,
      criterion: 'performance >= 85, accessibility >= 95 (contract §8)',
      measured: { scores: s, lcp_ms: r.audits['largest-contentful-paint']?.numericValue, tbt_ms: r.audits['total-blocking-time']?.numericValue },
      summary: Object.entries(s).map(([k, v]) => `${k} ${v}`).join(', '),
      status: pass ? 'pass' : 'fail',
      generated_utc: new Date().toISOString(),
      generator: 'scripts/lighthouse-record.mjs',
    },
    null,
    1,
  ),
)
console.log(s, pass ? 'pass' : 'fail')
