/**
 * Shared plumbing for the browser tests: start a preview server, open Chromium,
 * and know every route the three applications answer on.
 *
 * The routes are the test surface now. Screens used to be reachable only by
 * clicking through an index rail; each one is an address, so a test visits it
 * the same way a member or an officer would — by going there.
 */
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

// 127.0.0.1 rather than localhost, for binding and for browsing. On some CI
// runners `localhost` resolves to ::1 first, so a server bound to one stack and
// a client probing the other never meet.
export const HOST = '127.0.0.1'

/** Member app — mobile. Mirrors PhoneScreen in src/surfaces/phone/nav.ts. */
export const PHONE_ROUTES = [
  'splash', 'auth', 'phone', 'otp', 'biometric', 'sponsor', 'verify', 'enrol', 'enroldone',
  'onboard', 'home', 'pay', 'contrib', 'id', 'benefits', 'benes', 'family', 'more',
  'beneconf', 'whychanged', 'accident', 'claim', 'track', 'hr', 'bene',
].map((id) => ({ id, url: `/m/${id}` }))

/** Member app — web. Mirrors URLS in src/surfaces/web/nav.ts. */
export const WEB_ROUTES = [
  { id: 'signin', url: '/sign-in' },
  { id: 'enrol', url: '/enrol/cover' },
  { id: 'home', url: '/dashboard' },
  { id: 'benefits', url: '/cover' },
  { id: 'card', url: '/card' },
  { id: 'family', url: '/family' },
  { id: 'contrib', url: '/contributions' },
  { id: 'benes', url: '/beneficiaries' },
  { id: 'claim', url: '/claims/new' },
  { id: 'track', url: '/claims/CLM-2026-0091' },
  { id: 'profile', url: '/settings' },
  { id: 'beneportal', url: '/next-of-kin' },
]

/** Sponsor console. Mirrors CONSOLE_URLS in src/surfaces/console/nav.ts. */
export const CONSOLE_ROUTES = [
  { id: 'dash', url: '/console' },
  { id: 'upload', url: '/console/schedule' },
  { id: 'recon', url: '/console/reconciliation' },
  { id: 'exception', url: '/console/reconciliation/exceptions/CSP-114-88214' },
  { id: 'debit', url: '/console/direct-debit' },
  { id: 'remit', url: '/console/remittances' },
  { id: 'roster', url: '/console/members' },
  { id: 'members', url: '/console/members/add' },
  { id: 'claims', url: '/console/claims' },
  { id: 'settings', url: '/console/settings' },
  { id: 'reports', url: '/console/reports' },
]

export const LANGS = ['en', 'ha', 'yo', 'ig', 'pcm']
export const RAIL_IDS = ['federal', 'state', 'employer', 'self']

/**
 * Readiness is a raw TCP connect rather than a fetch: an HTTP proxy in the
 * environment can swallow requests to localhost, and we only need to know the
 * listener is up.
 */
function portOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: HOST, port })
    const done = (ok) => {
      socket.destroy()
      resolve(ok)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(1000, () => done(false))
  })
}

/**
 * Serve `dist` and wait for it. --strictPort so a busy port fails loudly rather
 * than vite quietly moving to the next one and leaving us driving a stale build
 * on the wrong address.
 */
export async function startPreview(port, timeoutMs = 60_000) {
  const server = spawn(
    'npx',
    ['vite', 'preview', '--host', HOST, '--port', String(port), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )

  // Keep the server's own output so a startup failure can explain itself rather
  // than being reported as a bare timeout.
  let output = ''
  server.stdout?.on('data', (d) => (output += d))
  server.stderr?.on('data', (d) => (output += d))
  server.on('error', (e) => (output += `spawn failed: ${e.message}\n`))

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portOpen(port)) {
      return { server, base: `http://${HOST}:${port}` }
    }
    if (server.exitCode !== null) break
    await sleep(250)
  }

  server.kill('SIGTERM')
  throw new Error(
    `preview server did not start on http://${HOST}:${port}\n` +
      `  exit code: ${server.exitCode ?? 'still running'}\n` +
      `  output: ${output.trim() || '(none)'}\n` +
      '  Has `npm run build` been run, or is the port already taken?',
  )
}

export function launchBrowser() {
  // In sandboxes the bundled browser lives outside node_modules.
  return chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
}

/** Build a URL with the demo's query string: rail, language, scenario flags. */
export function withParams(base, url, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v))
  return `${base}${url}${q.toString() ? `?${q}` : ''}`
}
