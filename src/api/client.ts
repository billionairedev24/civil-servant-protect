/**
 * The API client.
 *
 * Shared by all three frontends, and by the React Native build when it lands —
 * which is why it depends on nothing but `fetch` and has no React in it. The
 * build spec asks for the phone app and the web app to share an API client;
 * this is that module, and keeping it framework-free is what makes that
 * possible rather than aspirational.
 */
import type {
  BeneficiarySet, Claim, Ledger, MemberSummary, ProtectionCard,
  Reconciliation, Session, SponsorDashboard, Tokens,
} from './types'

/**
 * Thrown for anything the API refused.
 *
 * Carries the server's message, because those messages are part of the
 * product: "a preparer cannot close a cycle — ask an approver" is a next step,
 * "Request failed with status 403" is a dead end.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** The caller's session is gone; the shell should send them to sign in. */
  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /** A rule said no. The request was fine; the answer is still no. */
  get isRefused(): boolean {
    return this.status === 403 || this.status === 409
  }
}

export interface TokenStore {
  read(): { accessToken: string; refreshToken: string } | null
  write(tokens: { accessToken: string; refreshToken: string }): void
  clear(): void
}

/**
 * Keeps tokens in memory, not in localStorage.
 *
 * The console runs on shared office machines and cyber-cafe PCs. A token in
 * localStorage outlives the person who walked away from the desk, and is
 * readable by any script that gets onto the page. Losing the session on refresh
 * is the correct trade here — the spec asks for a 20-minute idle timeout for
 * exactly this reason.
 */
export function memoryTokenStore(): TokenStore {
  let held: { accessToken: string; refreshToken: string } | null = null
  return {
    read: () => held,
    write: (tokens) => {
      held = tokens
    },
    clear: () => {
      held = null
    },
  }
}

export interface ClientOptions {
  baseUrl: string
  tokens?: TokenStore
  /** Called when the session cannot be recovered, so the shell can react once. */
  onSignedOut?: () => void
}

