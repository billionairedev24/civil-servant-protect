import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Mono } from '../../components/primitives'
import { useAuth } from '../../api/auth'
import { useApi } from '../../api/provider'
import { beginSignIn, completeSignIn, configFromEnv } from '../../api/oidc'
import { C } from '../../theme/tokens'

/**
 * The console's front door.
 *
 * Keycloak, not a form. The realm holds the eight roles and enforces TOTP, and
 * an officer's account is administered where the rest of their MDA access is —
 * which is also what makes SSO to OAGF later a configuration change rather than
 * a rewrite.
 *
 * Shown only when running live and signed out. On fixtures the console opens
 * straight onto the dashboard, because there is nothing to sign in to.
 */
export function ConsoleSignIn() {
  const { live } = useApi()
  const { adoptConsoleToken } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Memoised: configFromEnv() builds a fresh object every call, and an object
  // in a dependency array is a new dependency every render.
  const config = useMemo(configFromEnv, [])

  /*
   * Handle the redirect back from Keycloak, if this is one.
   *
   * Exactly once. The exchange consumes the PKCE verifier and Keycloak honours
   * an authorization code a single time, so a second run finds neither and
   * reports a failed sign-in to someone who signed in perfectly well. React's
   * StrictMode double-invokes effects in development precisely to surface this.
   */
  const exchanged = useRef(false)
  useEffect(() => {
    if (!config || exchanged.current) return
    exchanged.current = true
    completeSignIn(config)
      .then((result) => {
        if (result) adoptConsoleToken(result.accessToken)
      })
      .catch((e: Error) => setError(e.message))
  }, [config, adoptConsoleToken])

  const start = async () => {
    if (!config) {
      setError('Sign-in is not configured. VITE_OIDC_ISSUER is unset — see SETUP.md.')
      return
    }
    setBusy(true)
    try {
      await beginSignIn(config)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (!live) return null

  return (
    <div
      style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: C.paper, padding: 24,
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 420, background: C.white, borderRadius: 16,
          border: `1px solid ${C.line}`, padding: 32,
        }}
      >
        <div
          style={{
            width: 42, height: 42, borderRadius: 12, background: C.g,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="ph-fill ph-shield-check" size={23} color={C.surface} />
        </div>

        <h1 style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.02em', margin: '20px 0 6px' }}>
          Sponsor console
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: C.mut, margin: 0 }}>
          Sign in with your ministry account. You will be asked for your authenticator code.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 18, padding: '12px 13px',
              border: `1px solid ${C.clayBorder2}`, borderRadius: 10, background: C.clayBg,
            }}
          >
            <Icon name="ph-fill ph-warning-circle" size={17} color={C.clay} />
            <span style={{ fontSize: 13, lineHeight: 1.45, color: C.clayInk }}>{error}</span>
          </div>
        )}

        <button
          type="button"
          className="btn btn-lg btn-primary"
          style={{ width: '100%', marginTop: 22, gap: 9 }}
          disabled={busy}
          onClick={() => void start()}
        >
          <Icon name="ph ph-sign-in" size={18} />
          {busy ? 'Taking you there…' : 'Continue to sign in'}
        </button>

        <div
          style={{
            marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.line}`,
            fontSize: 12.5, lineHeight: 1.6, color: C.faint,
          }}
        >
          Members do not sign in here — the member app uses a phone number and a
          code. This door is for preparers, approvers, viewers and administrators.
          <Mono size={10.5} color={C.faint} style={{ display: 'block', marginTop: 8 }}>
            Sessions end after 20 minutes idle.
          </Mono>
        </div>
      </div>
    </div>
  )
}
