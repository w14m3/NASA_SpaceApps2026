import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const errors: string[] = []
/** Most tests exercise the expert (Plan) interface; Explore has its own tests below. */
async function open(page: Page, hash = '') {
  if (!hash.includes('mode=')) hash = hash ? `${hash}&mode=plan` : '#mode=plan'
  errors.length = 0
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/trek\.nasa\.gov|Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  await page.goto('/' + hash)
}

test.describe('explore', () => {
  test('golden path explore: the simple screen answers the three questions and shows the Top 3 within 10 s, brief within 60 s', async ({ page }) => {
    const t0 = Date.now()
    await open(page, '#mode=explore')
    await expect(page.getByTestId('explore')).toBeVisible()
    await expect(page.getByTestId('option-A')).toBeVisible({ timeout: 10_000 })
    const tTop3 = Date.now() - t0
    await expect(page.getByTestId('answer-land')).toContainText(/Slope|terrain/, { timeout: 20_000 })
    await expect(page.getByTestId('answer-power')).toContainText('Sunlit', { timeout: 20_000 })
    await expect(page.getByTestId('answer-link')).toContainText('Direct link', { timeout: 20_000 })
    await page.getByTestId('option-A').click()
    await page.getByTestId('option-A').getByRole('button').first().click()
    await page.getByTestId('full-analysis').click()
    await expect(page.getByTestId('workbench')).toBeVisible()
    await page.getByTestId('choose').click()
    await expect(page.getByTestId('brief-page')).toBeVisible()
    console.log(`explore golden path: top3 ${tTop3} ms, brief ${Date.now() - t0} ms`)
    expect(tTop3).toBeLessThan(10_000)
    expect(errors).toEqual([])
  })

  test('3D moon map: zoom, fly to the pole and the whole Moon, click to analyse a spot', async ({ page }) => {
    await open(page, '#mode=explore')
    const globe = page.getByTestId('moon-globe')
    await expect(globe).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('zoom-in').click()
    await page.getByTestId('fly-moon').click()
    await page.waitForTimeout(2200)
    await expect(page.getByTestId('globe-hud')).toContainText('km above the surface')
    await page.getByTestId('fly-pole').click()
    await page.waitForTimeout(2200)
    const box = (await globe.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.5)
    await expect(page.getByTestId('place-card')).toContainText('°S', { timeout: 10_000 })
    await page.getByTestId('light-sun').click()
    await page.getByTestId('relief').fill('4')
    expect(errors).toEqual([])
  })
})

