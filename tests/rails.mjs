/**
 * Rail-branching assertions.
 *
 *   npm run test:rails
 *
 * The collection rail is the spine of the product: which rail pays a member
 * keys the pay screen, the ID card, the contributions ledger and most of the
 * console. The smoke test proves no screen throws; this proves the branches
 * actually branch — that self-pay never claims a payroll file exists, and that
 * a payroll rail never offers a debit run as the main collection.
 *
 * Assertions are on member- and officer-facing text, because that is what a
 * wrong branch looks like from the outside: an HR officer told to upload a
 * schedule on a rail that has none, or a member told their salary was deducted
 * when it never was.
 */
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const HOST = '127.0.0.1'
const PORT = Number(process.env.RAILS_PORT ?? 4187)
const BASE = `http://${HOST}:${PORT}/`

/** What each rail must say for itself, per surface. */
const RAILS = {
  Federal: {
    payroll: true,
    rail: 'IPPIS deduction code CSP-114',
    ledger: 'IPPIS',
    collectedBy: 'IPPIS · Fed. Min. of Education',
    org: 'Fed. Min. of Education',
    railRef: 'IPPIS-AUG-2026',
    code: 'CSP-114',
  },
  State: {
    payroll: true,
    rail: 'Schedule CSP-LA-07',
    ledger: 'LAG PAYROLL',
    collectedBy: 'Lagos State payroll',
    org: 'Lagos State Head of Service',
    railRef: 'CSP-LA-07/08',
    code: 'CSP-LA-07',
  },
  Employer: {
    payroll: true,
    rail: 'Schedule CSP-EM-2214',
    ledger: 'CSV SCHEDULE',
    collectedBy: 'Employer payroll',
    org: 'Nightingale Hospital, Ikeja',
    railRef: 'CSP-EM-2214',
    code: 'CSP-EM-2214',
  },
  'Self-pay': {
    payroll: false,
    rail: 'NIBSS e-mandate MND-88214',
    ledger: 'DIRECT DEBIT',
    collectedBy: 'Direct debit · GTBank ••4471',
    org: 'Self-paying members',
    railRef: 'MND-88214',
    code: 'MND-88214',
  },
}

const server = spawn(
  'npx',
  ['vite', 'preview', '--host', HOST, '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
let serverOutput = ''
server.stdout?.on('data', (d) => (serverOutput += d))
server.stderr?.on('data', (d) => (serverOutput += d))

function portOpen(port) {
  return new Promise((resolve) => {
    const s = connect({ host: HOST, port })
    const done = (ok) => (s.destroy(), resolve(ok))
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
    s.setTimeout(1000, () => done(false))
  })
}

const failures = []
let checks = 0

let browser
try {
  const deadline = Date.now() + 60_000
  while (!(await portOpen(PORT))) {
    if (Date.now() > deadline || server.exitCode !== null) {
      throw new Error(`preview did not start on ${BASE}\n${serverOutput.trim()}`)
    }
    await sleep(250)
  }

  browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.goto(BASE, { waitUntil: 'load', timeout: 60_000 })
  await page.getByRole('button', { name: 'Phone', exact: true }).first().waitFor()

  const surface = (name) => page.getByRole('button', { name, exact: true }).click()
  const open = async (label) => {
    await page.getByRole('button', { name: label }).first().click()
    await page.waitForTimeout(60)
  }
  const body = () => page.locator('body').innerText()

  /** Assert the rendered text does (or does not) contain a phrase. */
  const expect = async (rail, where, phrase, present = true) => {
    checks++
    const text = await body()
    const found = text.includes(phrase)
    if (found !== present) {
      failures.push(
        `${rail} · ${where}: expected ${present ? 'to see' : 'NOT to see'} “${phrase}”`,
      )
    }
  }

  for (const [rail, x] of Object.entries(RAILS)) {
    // ── Member · phone ──────────────────────────────────────────────────────
    await surface('Phone')
    await page.getByRole('button', { name: rail, exact: true }).first().click()
    await page.waitForTimeout(80)

    await open('How you pay')
    await expect(rail, 'phone/pay', x.rail)
    // Primary and backup are different per rail, and never each other's.
    await expect(rail, 'phone/pay', x.payroll ? 'Salary deduction' : 'Card or bank direct debit')
    await expect(rail, 'phone/pay', x.payroll ? 'Card · GTBank ••4471' : 'USSD or bank transfer')
    // The invariant that matters: a self-paying member has no payroll
    // deduction, so nothing on this rail may claim one.
    await expect(rail, 'phone/pay', 'Salary deduction', x.payroll)

    await open('Contributions')
    await expect(rail, 'phone/contributions', x.ledger)
    // Same invariant on the ledger, where getting it wrong tells a member
    // their salary was docked when it never was — in the row title and in the
    // state beside the amount.
    await expect(rail, 'phone/contributions', 'Payroll deduction', x.payroll)
    await expect(rail, 'phone/contributions', x.payroll ? 'Payroll' : 'Confirmed')

    await open('Protection card')
    await expect(rail, 'phone/card', x.collectedBy)

    // ── Sponsor · console ───────────────────────────────────────────────────
    await surface('Console')
    await page.getByRole('button', { name: rail, exact: true }).first().click()
    await page.waitForTimeout(80)

    await open('Dashboard')
    await expect(rail, 'console/dashboard', x.org)
    await expect(rail, 'console/dashboard', x.payroll ? 'August deduction cycle' : 'August collection run')

    await open('Monthly schedule')
    // Only self-pay says it has no schedule to send.
    await expect(
      rail,
      'console/schedule',
      'Self-paying sponsors have no schedule to send',
      !x.payroll,
    )
    await expect(rail, 'console/schedule', x.code)

    await open('Reconciliation')
    await expect(rail, 'console/recon', x.payroll ? 'Return file · August 2026' : 'Debit results · August 2026')
    await expect(rail, 'console/recon', 'There is no return file on this rail', !x.payroll)

    await open('Exception detail')
    await expect(
      rail,
      'console/exception',
      x.payroll
        ? '₦2,500 was deducted from someone we cannot identify'
        : "₦2,500 was refused by the member's bank",
    )

    await open('Direct-debit run')
    // On a payroll rail the debit run is only the fallback, and says so.
    await expect(rail, 'console/debit', 'This sponsor collects through payroll', x.payroll)

    // ── Member · web ────────────────────────────────────────────────────────
    await surface('Web')
    await page.getByRole('button', { name: rail, exact: true }).first().click()
    await page.waitForTimeout(80)

    await open('Contributions')
    await expect(rail, 'web/contributions', x.railRef)
    await expect(
      rail,
      'web/contributions',
      x.payroll ? x.collectedBy : 'Direct debit · GTBank ••4471',
    )

    console.log(`  ${rail.padEnd(9)} ok`)
  }
} catch (err) {
  failures.push(err.message)
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} of ${checks} rail assertions failed:`)
  for (const f of failures) console.error(`  ${f}`)
} else {
  console.log(`\n✓ ${checks} rail assertions passed across four rails and three surfaces`)
}
process.exit(failures.length ? 1 : 0)
