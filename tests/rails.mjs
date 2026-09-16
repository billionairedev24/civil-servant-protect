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
  const read = async (url, rail, extra = {}) => {
    await page.goto(withParams(base, url, { rail, ...extra }), { waitUntil: 'load', timeout: 60_000 })
    return page.locator('body').innerText()
  }

  /** Assert the rendered text does (or does not) contain a phrase. */
  const expect = (text, rail, where, phrase, present = true) => {
    checks++
    if (text.includes(phrase) !== present) {
      failures.push(`${rail} · ${where}: expected ${present ? 'to see' : 'NOT to see'} “${phrase}”`)
    }
  }

  // ── One member, three applications ────────────────────────────────────────
  // The design bundle gave the phone and the web different CSP-IDs, different
  // beneficiaries and different relationships for the same person, and the
  // console used both of the IDs — including inside a single screen. A demo
  // that shows "the same member on a desk browser" makes that visible, so it
  // is asserted rather than left to a comment.
  const CSP_ID = 'CSP-114-88214'
  const STALE_ID = '4471-2098'
  const identity = [
    ['/m/id', 'app/card'],
    ['/m/more', 'app/profile'],
    ['/card', 'web/card'],
    ['/settings', 'web/profile'],
    ['/console/reconciliation/exceptions/CSP-114-88214', 'console/exception'],
  ]
  for (const [url, where] of identity) {
    const text = await read(url, 'federal')
    expect(text, 'identity', where, CSP_ID)
    expect(text, 'identity', where, STALE_ID, false)
  }

  // The payee line is derived from the shares, so it names the two people who
  // hold one — not the third who is named but unshared, and not a fourth who
  // exists on one surface only.
  for (const [url, where] of [['/m/home', 'app/home'], ['/dashboard', 'web/dashboard']]) {
    const text = await read(url, 'federal')
    expect(text, 'identity', where, 'Chinedu and Ngozi Okafor')
    expect(text, 'identity', where, 'Amaka', false)
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
    // The grace timeline and the sentence above it describe a retry the app
    // controls on self-pay and a file it only waits for on payroll.
    expect(t, name, 'app/pay', 'payroll file', x.payroll)
    expect(t, name, 'app/pay', x.payroll ? 'file due' : 'debit sent')

    t = await read('/m/contrib', rail)
    expect(t, name, 'app/contributions', x.ledger)
    // Same invariant on the ledger, where getting it wrong tells a member their
    // salary was docked when it never was — in the row title and in the state
    // beside the amount.
    expect(t, name, 'app/contributions', 'Payroll deduction', x.payroll)
    expect(t, name, 'app/contributions', x.payroll ? 'Payroll' : 'Confirmed')
    // …and in the prose, which is where it is easiest to miss. A self-paying
    // member has no payroll office and no remittance file, so no sentence on
    // this screen may mention one.
    expect(t, name, 'app/contributions', 'payroll file', x.payroll)
    expect(t, name, 'app/contributions', 'payroll office', x.payroll)
    expect(t, name, 'app/contributions', 'Waiting for the file', x.payroll)
    expect(t, name, 'app/contributions', x.payroll ? 'NOT YET IN THE FILE' : 'NOT YET CLEARED')
    expect(t, name, 'app/contributions', x.payroll ? 'remittance file' : 'your bank confirms the debit')

    t = await read('/m/id', rail)
    expect(t, name, 'app/card', x.collectedBy)

    // ── Sponsor console ───────────────────────────────────────────────────────
    t = await read('/console', rail)
    expect(t, name, 'console/dashboard', x.org)
    // September, because the console's open cycle is now the same month the
    // member app is in. The two fixtures disagreed — the console described
    // August while the member's ledger ran to September — and wiring both to
    // one shape is what surfaced it.
    expect(t, name, 'console/dashboard', x.payroll ? 'September deduction cycle' : 'September collection run')

    t = await read('/console/schedule', rail)
    // Only self-pay says it has no schedule to send.
    expect(t, name, 'console/schedule', 'Self-paying sponsors have no schedule to send', !x.payroll)
    expect(t, name, 'console/schedule', x.code)

    t = await read('/console/reconciliation', rail)
    expect(t, name, 'console/recon', x.payroll ? 'Return file · SEP 2026' : 'Debit results · SEP 2026')
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
    expect(t, name, 'web/contributions', 'payroll file', x.payroll)

    // The late-payment banner names what actually failed. On self-pay that is
    // the bank debit, not a deduction an HR office never made.
    t = await read('/m/home', rail, { demo: 'late' })
    expect(t, name, 'app/home late', x.payroll ? 'August deduction has not arrived' : 'August direct debit did not go through')

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
