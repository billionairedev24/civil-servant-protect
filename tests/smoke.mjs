/**
 * Smoke test: drive every screen on every surface and fail on any runtime error.
 *
 * This is deliberately not a unit test suite. The app is almost entirely
 * presentational, so the failure mode worth guarding against is a screen that
 * throws or renders nothing — something `tsc` cannot see. It already caught a
 * clipped button and a font that never loaded.
 *
 *   npm run smoke
 *
 * Starts `vite preview` against the built output, drives the UI in Chromium,
 * and exits non-zero on any uncaught exception or console error.
 */
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const PORT = Number(process.env.SMOKE_PORT ?? 4180)
const BASE = `http://localhost:${PORT}/`

const SURFACES = ['Phone', 'Web', 'Console', 'Spec']
const RAILS = ['Federal', 'State', 'Employer', 'Self-pay']
const LANGS = ['EN', 'HA', 'YO', 'IG', 'PCM']

const PHONE_SCREENS = [
  'Splash + language', 'Sign in', 'Phone number', 'SMS code', 'Fingerprint', 'Who pays you',
  'NIN + BVN check', 'Enrolment', 'Cover starts', 'Home', 'How you pay', 'Contributions',
  'Protection card', 'Cover + tiers', 'Who gets paid', 'Report accident', 'Make a claim',
  'Track claim', 'Family cover', 'Profile', 'Confirm beneficiaries', 'Why it changed',
  'Employer onboarding', 'Sponsor console', 'Beneficiary',
]

const WEB_SCREENS = [
  'Sign in', 'Choose cover', 'Dashboard', 'Cover detail', 'Protection card', 'Family cover',
  'Contributions', 'Beneficiaries', 'Make a claim', 'Track claim', 'Profile + settings',
  'Next-of-kin portal',
]

const CONSOLE_SCREENS = [
  'Dashboard', 'Monthly schedule', 'Reconciliation', 'Exception detail', 'Direct-debit run',
  'Remittances', 'Members', 'Add / remove', 'Claims', 'Settings and roles', 'Reports',
]

const SPEC_SECTIONS = [
  'Overview', 'What lives where', 'Data + API', 'Copy keys', 'Validation', 'Screen states',
  'Breakpoints', 'Rail branching',
]

/**
 * Readiness is a raw TCP connect rather than a fetch: an HTTP proxy in the
 * environment can swallow requests to localhost, and we only need to know the
 * listener is up.
 */
function portOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    const done = (ok) => {
      socket.destroy()
      resolve(ok)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(1000, () => done(false))
  })
}

async function waitForServer(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portOpen(port)) return
    await sleep(250)
  }
  throw new Error(
    `preview server did not start on port ${port}. ` +
      'Is the port already taken, or has `npm run build` not been run?',
  )
}

// --strictPort so a busy port fails loudly instead of vite quietly moving to
// the next one and leaving us driving a stale build on the wrong address.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  detached: false,
})

let browser
let failed = false

try {
  await waitForServer(PORT)

  browser = await chromium.launch(
    // In sandboxes the bundled browser lives outside node_modules.
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

  const problems = []
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })

  // 'load' rather than 'networkidle': networkidle is timing-sensitive and
  // Playwright discourages it. What actually matters is that the shell has
  // painted, so wait for the surface tabs.
  await page.goto(BASE, { waitUntil: 'load', timeout: 60_000 })
  await page.getByRole('button', { name: 'Phone', exact: true }).first().waitFor({ timeout: 30_000 })

  const surface = (name) => page.getByRole('button', { name, exact: true }).click()
  const open = async (label) => {
    // Nav buttons carry their group label in the accessible name, so this is a
    // substring match by design.
    await page.getByRole('button', { name: label }).first().click()
    await page.waitForTimeout(40)
  }

  for (const s of SURFACES) {
    await surface(s)
    await page.waitForTimeout(150)
    const count = await page.locator('button').count()
    if (count < 10) throw new Error(`${s} surface rendered only ${count} controls — likely blank`)
    console.log(`  ${s.padEnd(8)} ${count} controls`)
  }

  await surface('Phone')
  for (const s of PHONE_SCREENS) await open(s)
  console.log(`  phone    ${PHONE_SCREENS.length} screens`)

  for (const r of RAILS) await open(r)
  for (const l of LANGS) await open(l)
  console.log(`  rails    ${RAILS.length} · langs ${LANGS.length}`)

  await surface('Console')
  for (const device of ['Phone', 'Desktop']) {
    await page.locator('button').filter({ hasText: new RegExp(`^${device}$`) }).last().click()
    for (const s of CONSOLE_SCREENS) await open(s)
  }
  console.log(`  console  ${CONSOLE_SCREENS.length} screens × 2 devices`)

  await surface('Web')
  for (const s of WEB_SCREENS) await open(s)
  console.log(`  web      ${WEB_SCREENS.length} screens`)

  await surface('Spec')
  for (const s of SPEC_SECTIONS) await open(s)
  console.log(`  spec     ${SPEC_SECTIONS.length} sections`)

  if (problems.length) {
    failed = true
    console.error(`\n✗ ${problems.length} runtime problem(s):`)
    for (const p of problems) console.error(`  ${p}`)
  } else {
    console.log('\n✓ every screen rendered, no exceptions or console errors')
  }
} catch (err) {
  failed = true
  console.error(`\n✗ ${err.message}`)
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}

process.exit(failed ? 1 : 0)
