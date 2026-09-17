import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ApiError } from './client'
import { useApi } from './provider'
import { keys } from './queries'
import type { Session } from './types'

/**
 * Signing in.
 *
 * Two mechanisms, because there are two kinds of person. A member has a phone
 * number and nothing else, so they get an SMS code. A finance officer has an MDA
 * account with TOTP, so they get Keycloak. Forcing either through the other's
 * mechanism makes it worse for them — see SecurityConfig on the server, which
 * splits the same way.
 *
 * On fixtures (`VITE_API_URL` unset) none of this runs: `signedIn` is true, the
 * screens render their fixtures, and the demo needs no backend. That is what
 * keeps the design reviewable and the rail tests runnable without Postgres.
 */

interface AuthState {
  /** Fixtures count as signed in — there is nothing to sign in to. */
  signedIn: boolean
  session: Session | null
  loading: boolean
  /** Set after a wrong code or an expired challenge; cleared on the next try. */
  error: string | null
}

interface AuthActions {
  /** Step one: ask for a code. Returns the challenge to hold on to. */
  requestCode: (msisdn: string) => Promise<{ challengeId: string; devCode?: string }>
  /** The same, for a relative claiming on a member who has died. */
  requestKinCode: (cspId: string, msisdn: string) => Promise<{ challengeId: string; devCode?: string }>
  submitKinCode: (challengeId: string, code: string) => Promise<boolean>
  /** Step two. Resolves true when the code was right. */
  submitCode: (challengeId: string, code: string) => Promise<boolean>
  /** Console: hand over the token Keycloak issued. */
  adoptConsoleToken: (accessToken: string) => void
  signOut: () => void
  clearError: () => void
  /**
   * Whether this role may do something.
   *
   * Names a capability, never a role — `can('EXCEPTION_RESOLVE')`, not
   * `role === 'approver'`. The server's @PreAuthorize rules are written the same
   * way against the same strings, so the two cannot drift into a console that
   * offers a button the API then refuses.
   *
   * On fixtures everything is permitted: the demo has no session to ask, and a
   * design review should see every screen in its working state.
   */
  can: (permission: string) => boolean
}

const Ctx = createContext<(AuthState & AuthActions) | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { api, live, expiries } = useApi()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  // Seeded from the client rather than false, so a member who reloaded lands
  // back in the app on their device-bound refresh token instead of at the
  // phone-number screen. On the console the store is memory, so this is false
  // after a reload and the officer signs in again — which is the intent.
  const [hasToken, setHasToken] = useState(() => api?.hasSession() ?? false)

  // The client clears its own tokens when a refresh fails. Without this the
  // shell would keep rendering an app whose every request 401s.
  useEffect(() => {
    if (expiries > 0) setHasToken(false)
  }, [expiries])

  /**
   * Who the caller is, according to the server.
   *
   * Only asked once there is a token — otherwise it is a guaranteed 401 on every
   * cold load, which fills the console with noise and teaches people to ignore
   * it.
   */
  const { data: session, isLoading } = useQuery({
    queryKey: keys.session(),
    queryFn: () => api!.session(),
    enabled: live && hasToken,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const requestCode = useCallback(
    async (msisdn: string) => {
      setError(null)
      if (!api) return { challengeId: 'fixture' }
      try {
        const challenge = await api.requestOtp(msisdn)
        return { challengeId: challenge.challengeId, devCode: challenge.devCode }
      } catch (e) {
        setError(messageFor(e))
        throw e
      }
    },
    [api],
  )

  const submitCode = useCallback(
    async (challengeId: string, code: string) => {
      setError(null)
      if (!api) return true
      try {
        await api.verifyOtp(challengeId, code)
        setHasToken(true)
        // The session query is enabled by hasToken, so it runs on the next
        // render; everything else waits for a token that now exists.
        await queryClient.invalidateQueries()
        return true
      } catch (e) {
        setError(messageFor(e))
        return false
      }
    },
    [api, queryClient],
  )

  /**
   * The same two steps for a relative, against the other pair of endpoints.
   *
   * Written out rather than folded into the member flow with a flag, because
   * they authenticate different people against different facts and end in
   * sessions that see different things. A branch inside one function is how the
   * wrong session gets issued.
   */
  const requestKinCode = useCallback(
    async (cspId: string, msisdn: string) => {
      setError(null)
      if (!api) return { challengeId: 'fixture' }
      try {
        const challenge = await api.requestKinOtp(cspId, msisdn)
        return { challengeId: challenge.challengeId, devCode: challenge.devCode }
      } catch (e) {
        setError(messageFor(e))
        throw e
      }
    },
    [api],
  )

  const submitKinCode = useCallback(
    async (challengeId: string, code: string) => {
      setError(null)
      if (!api) return true
      try {
        await api.verifyKinOtp(challengeId, code)
        setHasToken(true)
        await queryClient.invalidateQueries()
        return true
      } catch (e) {
        setError(messageFor(e))
        return false
      }
    },
    [api, queryClient],
  )

  const adoptConsoleToken = useCallback(
    (accessToken: string) => {
      api?.adopt(accessToken)
      setHasToken(true)
      void queryClient.invalidateQueries()
    },
    [api, queryClient],
  )

  const signOut = useCallback(() => {
    api?.signOut()
    setHasToken(false)
    // Nothing cached survives. On a shared office machine the next person must
    // not see the last one's roster.
    queryClient.clear()
  }, [api, queryClient])

  const can = useCallback(
    (permission: string) => !live || (session?.permissions.includes(permission) ?? false),
    [live, session],
  )

  const value = useMemo<AuthState & AuthActions>(
    () => ({
      signedIn: !live || hasToken,
      session: session ?? null,
      loading: live && hasToken && isLoading,
      error,
      requestCode,
      submitCode,
      requestKinCode,
      submitKinCode,
      adoptConsoleToken,
      signOut,
      clearError: () => setError(null),
      can,
    }),
    [
      live, hasToken, session, isLoading, error, requestCode, submitCode,
      requestKinCode, submitKinCode, adoptConsoleToken, signOut, can,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState & AuthActions {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/**
 * The server's message, not a generic one.
 *
 * "Wrong code. 2 attempt(s) left" tells someone what to do next; "Request failed"
 * tells them to give up. The server writes these deliberately — see ApiException.
 */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message.includes('fetch')) {
    return 'We could not reach the service. Check your connection and try again.'
  }
  return 'Something went wrong. Try again.'
}
