import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useState } from 'react'
import { ApiError, CspApi, deviceTokenStore, memoryTokenStore, type TokenStore } from './client'
import { configuredApiUrl } from './env'

/**
 * Where the data comes from.
 *
 * The apps have always read fixtures and they still can. Pointing them at the
 * API is configuration rather than a rewrite: set `VITE_API_URL` and the screens
 * read live data; leave it unset and the demo runs exactly as before, on a
 * laptop with nothing installed.
 *
 * That matters beyond convenience — the fixtures are how the design gets
 * reviewed and how the rail-branching tests run, and neither should need
 * Postgres.
 */
const API_URL = configuredApiUrl()

export const LIVE = API_URL !== ''

/**
 * Where this surface keeps its tokens.
 *
 * The console and the member app hold sessions of different value to an
 * attacker and are used in different rooms, so they should not store them the
 * same way. A finance officer's token unlocks a whole payroll's roster on a
 * shared secretariat PC — that one lives in memory and dies with the tab, and
 * the spec's twenty-minute idle timeout says the same thing. A member's token
 * unlocks their own record on their own handset, and the spec gives them a
 * device-bound refresh token so they are not re-sent an SMS code for scrolling.
 *
 * In production these are separate deployments on separate hosts; they share a
 * bundle only here, so the path is what tells them apart. It is read once, at
 * load, because a session should not change how it is stored halfway through.
 */
function tokenStoreForSurface() {
  // Optional all the way down: React Native has a `window` global with no
  // `location` on it, and this module is shared with the phone app.
  const onConsole =
    typeof window !== 'undefined' && (window.location?.pathname ?? '').startsWith('/console')
  return onConsole ? memoryTokenStore() : deviceTokenStore()
}

interface ApiContext {
  /** Null when running on fixtures. */
  api: CspApi | null
  live: boolean
  /**
   * Bumped each time the client gives up on a session.
   *
   * A counter rather than a flag: someone signs in again after an expiry, and a
   * latch that never resets would leave the shell unable to notice the *next*
   * one.
   */
  expiries: number
}

const Ctx = createContext<ApiContext>({ api: null, live: false, expiries: 0 })

/**
 * Query defaults, chosen for what this product actually is.
 *
 * A member opens the app to find out whether their deduction arrived, and an
 * officer leaves the console open all day while a return file is being worked.
 * Both want fresh numbers without a spinner, which is what stale-while-
 * revalidate gives them.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Money should not look stale for long, but re-fetching on every render
        // of a screen someone is scrolling is waste. Thirty seconds is about
        // the length of a glance.
        staleTime: 30_000,
        // Kept well past staleness so going back to a screen paints instantly
        // from cache and then updates.
        gcTime: 5 * 60_000,

        /*
         * Retry transport failures, never refusals.
         *
         * A 403 from the maker-checker rule is a decision, not a blip: retrying
         * it three times does nothing except make the officer wait and write
         * three lines into the audit log's neighbourhood. Same for a 409 — the
         * cycle really does have open exceptions.
         */
        retry: (failureCount, error) => {
          if (error instanceof ApiError) {
            if (error.isUnauthorized || error.isRefused || error.status === 404) return false
            if (error.status >= 400 && error.status < 500) return false
          }
          return failureCount < 2
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),

        // An officer who tabs back to the console after a phone call should see
        // the current exception count, not the one from before the call.
        refetchOnWindowFocus: true,
        // A member on a Tecno in a village reconnects constantly. Re-fetching
        // on every flap is their data allowance.
        refetchOnReconnect: 'always',
      },
      mutations: {
        // Never automatic. Retrying "close the cycle" or "resolve this
        // exception" would be retrying a decision someone is accountable for.
        retry: false,
      },
    },
  })
}

/**
 * @param baseUrl where the API is, when the host is not a Vite build. React
 *     Native has no `import.meta.env`, and a phone cannot reach `localhost`
 *     anyway — it needs the machine's address on the wifi.
 * @param tokens where that host keeps a session. The browser has two answers
 *     already (see {@link tokenStoreForSurface}); the phone's is MMKV, which is
 *     a native module this bundle must not import.
 */
export function ApiProvider({
  children,
  baseUrl,
  tokens,
}: {
  children: React.ReactNode
  baseUrl?: string
  tokens?: TokenStore
}) {
  const [expiries, setExpiries] = useState(0)
  const [queryClient] = useState(makeQueryClient)

  const url = baseUrl?.trim() || API_URL
  const live = url !== ''

  const api = useMemo(() => {
    if (!live) return null
    return new CspApi({
      baseUrl: url,
      tokens: tokens ?? tokenStoreForSurface(),
      onSignedOut: () => {
        setExpiries((n) => n + 1)
        // Nothing cached survives a sign-out. On a shared office machine the
        // next person must not see the last one's roster from cache.
        queryClient.clear()
      },
    })
  }, [queryClient, live, url, tokens])

  const value = useMemo(() => ({ api, live, expiries }), [api, live, expiries])

  return (
    <Ctx.Provider value={value}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Ctx.Provider>
  )
}

export function useApi(): ApiContext {
  return useContext(Ctx)
}
