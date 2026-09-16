/**
 * Keycloak sign-in for the console, as an authorization-code flow with PKCE.
 *
 * Written out rather than pulled from a library because it is about eighty lines
 * and the alternative is a dependency in the auth path of a system holding L3
 * data. There is nothing clever here — the cleverness would be the problem.
 *
 * Public client, so no secret: PKCE is what stops an intercepted code being
 * exchanged by someone else. `state` is checked on return, which is what stops a
 * code being planted by a third party.
 */

const STORAGE_KEY = 'csp.oidc.pending'

export interface OidcConfig {
  issuerUri: string
  clientId: string
  redirectUri: string
}

export function configFromEnv(): OidcConfig | null {
  const issuerUri = (import.meta.env?.VITE_OIDC_ISSUER as string | undefined)?.trim()
  if (!issuerUri) return null
  return {
    issuerUri: issuerUri.replace(/\/$/, ''),
    clientId: (import.meta.env?.VITE_OIDC_CLIENT_ID as string | undefined)?.trim() || 'csp-console',
    redirectUri: `${window.location.origin}/console/signed-in`,
  }
}

/** Send the browser to Keycloak. Does not return. */
export async function beginSignIn(config: OidcConfig): Promise<void> {
  const verifier = randomString(64)
  const state = randomString(24)

  // sessionStorage, not localStorage: this is in flight for seconds and must not
  // outlive the tab. The verifier is the secret half of PKCE.
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ verifier, state }))

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    code_challenge: await sha256Base64Url(verifier),
    code_challenge_method: 'S256',
  })

  window.location.assign(`${config.issuerUri}/protocol/openid-connect/auth?${params}`)
}

export interface OidcResult {
  accessToken: string
  refreshToken?: string
  expiresIn: number
}

/**
 * Handle the redirect back.
 *
 * Returns null when this is not a redirect, so a plain visit to the callback URL
 * does nothing rather than throwing.
 */
export async function completeSignIn(config: OidcConfig): Promise<OidcResult | null> {
  const query = new URLSearchParams(window.location.search)
  const code = query.get('code')
  if (!code) {
    const error = query.get('error')
    if (error) throw new Error(query.get('error_description') ?? error)
    return null
  }

  const pending = sessionStorage.getItem(STORAGE_KEY)
  sessionStorage.removeItem(STORAGE_KEY)
  if (!pending) throw new Error('That sign-in did not start here. Try again.')

  const { verifier, state } = JSON.parse(pending) as { verifier: string; state: string }
  // Without this check, a code planted by a third party would be exchanged as if
  // the officer had asked for it.
  if (query.get('state') !== state) throw new Error('That sign-in could not be verified. Try again.')

  const response = await fetch(`${config.issuerUri}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: verifier,
    }),
  })

  if (!response.ok) {
    throw new Error('Keycloak refused that sign-in. Ask an administrator to check your account.')
  }

  const token = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  // Drop the code from the address bar so a refresh does not try to reuse it —
  // Keycloak only honours a code once, and the second attempt is a confusing
  // failure.
  window.history.replaceState({}, '', config.redirectUri.replace(window.location.origin, ''))

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresIn: token.expires_in,
  }
}

function randomString(bytes: number): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return base64Url(buffer)
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return base64Url(new Uint8Array(digest))
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
