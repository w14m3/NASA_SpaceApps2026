// Headless smoke test: loads the built app, exercises the main flow, saves screenshots, fails on console errors.
// Usage: npm run build && npx vite preview --port 4173 &  then  node e2e/smoke.mjs
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const base = process.env.APP_URL ?? 'http://localhost:4173/'
const out = new URL('./shots/', import.meta.url)
mkdirSync(out, { recursive: true })
const shot = (page, name) => page.screenshot({ path: new URL(name, out).pathname.replace(/^\/([A-Za-z]:)/, '$1') })

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []
const failures = []
let passed = 0
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (ok) passed++
  else failures.push(msg)
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

// 1) first-use path: open -> pick a site -> read the verdict
await page.goto(base + '#t=2026-11-14T12:00:00Z&v=polar')
await page.waitForSelector('.sitelist button')
check(await page.locator('.workbench.empty').count() === 1, 'empty state shown before a site is picked')
await page.locator('.sitelist button', { hasText: 'Connecting Ridge' }).first().click()
await page.waitForSelector('.score-n')
const scores = await page.locator('.score-n').allTextContents()
check(scores.length === 3 && scores.every((s) => /^\d+$/.test(s)), `verdict scores rendered: ${scores.join(' / ')}`)
check((await page.locator('.horizon-kind').textContent()).includes('80 m'), 'curated site uses the precomputed 80 m DEM horizon')
check(await page.locator('.card').count() === 2, 'Sun and Earth countdown cards present')
await page.waitForTimeout(800)
await shot(page, '1-polar-site.png')

// 2) compare: pin a second site
await page.locator('.sitelist button', { hasText: 'Athena' }).first().click()
await page.waitForSelector('table.compare')
check(await page.locator('table.compare tbody tr').count() === 2, 'compare table lists two pinned sites')
await shot(page, '2-compare.png')

// 3) custom site by clicking the polar map
const box = await page.locator('.polarmap canvas').boundingBox()
await page.mouse.click(box.x + box.width / 2 - 150, box.y + box.height / 2 + 130)
await page.waitForFunction(() => document.querySelector('.site-head h2')?.textContent?.startsWith('Custom'), null, { timeout: 20000 })
check((await page.locator('.horizon-kind').textContent()).includes('240 m'), 'custom polar site gets an in-browser 240 m DEM horizon')
await shot(page, '3-custom.png')

// 4) share link restores state
await page.waitForTimeout(500)
const url = page.url()
const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page2.on('pageerror', (e) => errors.push(String(e)))
await page2.goto(url)
await page2.waitForSelector('.score-n')
await page2.waitForFunction(() => document.querySelectorAll('.tab').length === 3, null, { timeout: 30000 }).catch(() => {})
check(await page2.locator('.tab').count() === 3, 'share URL restores three pinned sites')
check((await page2.locator('.site-head h2').textContent()).startsWith('Custom'), 'share URL restores the active custom site')
await page2.close()

// 5) non-polar site is honestly labelled
await page.locator('.sitelist summary', { hasText: 'Apollo' }).click()
await page.locator('.sitelist button', { hasText: 'Apollo 11' }).click()
await page.waitForFunction(() => document.querySelector('.site-head h2')?.textContent?.includes('Apollo 11'))
check((await page.locator('.horizon-kind').textContent()).includes('Smooth-sphere'), 'site without DEM coverage is labelled smooth-sphere')

// 6) 3D globe renders
await page.locator('.seg button', { hasText: '3D Moon' }).click()
await page.waitForSelector('.globe canvas', { timeout: 30000 })
await page.waitForTimeout(9000)
await shot(page, '4-globe.png')
check(await page.locator('.globe canvas').count() === 1, 'Cesium canvas created')

// 7) Trust page
await page.locator('button', { hasText: 'Methods' }).click()
await page.waitForSelector('.trust h1')
await page.waitForTimeout(500)
check(await page.locator('table.checks tbody tr').count() >= 10, 'Trust page lists the validation matrix')
await page.screenshot({ path: new URL('5-trust.png', out).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true })

// 8) phone layout
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } })
await phone.goto(base + '#t=2026-11-14T12:00:00Z&v=polar&pins=poi_site001_connecting_ridge')
await phone.waitForSelector('.score-n')
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
if (overflow > 1) console.log('   widest:', await phone.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 6).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)).join(' | ')))
check(overflow <= 1, `no horizontal page scroll at 390 px (overflow ${overflow}px)`)
await phone.screenshot({ path: new URL('6-phone.png', out).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true })

const real = errors.filter((e) => !/trek\.nasa\.gov|Failed to load resource|net::ERR/.test(e))
check(real.length === 0, `no console errors (${real.length})`)
real.slice(0, 8).forEach((e) => console.log('   ', e.slice(0, 300)))
await browser.close()
const vdir = new URL('../../data/validation/', import.meta.url)
mkdirSync(vdir, { recursive: true })
writeFileSync(new URL('V13.json', vdir), JSON.stringify({ passed, failed: failures.length, failures }, null, 1))
if (failures.length) process.exit(1)
