/**
 * Layout, at the widths these applications are actually opened at.
 *
 *   npm run test:layout
 *
 * Two failures, and they are opposite halves of the same mistake — a width
 * written as a number rather than as a rule.
 *
 *   · **Overflow.** Something wider than the window, so the page scrolls
 *     sideways and part of it is simply off the screen. Two pills in a row that
 *     cannot wrap did this on a 390px handset, pushing "Upload birth
 *     certificates" 68px past the edge, and a five-column table did it by being
 *     clipped instead.
 *   · **Waste.** The member web app was capped at 830px, so on a 2,000px
 *     secretariat monitor the content sat in a third of the window with the
 *     rest empty. Nothing errored; it just looked like a phone app somebody had
 *     stretched a background behind.
 *
 * Both gate. A page that scrolls sideways on a handset is broken for the device
 * most members have, and a page that uses a third of a monitor is broken for
 * the officer who was given the monitor.
 */
import {
  CONSOLE_ROUTES, WEB_ROUTES, launchBrowser, startPreview,
} from './harness.mjs'

const PORT = Number(process.env.LAYOUT_PORT ?? 4191)

/** The devices these are opened on: a cheap handset, a tablet, two monitors. */
const WIDTHS = [390, 768, 1024, 1440, 2000]

/**
 * How much of the available width the content has to use, at 1440 and wider.
 *
 * Not 100%: a page has margins, and a card grid with three tracks leaves the
 * fourth column's worth empty when there are only three cards. Two thirds is
 * the line between "laid out" and "ignored the window".
 */
const MUST_USE = 0.66

/*
 * Screens that are narrow on purpose, and must stay that way.
 *
 * A sign-in form is one field and one button; stretched across a monitor it
 * reads as a mistake and the eye has to travel the whole screen to get from the
 * label to the box. These are excluded from the waste check and still checked
 * for overflow.
 */
const DELIBERATELY_NARROW = new Set(['/sign-in', '/enrol/cover', '/next-of-kin'])

const MEASURE = () => {
  const doc = document.documentElement
  const main = document.querySelector('main') ?? document.body
  const box = main.getBoundingClientRect()

  /*
   * How wide the content actually is: both edges of anything in the main
   * column, ignoring what sits inside a scroller of its own. A table that
   * scrolls sideways within its card is doing the right thing, and measuring
   * its full width would read as waste and overflow when it is neither.
   *
   * Both edges rather than the right one alone, because a column capped narrow
   * and then centred has space on each side — and measuring only the right edge
   * reads that as "most of the width is in use", which is precisely the layout
   * this test exists to catch.
   */
  let widest = box.left
  let leftmost = box.right
  const inScroller = (el) => {
    // Stops at `main` rather than at the body. The column itself usually
    // scrolls vertically, and `overflow-y: auto` with a visible overflow-x
    // computes overflow-x to `auto` — so a walk that does not stop here calls
    // every element on the page "inside a scroller" and measures nothing.
    for (let n = el.parentElement; n && n !== main; n = n.parentElement) {
      const style = getComputedStyle(n)
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') return true
    }
    return false
  }
  for (const el of main.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (inScroller(el)) continue
    if (r.right > widest) widest = r.right
    if (r.left < leftmost) leftmost = r.left
  }

  return {
    overflow: Math.round(doc.scrollWidth - doc.clientWidth),
    available: Math.round(box.width),
    used: Math.round(Math.max(0, widest - leftmost)),
  }
}

const { server, base } = await startPreview(PORT)
const browser = await launchBrowser()
const failures = []
let checked = 0

try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    const rows = []

    for (const route of [...WEB_ROUTES, ...CONSOLE_ROUTES]) {
      await page.goto(base + route.url)
      await page.waitForTimeout(250)
      const m = await page.evaluate(MEASURE)
      checked++

      if (m.overflow > 0) {
        failures.push(`${route.url} at ${width}px scrolls sideways by ${m.overflow}px`)
      }
      const share = m.available === 0 ? 1 : m.used / m.available
      if (width >= 1440 && !DELIBERATELY_NARROW.has(route.url) && share < MUST_USE) {
        failures.push(
          `${route.url} at ${width}px uses ${Math.round(share * 100)}% of its ${m.available}px column`,
        )
      }
      rows.push({ url: route.url, share })
    }

    const worst = rows.reduce((a, b) => (a.share < b.share ? a : b))
    console.log(
      `  ${String(width).padStart(4)}px  ${rows.length} routes · least used: ` +
        `${worst.url} at ${Math.round(worst.share * 100)}%`,
    )
    await page.close()
  }
} finally {
  await browser.close()
  server.kill('SIGTERM')
}

console.log()
if (failures.length > 0) {
  console.log(`✗ ${failures.length} layout problem(s):`)
  for (const f of failures) console.log(`  ${f}`)
  process.exit(1)
}
console.log(`✓ ${checked} route-widths: nothing scrolls sideways, nothing wastes the window`)
process.exit(0)
