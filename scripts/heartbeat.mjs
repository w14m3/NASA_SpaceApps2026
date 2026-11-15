// Refresh docs/LOCK.md (contract §0.6): node scripts/heartbeat.mjs "<current objective>"
import { readFileSync, writeFileSync } from 'node:fs'
const path = new URL('../docs/LOCK.md', import.meta.url)
const now = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 16) + ' Europe/Paris'
let s = readFileSync(path, 'utf8')
s = s.replace(/- last heartbeat: .*/, `- last heartbeat: ${now}`)
if (process.argv[2]) s = s.replace(/- current objective: .*/, `- current objective: ${process.argv[2]}`)
writeFileSync(path, s)
console.log(`heartbeat ${now}`)