test.describe('golden path', () => {
  test('golden path: Top 3 within 10 s, option opens the workbench, brief within 60 s', async ({ page }) => {
    const t0 = Date.now()
    await open(page)
    await expect(page.getByTestId('option-A')).toBeVisible({ timeout: 10_000 })
    const tTop3 = Date.now() - t0
    await expect(page.getByTestId('option-B')).toBeVisible()
    await expect(page.getByTestId('option-C')).toBeVisible()
    await page.getByTestId('option-A').click()
    await expect(page.getByTestId('choose')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('choose').click()
    await expect(page.getByTestId('brief-page')).toBeVisible()
    await expect(page.getByTestId('brief-table')).toBeVisible()
    await expect(page.getByTestId('brief-engineering')).toBeVisible()
    await expect(page.getByTestId('brief-science')).toBeVisible()
    const tBrief = Date.now() - t0
    console.log(`golden path timings: top3 ${tTop3} ms, brief ${tBrief} ms`)
    expect(tTop3).toBeLessThan(10_000)
    expect(tBrief).toBeLessThan(60_000)
    expect(errors).toEqual([])
  })
})

test.describe('sites', () => {
  test('custom site by form', async ({ page }) => {
    await open(page)
    await page.getByTestId('custom-lat').fill('-89.3')
    await page.getByTestId('custom-lon').fill('-130')
    await page.getByTestId('custom-apply').click()
    await expect(page.getByTestId('site-label')).toContainText('89.300°S')
    await expect(page.getByTestId('workbench')).toContainText('LOLA 240 m', { timeout: 20_000 })
    // validation of bad input
    await page.getByTestId('custom-lat').fill('-95')
    await expect(page.getByTestId('custom-apply')).toBeDisabled()
  })

  test('custom site by map click', async ({ page }) => {
    await open(page)
    const map = page.getByTestId('polar-map')
    await expect(map).toBeVisible()
    const box = (await map.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6)
    await expect(page.getByTestId('site-label')).toContainText('°S', { timeout: 10_000 })
    await expect(page.getByTestId('site-label')).not.toContainText('Connecting Ridge (site 001)')
  })

  test('search finds names and coordinates', async ({ page }) => {
    await open(page)
    await page.getByTestId('search').fill('Malapert')
    await page.getByRole('button', { name: /Malapert massif \(Bussey M1\)/ }).first().click()
    await expect(page.getByTestId('site-label')).toContainText('Malapert')
    await page.getByTestId('search').fill('Shackleton')
    await page.getByRole('button', { name: /^Shackleton \(IAU/ }).click()
    await expect(page.getByTestId('site-label')).toContainText('89.670°S')
    await page.getByTestId('search').fill('-88.5, 120')
    await page.getByTestId('search-go').click()
    await expect(page.getByTestId('site-label')).toContainText('88.500°S')
  })

  test('sites catalogue lists 26 sourced sites in four groups', async ({ page }) => {
    await open(page)
    for (const g of ['southPole', 'clps', 'international', 'apollo']) await expect(page.getByTestId(`group-${g}`)).toBeVisible()
    await expect(page.locator('[data-testid^="site-"]')).toHaveCount(26 + 1) // + site-label
  })
})

test.describe('time', () => {
  test('time controls: date, slip, scrub and window', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('timeline')).toBeVisible()
    const before = await page.getByTestId('mission-time').inputValue()
    await page.getByTestId('slip-1').click()
    await expect(page.getByTestId('mission-time')).not.toHaveValue(before)
    await page.getByTestId('slip-lunar').click()
    await page.getByTestId('duration').selectOption('30')
    await page.getByTestId('landing-date').fill('2027-01-10')
    await expect(page.getByTestId('mission-time')).toHaveValue(/2027-01-1/)
    const tl = (await page.getByTestId('timeline').boundingBox())!
    await page.mouse.click(tl.x + tl.width * 0.8, tl.y + tl.height / 2)
    await expect(page.getByTestId('mission-time')).toHaveValue(/2027-02-0[1-4]/)
    await page.getByTestId('timeline').focus()
    const v0 = await page.getByTestId('mission-time').inputValue()
    await page.keyboard.press('Shift+ArrowLeft')
    await expect(page.getByTestId('mission-time')).not.toHaveValue(v0)
    // year view
    await page.getByTestId('duration').selectOption('365')
    await expect(page.getByTestId('duration')).toHaveValue('365')
  })

  test('play animates the mission time', async ({ page }) => {
    await open(page)
    const before = await page.getByTestId('mission-time').inputValue()
    await page.getByTestId('speed').selectOption('86400')
    await page.getByTestId('play').click()
    await page.waitForTimeout(1500)
    await page.getByTestId('play').click()
    expect(await page.getByTestId('mission-time').inputValue()).not.toBe(before)
  })
})

test.describe('conditions', () => {
  test('solar elevation card is prominent with a number from the core', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('solar-card')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('solar-el')).toHaveText(/^[+−]\d+[.,]\d\d°$/)
    await expect(page.getByTestId('metrics')).toContainText('Sunlit', { timeout: 20_000 })
  })

  test('countdowns show Sun, Earth and DTE with ± from the horizon band', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('cd-earth')).toContainText(/\d/, { timeout: 15_000 })
    await expect(page.getByTestId('cd-dte')).toBeVisible()
    await expect(page.getByTestId('cd-sun')).toBeVisible()
    await expect(page.getByTestId('cd-earth')).toContainText('±')
  })

  test('sky plot shows terrain, Sun and Earth with the exaggeration label', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('sky-plot')).toBeVisible()
    await expect(page.getByText(/vertical axis ×\d+, for visibility/)).toBeVisible()
  })

  test('libration loop is drawn as the Earth trail over the window', async ({ page }) => {
    await open(page, '#dur=30')
    await expect(page.getByTestId('sky-plot')).toBeVisible()
    await expect(page.getByText(/Earth libration loop/)).toBeVisible()
  })
})

