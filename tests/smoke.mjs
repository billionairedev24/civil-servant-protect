/**
 * Smoke test: visit every route in all three applications and fail on any
 * runtime error.
 *
 * This is deliberately not a unit test suite. The app is almost entirely
 * presentational, so the failure mode worth guarding against is a screen that
 * throws or renders nothing — something `tsc` cannot see. It already caught a
 * clipped button and a font that never loaded.
 *
 *   npm run smoke
 *
 * Starts `vite preview` against the built output, walks the routes in Chromium,
 * and exits non-zero on any uncaught exception or console error. Because each
 * screen has its own address, this is a plain page load per screen rather than
 * a click path — which also proves deep links and refresh work.
 */
import {
  CONSOLE_ROUTES, LANGS, PHONE_ROUTES, RAIL_IDS, WEB_ROUTES,
  launchBrowser, startPreview, withParams,
} from './harness.mjs'

const PORT = Number(process.env.SMOKE_PORT ?? 4180)

let browser
let server
let failed = false

try {
  const started = await startPreview(PORT)
  server = started.server
  const { base } = started

  browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

  const problems = []
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })

  /**
   * Load a route and assert it actually painted. A React error boundary or a
   * bad route would leave an all-but-empty document, which `pageerror` alone
   * does not always catch.
   */
  const visit = async (url, params, label) => {
    const target = withParams(base, url, params)
    await page.goto(target, { waitUntil: 'load', timeout: 60_000 })
    const text = (await page.locator('body').innerText()).trim()
    if (text.length < 20) {
      problems.push(`${label}: ${url} rendered ${text.length} characters — blank`)
    }
    return text
  }

  for (const r of PHONE_ROUTES) await visit(r.url, {}, 'phone')
  console.log(`  member app (mobile)   ${PHONE_ROUTES.length} routes`)

  for (const r of WEB_ROUTES) await visit(r.url, {}, 'web')
  console.log(`  member app (web)      ${WEB_ROUTES.length} routes`)

  for (const r of CONSOLE_ROUTES) await visit(r.url, {}, 'console')
  console.log(`  sponsor console       ${CONSOLE_ROUTES.length} routes`)

  // The rail keys most of the copy, so every rail gets the money screens.
  for (const rail of RAIL_IDS) {
    await visit('/m/pay', { rail }, 'phone')
    await visit('/m/contrib', { rail }, 'phone')
    await visit('/contributions', { rail }, 'web')
    await visit('/console/reconciliation', { rail }, 'console')
  }
  console.log(`  rails                 ${RAIL_IDS.length} × 4 money screens`)

  // Five languages on the densest screen, where a long translation breaks
  // layout first.
  for (const lang of LANGS) await visit('/m/home', { lang }, 'phone')
  console.log(`  languages             ${LANGS.length}`)

  // Scenario flags: a late deduction and an offline handset.
  for (const demo of ['late', 'offline', 'sun', 'late,offline']) {
    await visit('/m/home', { demo }, 'phone')
    await visit('/m/contrib', { demo }, 'phone')
  }
  console.log('  scenarios             4')

  // An address nobody owns must land somewhere sensible, not on a blank page.
  const stray = await visit('/m/not-a-screen', {}, 'phone')
  if (!stray.length) problems.push('unknown route rendered nothing')

  if (problems.length) {
    failed = true
    console.error(`\n✗ ${problems.length} runtime problem(s):`)
    for (const p of problems) console.error(`  ${p}`)
  } else {
    console.log('\n✓ every route rendered, no exceptions or console errors')
  }
} catch (err) {
  failed = true
  console.error(`\n✗ ${err.message}`)
} finally {
  await browser?.close()
  server?.kill('SIGTERM')
}

process.exit(failed ? 1 : 0)