export class CspApi {
  private readonly baseUrl: string
  private readonly tokens: TokenStore
  private readonly onSignedOut?: () => void
  /** One refresh at a time; a burst of 401s must not become a burst of refreshes. */
  private refreshing: Promise<boolean> | null = null

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.tokens = options.tokens ?? memoryTokenStore()
    this.onSignedOut = options.onSignedOut
  }

  // ── Sign in ────────────────────────────────────────────────────────────────

  /** Members and next of kin. Console roles come through Keycloak instead. */
  async requestOtp(msisdn: string): Promise<{ challengeId: string; expiresIn: number; devCode?: string }> {
    return this.call('POST', '/v1/auth/otp', { msisdn }, { anonymous: true })
  }

  async verifyOtp(challengeId: string, code: string): Promise<Tokens> {
    const tokens = await this.call<Tokens>(
      'POST', '/v1/auth/verify', { challengeId, code }, { anonymous: true },
    )
    this.tokens.write(tokens)
    return tokens
  }

  /** For the console, whose tokens are minted by Keycloak rather than by us. */
  adopt(accessToken: string, refreshToken = ''): void {
    this.tokens.write({ accessToken, refreshToken })
  }

  signOut(): void {
    this.tokens.clear()
  }

  session(): Promise<Session> {
    return this.call('GET', '/v1/auth/session')
  }

  // ── Member ─────────────────────────────────────────────────────────────────

  summary(): Promise<MemberSummary> {
    return this.call('GET', '/v1/members/me/summary')
  }

  contributions(params: { from?: string; to?: string; limit?: number } = {}): Promise<Ledger> {
    return this.call('GET', `/v1/members/me/contributions${query(params)}`)
  }

  card(): Promise<ProtectionCard> {
    return this.call('GET', '/v1/members/me/card')
  }

  beneficiaries(): Promise<BeneficiarySet> {
    return this.call('GET', '/v1/members/me/beneficiaries')
  }

  /**
   * Replaces the whole set. PUT rather than PATCH because a half-saved split is
   * the one state this record must never be in — the server rejects anything
   * that does not total 100.
   */
  replaceBeneficiaries(
    people: { name: string; relation: string; msisdn?: string; nin?: string; sharePct: number }[],
  ): Promise<{ ok: boolean; people: number }> {
    return this.call('PUT', '/v1/members/me/beneficiaries', { people })
  }

  confirmBeneficiaries(): Promise<{ confirmedAt: string }> {
    return this.call('POST', '/v1/members/me/beneficiaries/confirm', {})
  }

  claim(ref: string): Promise<Claim> {
    return this.call('GET', `/v1/claims/${encodeURIComponent(ref)}`)
  }

  openClaim(body: {
    type: 'death' | 'accident' | 'disability'
    claimantRelation: string
    answers?: Record<string, unknown>
  }): Promise<{ claimRef: string; requiredDocs: string[]; funeralAdvanceRef: string | null }> {
    return this.call('POST', '/v1/claims', body)
  }

  // ── Sponsor console ────────────────────────────────────────────────────────

  sponsorDashboard(): Promise<SponsorDashboard> {
    return this.call('GET', '/v1/sponsors/me/dashboard')
  }

  reconciliation(sponsorId: string, cycleId: string): Promise<Reconciliation> {
    return this.call('GET', `/v1/sponsors/${sponsorId}/reconciliation/${cycleId}`)
  }

  /** The maker's half. */
  proposeResolution(exceptionId: string, action: string, note: string): Promise<unknown> {
    return this.call('POST', `/v1/reconciliation/exceptions/${exceptionId}/propose`, { action, note })
  }

  /** The checker's half. Refused if you are the one who proposed it. */
  resolveException(exceptionId: string, note: string, matchTo?: string): Promise<unknown> {
    return this.call('POST', `/v1/reconciliation/exceptions/${exceptionId}/resolve`, { note, matchTo })
  }

  closeCycle(sponsorId: string, cycleId: string): Promise<{ closed: boolean; credited: number }> {
    return this.call('POST', `/v1/sponsors/${sponsorId}/cycles/${cycleId}/close`, {})
  }

  roster(sponsorId: string, search?: string): Promise<{ members: unknown[] }> {
    return this.call('GET', `/v1/sponsors/${sponsorId}/members${query({ search })}`)
  }

  // ── plumbing ───────────────────────────────────────────────────────────────

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    options: { anonymous?: boolean; retried?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const held = this.tokens.read()
    if (!options.anonymous && held) {
      headers.Authorization = `Bearer ${held.accessToken}`
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    // An expired access token is recoverable exactly once. Retrying forever
    // against a dead refresh token would turn one stale session into a loop.
    if (response.status === 401 && !options.anonymous && !options.retried && held?.refreshToken) {
      if (await this.refresh()) {
        return this.call<T>(method, path, body, { ...options, retried: true })
      }
    }

    if (response.status === 204) return undefined as T

    const text = await response.text()
    const payload = text ? safeJson(text) : null

    if (!response.ok) {
      if (response.status === 401 && !options.anonymous) {
        this.tokens.clear()
        this.onSignedOut?.()
      }
      throw new ApiError(
        response.status,
        (payload as { error?: string } | null)?.error ?? 'error',
        (payload as { message?: string } | null)?.message ?? `Request failed (${response.status})`,
      )
    }

    return payload as T
  }

  private refresh(): Promise<boolean> {
    // Collapse concurrent refreshes: a screen that fires four requests on load
    // would otherwise spend four refresh tokens and win three races.
    this.refreshing ??= (async () => {
      try {
        const held = this.tokens.read()
        if (!held?.refreshToken) return false
        const response = await fetch(`${this.baseUrl}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: held.refreshToken }),
        })
        if (!response.ok) return false
        this.tokens.write((await response.json()) as Tokens)
        return true
      } catch {
        return false
      } finally {
        this.refreshing = null
      }
    })()
    return this.refreshing
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const rendered = search.toString()
  return rendered ? `?${rendered}` : ''
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // A proxy or a WAF returning HTML on an error page is not JSON, and the
    // client should say that rather than throwing a parse error at the screen.
    return { message: text.slice(0, 200) }
  }
}