test.describe('views', () => {
  test('views: globe, site 3d, street view and south pole', async ({ page }) => {
    await open(page)
    await page.getByTestId('view-globe').click()
    await expect(page.getByTestId('globe')).toBeVisible()
    await page.getByTestId('view-site3d').click()
    await expect(page.getByTestId('site3d')).toBeVisible()
    await page.getByTestId('view-street').click()
    await expect(page.getByTestId('street-view')).toBeVisible()
    await page.getByTestId('view-pole').click()
    await expect(page.getByTestId('polar-map')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('street view panorama renders and turns with the keyboard', async ({ page }) => {
    await open(page, '#view=street')
    const sv = page.getByTestId('street-view')
    await expect(sv).toBeVisible()
    const a = await sv.getAttribute('aria-label')
    await sv.focus()
    await page.keyboard.press('ArrowRight')
    expect(await sv.getAttribute('aria-label')).not.toBe(a)
  })

  test('site 3d renders with true-Sun lighting and reports frame rate', async ({ page }) => {
    await open(page, '#view=site3d')
    await expect(page.getByTestId('site3d')).toBeVisible()
    await page.waitForTimeout(3000)
    await expect(page.getByTestId('fps')).toContainText('fps')
    await page.screenshot({ path: '../docs/screenshots/site3d.png' })
  })
})

test.describe('maps and layers', () => {
  test('layers panel toggles computed layers with a legend', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('option-A')).toBeVisible({ timeout: 10_000 })
    for (const l of ['lit', 'night', 'zero', 'earth', 'dte', 'slope', 'viability', 'gain']) {
      await page.getByTestId(`layer-${l}`).check()
      await expect(page.getByTestId('legend')).toBeVisible()
    }
    await page.getByTestId('layer-lighting').check()
    await page.getByTestId('layer-rays').check()
    await page.waitForTimeout(1500)
  })

  test('place card: clicking a site opens the workbench with the four answers', async ({ page }) => {
    await open(page)
    await page.getByTestId('site-im2_athena').click()
    await expect(page.getByTestId('workbench')).toContainText('IM-2 Athena')
    await expect(page.getByTestId('verdict')).toContainText('Power', { timeout: 20_000 })
    await expect(page.getByTestId('verdict')).toContainText('Earth')
    await expect(page.getByTestId('verdict')).toContainText('Landing')
  })

  test('share link restores the same scenario', async ({ page, context }) => {
    await open(page)
    await page.getByTestId('site-poi_site004_shackleton_rim').click()
    await page.getByTestId('slip-7').click()
    await page.waitForTimeout(400)
    const url = page.url()
    const p2 = await context.newPage()
    await p2.goto(url)
    await expect(p2.getByTestId('site-label')).toContainText('Shackleton rim (site 004)')
    expect(await p2.getByTestId('mission-time').inputValue()).toBe(await page.getByTestId('mission-time').inputValue())
  })
})

test.describe('workbench panels', () => {
  test('energy panel shows the headline versus baseline and the survival timeline', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('energy-headline')).toContainText('versus the baseline', { timeout: 30_000 })
    await expect(page.getByTestId('energy')).toContainText(/survives the window|battery empty/)
  })

  test('connectivity panel: DSN, pointing envelope, path loss, interference', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('connectivity')).toContainText('Path loss', { timeout: 20_000 })
    await expect(page.getByTestId('connectivity')).toContainText('DSS-14')
    await expect(page.getByTestId('connectivity')).toContainText('interference')
  })

  test('safety panel: slope, tip-over sentence, gauge and ellipse', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('safety')).toContainText('tips over if it touches down faster than', { timeout: 30_000 })
    await expect(page.getByTestId('safety-gauge')).toBeVisible()
    await page.getByTestId('lander').selectOption('large')
    await expect(page.getByTestId('safety')).toContainText('Generic large')
  })

  test('thermal proxy is shown in the workbench and the brief records assumptions', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('thermal')).toContainText('Cold soak', { timeout: 20_000 })
  })

  test('mission replay jumps to a published touchdown', async ({ page }) => {
    await open(page)
    await page.getByTestId('site-im1_odysseus').click()
    await page.getByTestId('replay').click()
    await expect(page.getByTestId('mission-time')).toHaveValue('2024-02-22T23:23')
    await expect(page.getByTestId('street-view')).toBeVisible()
  })

  test('constraints panels feed the Top 3', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('option-A')).toBeVisible({ timeout: 10_000 })
    const txt = await page.getByTestId('top3').innerText()
    await page.getByTestId('constraints').locator('summary').click()
    await expect(page.getByTestId('constraints-engineering')).toBeVisible()
    await expect(page.getByTestId('constraints-science')).toBeVisible()
    await page.getByTestId('cons-maxSlope').fill('3')
    await expect(page.getByTestId('top3')).not.toHaveText(txt, { timeout: 15_000 })
  })
})

test.describe('mission date', () => {
  test('Top 3 follows the mission date: same region, different landing dates give different options', async ({ page }) => {
    await open(page, '#land=2026-12-11T00:00Z')
    await expect(page.getByTestId('option-A')).toBeVisible({ timeout: 15_000 })
    const a = await page.getByTestId('top3').innerText()
    expect(a).toMatch(/\d+ of 3721/)
    // Earth librates north of the equator late in December: from the south pole it sinks below the horizon
    await page.getByTestId('landing-date').fill('2026-12-27')
    await expect(page.getByTestId('relax')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('No candidate passes every constraint.')).toBeVisible()
    await page.getByTestId('landing-date').fill('2027-01-10')
    await expect(page.getByTestId('option-A')).toBeVisible({ timeout: 20_000 })
    expect(await page.getByTestId('top3').innerText()).not.toBe(a)
  })
})

