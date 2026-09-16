/**
 * Rail-branching assertions.
 *
 *   npm run test:rails
 *
 * The collection rail is the spine of the product: which rail pays a member
 * keys the pay screen, the ID card, the contributions ledger and most of the
 * console. The smoke test proves no route throws; this proves the branches
 * actually branch — that self-pay never claims a payroll file exists, and that
 * a payroll rail never offers a debit run as the main collection.
 *
 * Assertions are on member- and officer-facing text, because that is what a
 * wrong branch looks like from the outside: an HR officer told to upload a
 * schedule on a rail that has none, or a member told their salary was deducted
 * when it never was.
 */
import { launchBrowser, startPreview, withParams } from './harness.mjs'

const PORT = Number(process.env.RAILS_PORT ?? 4187)

/** What each rail must say for itself, per application. */
const RAILS = {
  federal: {
    label: 'Federal',
    payroll: true,
    rail: 'IPPIS deduction code CSP-114',
    ledger: 'IPPIS',
    collectedBy: 'IPPIS · Fed. Min. of Education',
    org: 'Fed. Min. of Education',
    railRef: 'IPPIS-AUG-2026',
    code: 'CSP-114',
  },
  state: {
    label: 'State',
    payroll: true,
    rail: 'Schedule CSP-LA-07',
    ledger: 'LAG PAYROLL',
    collectedBy: 'Lagos State payroll',
    org: 'Lagos State Head of Service',
    railRef: 'CSP-LA-07/08',
    code: 'CSP-LA-07',
  },
  employer: {
    label: 'Employer',
    payroll: true,
    rail: 'Schedule CSP-EM-2214',
    ledger: 'CSV SCHEDULE',
    collectedBy: 'Employer payroll',
    org: 'Nightingale Hospital, Ikeja',
    railRef: 'CSP-EM-2214',
    code: 'CSP-EM-2214',
  },
  self: {
    label: 'Self-pay',
    payroll: false,
    rail: 'NIBSS e-mandate MND-88214',
    ledger: 'DIRECT DEBIT',
    collectedBy: 'Direct debit · GTBank ••4471',
    org: 'Self-paying members',
    railRef: 'MND-88214',
    code: 'MND-88214',
  },
}

const failures = []
let checks = 0

let browser
let server

try {
  const started = await startPreview(PORT)
  server = started.server
  const { base } = started

  browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

  /** Open a route on a rail and return everything it says. */
  const read = async (url, rail) => {
    await page.goto(withParams(base, url, { rail }), { waitUntil: 'load', timeout: 60_000 })
    return page.locator('body').innerText()
  }

  /** Assert the rendered text does (or does not) contain a phrase. */
  const expect = (text, rail, where, phrase, present = true) => {
    checks++
    if (text.includes(phrase) !== present) {
      failures.push(`${rail} · ${where}: expected ${present ? 'to see' : 'NOT to see'} “${phrase}”`)
    }
  }

  for (const [rail, x] of Object.entries(RAILS)) {
    const name = x.label

    // ── Member app · mobile ───────────────────────────────────────────────────
    let t = await read('/m/pay', rail)
    expect(t, name, 'app/pay', x.rail)
    // Primary and backup are different per rail, and never each other's.
    expect(t, name, 'app/pay', x.payroll ? 'Salary deduction' : 'Card or bank direct debit')
    expect(t, name, 'app/pay', x.payroll ? 'Card · GTBank ••4471' : 'USSD or bank transfer')
    // The invariant that matters: a self-paying member has no payroll
    // deduction, so nothing on this rail may claim one.
    expect(t, name, 'app/pay', 'Salary deduction', x.payroll)

    t = await read('/m/contrib', rail)
    expect(t, name, 'app/contributions', x.ledger)
    // Same invariant on the ledger, where getting it wrong tells a member their
    // salary was docked when it never was — in the row title and in the state
    // beside the amount.
    expect(t, name, 'app/contributions', 'Payroll deduction', x.payroll)
    expect(t, name, 'app/contributions', x.payroll ? 'Payroll' : 'Confirmed')

    t = await read('/m/id', rail)
    expect(t, name, 'app/card', x.collectedBy)

    // ── Sponsor console ───────────────────────────────────────────────────────
    t = await read('/console', rail)
    expect(t, name, 'console/dashboard', x.org)
    expect(t, name, 'console/dashboard', x.payroll ? 'August deduction cycle' : 'August collection run')

    t = await read('/console/schedule', rail)
    // Only self-pay says it has no schedule to send.
    expect(t, name, 'console/schedule', 'Self-paying sponsors have no schedule to send', !x.payroll)
    expect(t, name, 'console/schedule', x.code)

    t = await read('/console/reconciliation', rail)
    expect(t, name, 'console/recon', x.payroll ? 'Return file · August 2026' : 'Debit results · August 2026')
    expect(t, name, 'console/recon', 'There is no return file on this rail', !x.payroll)

    t = await read('/console/reconciliation/exceptions/CSP-114-88214', rail)
    expect(
      t, name, 'console/exception',
      x.payroll
        ? '₦2,500 was deducted from someone we cannot identify'
        : "₦2,500 was refused by the member's bank",
    )

    t = await read('/console/direct-debit', rail)
    // On a payroll rail the debit run is only the fallback, and says so.
    expect(t, name, 'console/debit', 'This sponsor collects through payroll', x.payroll)

    // ── Member app · web ──────────────────────────────────────────────────────
    t = await read('/contributions', rail)
    expect(t, name, 'web/contributions', x.railRef)
    expect(t, name, 'web/contributions', x.payroll ? x.collectedBy : 'Direct debit · GTBank ••4471')

    console.log(`  ${name.padEnd(9)} ok`)
  }
} catch (err) {
  failures.push(err.message)
} finally {
  await browser?.close()
  server?.kill('SIGTERM')
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} of ${checks} rail assertions failed:`)
  for (const f of failures) console.error(`  ${f}`)
} else {
  console.log(`\n✓ ${checks} rail assertions passed across four rails and three applications`)
}
process.exit(failures.length ? 1 : 0)
