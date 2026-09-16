/**
 * Accessibility audit against the minimums the implementation spec calls
 * non-negotiable: 4.5:1 text contrast, 44px hit targets, an accessible name on
 * every control.
 *
 *   npm run a11y
 *
 * Reports rather than gates. Most of what it finds is inherited from the design
 * — the mockups use #8A928C for secondary text, which the spec's own rule
 * ("do not tint text below #5C6560 on white") forbids — and silently
 * re-tinting every screen is a design decision, not a build one. See README,
 * "Known gaps". Exit code is non-zero only for unnamed controls, which are
 * unambiguously a bug.
 */
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const HOST = '127.0.0.1'
const PORT = Number(process.env.A11Y_PORT ?? 4188)
const BASE = `http://${HOST}:${PORT}/`
const SURFACES = ['Phone', 'Web', 'Console', 'Spec']

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

/** Runs in the page. Composites alpha down the ancestor chain so a translucent
    pill over a dark header is measured against the dark header, not the pill. */
const AUDIT = () => {
  const channels = (s) => (s.match(/[\d.]+/g) || []).map(Number)
  const relLum = ([r, g, b]) => {
    const f = [r, g, b].map((v) => {
      const x = v / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]
  }
  const over = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a))

  // Walk up compositing every translucent layer until something opaque is hit.
  const effectiveBg = (el) => {
    const layers = []
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const [r, g, b, a = 1] = channels(getComputedStyle(n).backgroundColor)
      if (a > 0) {
        layers.push([[r, g, b], a])
        if (a >= 1) break
      }
    }
    let base = [255, 255, 255]
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i][0], base, layers[i][1])
    return base
  }

  const ratio = (a, b) => {
    const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  const unnamed = []
  const smallTargets = []
  const contrast = new Map()

  for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const name = (el.getAttribute('aria-label') || el.innerText || el.value || '').trim()
    if (!name) unnamed.push(el.outerHTML.slice(0, 120).replace(/\s+/g, ' '))
    // 24px is the WCAG 2.2 AA floor; the spec asks for 44. Report both.
    if (r.height < 44 || r.width < 24) {
      smallTargets.push({ name: name.slice(0, 36) || '(icon only)', h: Math.round(r.height), w: Math.round(r.width) })
    }
  }

  for (const el of document.querySelectorAll('*')) {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!hasText) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue

    const size = parseFloat(cs.fontSize)
    const [fr, fg2, fb, fa = 1] = channels(cs.color)
    const bg = effectiveBg(el)
    const fg = fa < 1 ? over([fr, fg2, fb], bg, fa) : [fr, fg2, fb]
    const cr = ratio(fg, bg)
    const bold = Number(cs.fontWeight) >= 700
    const needed = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5
    if (cr >= needed) continue

    const key = `${cs.color} on rgb(${bg.map(Math.round).join(',')}) @ ${size}px`
    const entry = contrast.get(key) ?? {
      count: 0,
      ratio: cr.toFixed(2),
      needed,
      sample: el.innerText.trim().slice(0, 44),
    }
    entry.count++
    contrast.set(key, entry)
  }

  return {
    unnamed,
    smallTargets,
    contrast: [...contrast.entries()]
      .map(([style, v]) => ({ style, ...v }))
      .sort((a, b) => b.count - a.count),
  }
}

let browser
let unnamedTotal = 0

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

  for (const surface of SURFACES) {
    await page.getByRole('button', { name: surface, exact: true }).click()
    await page.waitForTimeout(300)
    const r = await page.evaluate(AUDIT)
    unnamedTotal += r.unnamed.length

    console.log(`\n── ${surface} ${'─'.repeat(52 - surface.length)}`)

    console.log(`controls with no accessible name: ${r.unnamed.length}`)
    r.unnamed.slice(0, 5).forEach((h) => console.log(`    ${h}`))

    const under44 = r.smallTargets.filter((t) => t.h < 44).length
    const under24 = r.smallTargets.filter((t) => t.h < 24 || t.w < 24).length
    console.log(`hit targets below 44px: ${under44}  (below the 24px WCAG floor: ${under24})`)

    console.log(`text styles below their contrast threshold: ${r.contrast.length}`)
    for (const c of r.contrast.slice(0, 6)) {
      console.log(`    ${c.ratio} / ${c.needed}  ×${String(c.count).padStart(2)}  ${c.style}  "${c.sample}"`)
    }
  }

  console.log(
    unnamedTotal
      ? `\n✗ ${unnamedTotal} control(s) with no accessible name — that is a bug, not a design choice.`
      : '\n✓ every control has an accessible name.',
  )
  console.log('Contrast and hit-target findings are inherited from the design — see README, "Known gaps".')
} catch (err) {
  console.error(`\n✗ ${err.message}`)
  unnamedTotal = 1
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}

process.exit(unnamedTotal ? 1 : 0)