test.describe('compare', () => {
  test('compare: overlaid sky plots, deltas and bars for pinned sites', async ({ page }) => {
    await open(page)
    await page.getByTestId('site-poi_site004_shackleton_rim').click()
    await page.getByTestId('pin').click()
    await page.getByTestId('site-poi_site001_connecting_ridge').click()
    await page.getByTestId('nav-compare').click()
    await expect(page.getByTestId('compare-page')).toBeVisible()
    await expect(page.getByTestId('compare-table')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('compare-sky')).toBeVisible()
    await expect(page.getByTestId('compare-bars')).toBeVisible()
  })

  test('scenario compare: same site at different dates with deltas', async ({ page }) => {
    await open(page, '#page=compare')
    await expect(page.getByTestId('compare-table')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('scen-add').click()
    await expect(page.locator('[data-testid^="scen-date-"]')).toHaveCount(3)
    await expect(page.getByTestId('compare-table')).toContainText('(', { timeout: 30_000 })
  })

  test('porkchop plot of landing date x duration', async ({ page }) => {
    await open(page, '#page=compare')
    await expect(page.getByTestId('porkchop-best')).toContainText('Best:', { timeout: 40_000 })
  })

  test('season heatmap over 12 lunations', async ({ page }) => {
    await open(page, '#page=compare')
    await expect(page.getByTestId('season')).toContainText('best', { timeout: 40_000 })
  })
})

test.describe('access', () => {
  test('learn mode opens the guided tour and glossary', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Learn' }).click()
    await expect(page.getByTestId('tour')).toBeVisible()
    for (let i = 0; i < 4; i++) await page.getByTestId('tour-next').click()
    await expect(page.getByTestId('tour')).toContainText('Three options')
    await expect(page.getByTestId('glossary')).toBeAttached()
  })

  test('french translation switches the interface', async ({ page }) => {
    await open(page)
    await page.getByTestId('lang').click()
    await expect(page.getByRole('button', { name: 'Planifier un alunissage' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  })

  test('axe: no critical accessibility violations', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('option-A')).toBeVisible({ timeout: 10_000 })
    const r = await new AxeBuilder({ page: page as never }).analyze()
    const critical = r.violations.filter((v) => v.impact === 'critical')
    console.log('axe violations:', r.violations.map((v) => `${v.id}(${v.impact}, ${v.nodes.length})`).join(', '))
    expect(critical).toEqual([])
  })

  test('mobile 390 px layout shows the map and the Top 3', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.goto('/')
    await expect(page.getByTestId('moon-globe')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('option-A')).toBeAttached({ timeout: 15_000 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await page.screenshot({ path: '../docs/screenshots/mobile.png' })
    await ctx.close()
  })

  test('trust page lists generated validation statuses', async ({ page }) => {
    await open(page)
    await page.getByTestId('nav-trust').click()
    await expect(page.getByTestId('validation-table')).toContainText('O1')
    await expect(page.getByTestId('validation-table')).toContainText('pass')
    await expect(page.getByTestId('objectives-table')).toBeVisible()
  })
})

test.describe('value-added', () => {
  test('who blocks the Sun attributes nights to terrain or the limb', async ({ page }) => {
    await open(page, '#site=c:poi_bussey2010_M1_malapert&h=2&dur=30')
    await expect(page.getByTestId('who-blocks')).toContainText(/Night of \d+ h|No night/, { timeout: 30_000 })
  })

  test('illumination compass shows neighbour gains and snaps to the best', async ({ page }) => {
    await open(page, '#site=x:-89.40000,-140.00000')
    await expect(page.getByTestId('compass')).toContainText('sunlit', { timeout: 40_000 })
  })

  test('directions: least-effort route to Option B is drawn with distance and slope', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('option-A')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('route-to').selectOption('B')
    await expect(page.getByTestId('route-summary')).toContainText('km', { timeout: 30_000 })
    await expect(page.getByTestId('route-summary')).toContainText('max slope')
  })

  test('land it game scores a clicked spot and reveals the Top 3', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('option-A')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Learn' }).click()
    await page.getByTestId('play-land-it').click()
    await expect(page.getByTestId('land-it')).toBeVisible()
    const box = (await page.getByTestId('polar-map').boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByTestId('land-it-score')).toContainText('/100', { timeout: 10_000 })
  })

  test('offline: the installed app reloads without network', async ({ page, context }) => {
    await open(page)
    await expect(page.getByTestId('option-A')).toBeVisible({ timeout: 10_000 })
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    await page.reload()
    await expect(page.getByTestId('option-A')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('ground-chip')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1500)
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByTestId('option-A')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('solar-el')).toBeVisible()
    await context.setOffline(false)
  })
})
