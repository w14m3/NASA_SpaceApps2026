// Writes validation records (data/validation/<id>.json) from tests: statuses are generated, never typed.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './testdata'

export function record(id: string, rec: { test: string; criterion: string; measured: unknown; summary: string; pass: boolean }) {
  const dir = join(ROOT, 'data', 'validation')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify(
      { id, test: rec.test, criterion: rec.criterion, measured: rec.measured, summary: rec.summary, status: rec.pass ? 'pass' : 'fail', generated_utc: new Date().toISOString(), generator: 'vitest (web/src/core)' },
      null,
      1,
    ),
  )
}
