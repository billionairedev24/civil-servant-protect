import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Mono } from '../../components/primitives'
import { useAuth } from '../../api/auth'
import { friendly } from '../../api/problems'
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
  const nav = useNavigate()
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
        if (!result) return
        adoptConsoleToken(result.accessToken)
        // Off the callback URL. Leaving an officer on /console/signed-in means
        // a reload sends them back through a sign-in they already completed,
        // and the address bar names a step rather than a place.
        nav('/console', { replace: true })
      })
      .catch((e: unknown) =>
        setError(friendly(e, 'We could not complete your sign-in. Please try again.')))
  }, [config, adoptConsoleToken, nav])

  const start = async () => {
    if (!config) {
      /*
       * A deployment mistake, not something this officer did.
       *
       * This used to read "VITE_OIDC_ISSUER is unset — see SETUP.md", which
       * names a build variable and a file in a repository, tells somebody in a
       * secretariat nothing they can act on, and describes our deployment to
       * whoever is standing behind them. The detail belongs in the console log,
       * where the person who can fix it will look.
       */
      // eslint-disable-next-line no-console
      console.error('[csp] console sign-in is unconfigured: VITE_OIDC_ISSUER is unset')
      setError('Sign-in is unavailable at the moment. Please tell your scheme administrator.')
      return
    }
    setBusy(true)
    try {
      await beginSignIn(config)
    } catch (e) {
      setError(friendly(e, 'We could not start your sign-in. Please try again.'))
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
          {/* Orientation, not job titles. "Preparers, approvers, viewers and
              administrators" is how this system names permissions internally;
              somebody arriving at the wrong door needs to know it is the wrong
              door and where the right one is. */}
          This is for staff who run the scheme for an employer. If you are covered by
          the scheme yourself, sign in at the member app with your phone number.
          <Mono size={10.5} color={C.faint} style={{ display: 'block', marginTop: 8 }}>
            Sessions end after 20 minutes idle.
          </Mono>
        </div>
      </div>
    </div>
  )
}
