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
  AddedDependant, AuditEntry, BenefitSchedule, BeneficiarySet, BulkEnrolment, Claim, ClaimQueueItem,
  ClaimUpload, ConsoleUser, DebitRun, Dependant, Enrolled, Leaver, Ledger, MemberSummary, MyClaim,
  NewMember,
  Paid,
  ProtectionCard,
  Reconciliation, RemovedDependant, Remittance, RollFile, Roster, ScheduleBatch, ScheduleRow, Session,
  SponsorClaims, SponsorDashboard, Tokens,
} from './types'
import { UserFacingError } from './problems'

/**
 * Thrown for anything the API refused.
 *
 * Carries the server's message, because those messages are part of the
 * product: "a preparer cannot close a cycle — ask an approver" is a next step,
 * "Request failed with status 403" is a dead end.
 */
export class ApiError extends UserFacingError {
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

/**
 * One document, on its way to storage.
 *
 * A shape rather than `File`, because the two surfaces have different things in
 * hand: a browser has a `File` from an input, and a handset has a `file://` URI
 * from the camera that has to be read into a blob first. The three fields the
 * server is told about — name, type and size — are the same either way, and
 * `body` is whatever that platform can actually PUT.
 */
export interface UploadFile {
  name: string
  type: string
  size: number
  body: BodyInit
}

/** A browser's `File` already is one of these; this says so without a cast. */
export function webFile(file: File): UploadFile {
  return { name: file.name, type: file.type, size: file.size, body: file }
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

/** Where the device-bound refresh token is written. */
const DEVICE_KEY = 'csp.device'

/**
 * Keeps the refresh token on the device and the access token in memory.
 *
 * This is the browser stand-in for what the native app does with the Android
 * Keystore. The spec gives the member a *device-bound* refresh token for a
 * reason: someone checking whether last month's deduction landed should not be
 * sent back to an SMS code because they pulled down to refresh. On a phone,
 * losing the session that way is a bug, not a safeguard.
 *
 * The access token stays in memory. It is the one attached to every request and
 * it lives twenty minutes; writing it down buys nothing. The refresh token is in
 * sessionStorage rather than localStorage so it dies with the tab — a handset
 * passed around a family does not carry one person's session into the next
 * person's browsing.
 */
export function deviceTokenStore(): TokenStore {
  let access = ''
  const readRefresh = () => {
    try {
      return sessionStorage.getItem(DEVICE_KEY) ?? ''
    } catch {
      // Private mode, or storage disabled by policy. Degrade to memory-only:
      // the session still works, it just does not survive a reload.
      return ''
    }
  }
  return {
    read: () => {
      const refreshToken = readRefresh()
      if (!access && !refreshToken) return null
      return { accessToken: access, refreshToken }
    },
    write: (tokens) => {
      access = tokens.accessToken
      try {
        sessionStorage.setItem(DEVICE_KEY, tokens.refreshToken)
      } catch {
        /* see read() */
      }
    },
    clear: () => {
      access = ''
      try {
        sessionStorage.removeItem(DEVICE_KEY)
      } catch {
        /* see read() */
      }
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

  /**
   * The other door: somebody claiming on a member who has died.
   *
   * Two facts together — the member's CSP-ID, and a number already named on that
   * member's record. The server answers the same whether or not they go
   * together, so nothing here can be used to ask whether a person is enrolled.
   */
  async requestKinOtp(
    cspId: string,
    msisdn: string,
  ): Promise<{ challengeId: string; expiresIn: number; devCode?: string }> {
    return this.call('POST', '/v1/auth/kin/otp', { cspId, msisdn }, { anonymous: true })
  }

  async verifyKinOtp(challengeId: string, code: string): Promise<Tokens> {
    const tokens = await this.call<Tokens>(
      'POST', '/v1/auth/kin/verify', { challengeId, code }, { anonymous: true },
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

  /**
   * Whether anything is held that could still be redeemed.
   *
   * True after a reload on the phone, where the access token is gone but the
   * device-bound refresh token is not — the shell should show the app and let
   * the first request refresh, rather than the sign-in screen.
   */
  hasSession(): boolean {
    const held = this.tokens.read()
    return Boolean(held?.accessToken || held?.refreshToken)
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

  /**
   * The benefit schedule.
   *
   * <p>Public: it is a price list. Every screen that shows what a tier pays out
   * reads it from here, because a figure a client holds is a figure that is
   * wrong the day the wording changes — and this one is what a family is told
   * they are owed.
   */
  schedule(): Promise<BenefitSchedule> {
    return this.call('GET', '/v1/products/schedule', undefined, { anonymous: true })
  }

  /** Who is on the member's family cover, including anyone taken off. */
  dependants(): Promise<{ dependants: Dependant[] }> {
    return this.call('GET', '/v1/members/me/dependants')
  }

  /**
   * Add somebody. The premium comes back from the server, quoted for their age
   * band — nothing here multiplies anything.
   */
  addDependant(body: { name: string; relation: string; dob: string }): Promise<AddedDependant> {
    return this.call('POST', '/v1/members/me/dependants', body)
  }

  /** Take somebody off. Their row stays; the premium stops next month. */
  removeDependant(dependantId: string): Promise<RemovedDependant> {
    return this.call('DELETE', `/v1/members/me/dependants/${dependantId}`)
  }

  /**
   * The member's own claims.
   *
   * Separate from the assessor's `GET /v1/claims`, which is a different role
   * reading every member's. Without this the app has no way to find a claim a
   * member opened on another device, or last month.
   */
  myClaims(): Promise<{ claims: MyClaim[] }> {
    return this.call('GET', '/v1/members/me/claims')
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

  /**
   * Attach one document to a claim: ask, send, confirm.
   *
   * <p>Three steps rather than a multipart POST, because the middle one does not
   * come here — the file goes straight to object storage on the URL the server
   * hands back. A ten-megabyte scan of a death certificate through the API is a
   * request thread spent copying bytes.
   *
   * The headers matter. Against a bucket they are part of the presigned
   * signature, so the browser must send exactly those and nothing else; a
   * helpfully-added header is a 403 nobody can explain.
   */
  async uploadClaimDocument(
    ref: string,
    docKey: string,
    file: UploadFile,
    onProgress?: (fraction: number) => void,
  ): Promise<{ docKey: string; outstanding: number }> {
    const where: ClaimUpload = await this.call(
      'POST',
      `/v1/claims/${encodeURIComponent(ref)}/documents/upload`,
      { docKey, filename: file.name, contentType: file.type, byteSize: file.size },
    )

    onProgress?.(0)
    const sent = await fetch(where.url, {
      method: where.method,
      headers: where.headers,
      body: file.body,
    })
    if (!sent.ok) {
      /*
       * Deliberately not the storage service's own error body. S3 answers in
       * XML with a code like SignatureDoesNotMatch, which is true, unhelpful,
       * and not something to put in front of somebody who has just lost a
       * relative.
       */
      throw new ApiError(
        sent.status,
        'upload_failed',
        'That file did not reach us. Check your connection and try again.',
      )
    }
    onProgress?.(1)

    // The server checks the store before it believes this.
    return this.call('POST', `/v1/claims/${encodeURIComponent(ref)}/documents`, { docKey })
  }

  /**
   * A document back — the assessor's copy, and the claimant's own.
   *
   * Fetched with the session's token rather than linked to. A URL that opens a
   * death certificate without one works for whoever ends up holding it, and
   * these are exactly the reads that belong in an audit trail.
   */
  async claimDocument(ref: string, docKey: string): Promise<{ blob: Blob; filename: string }> {
    const { blob, headers } = await this.call<{ blob: Blob; headers: Headers }>(
      'GET',
      `/v1/claims/${encodeURIComponent(ref)}/documents/${encodeURIComponent(docKey)}/file`,
      undefined,
      { binary: true },
    )
    const named = /filename="([^"]+)"/.exec(headers.get('content-disposition') ?? '')
    return { blob, filename: named?.[1] ?? `${docKey}.pdf` }
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

  /**
   * Hand over a month's schedule.
   *
   * <p>Answers 202 with a batch to watch, not a finished result — the rows are
   * written down before it returns and the load runs behind it. See
   * ScheduleLoader on the server.
   */
  uploadSchedule(
    sponsorId: string,
    body: { period: string; filename: string; rows: ScheduleRow[] },
  ): Promise<{ cycleId: string; batchId: string; rowCount: number }> {
    return this.call('POST', `/v1/sponsors/${sponsorId}/schedules`, body)
  }

  scheduleBatch(sponsorId: string, batchId: string): Promise<ScheduleBatch> {
    return this.call('GET', `/v1/sponsors/${sponsorId}/schedules/${batchId}`)
  }

  /**
   * Put one person on the scheme.
   *
   * <p>The NIN goes up and never comes back: the server stores a hash to match
   * on and a ciphertext to re-send with, and no response carries it. Nothing on
   * this client should keep it either — it lives in the form state for as long
   * as the officer is typing and goes when the screen is done with it.
   */
  enrol(sponsorId: string, body: NewMember): Promise<Enrolled> {
    return this.call('POST', `/v1/sponsors/${sponsorId}/members`, body)
  }

  /** The same thing for a list, which answers with what it could not do. */
  enrolAll(sponsorId: string, members: NewMember[]): Promise<BulkEnrolment> {
    return this.call('POST', `/v1/sponsors/${sponsorId}/members/batch`, { members })
  }

  /**
   * Take somebody off the schedule.
   *
   * <p>A POST to `.../leave` rather than a DELETE of the member, because nothing
   * is deleted: the deduction stops and the cover continues to the grace date in
   * the answer. The verb is the argument.
   */
  leave(
    sponsorId: string,
    memberId: string,
    body: { reason: Leaver['reason']; lastDay: string },
  ): Promise<Leaver> {
    return this.call('POST', `/v1/sponsors/${sponsorId}/members/${memberId}/leave`, body)
  }

  /** Who has left, whose grace runs out soonest last. */
  leavers(sponsorId: string): Promise<{ leavers: Leaver[] }> {
    return this.call('GET', `/v1/sponsors/${sponsorId}/leavers`)
  }

  roster(sponsorId: string, search?: string, limit = 50): Promise<Roster> {
    return this.call('GET', `/v1/sponsors/${sponsorId}/members${query({ search, limit })}`)
  }

  /** Whether a load left a signed roll file, and what it is. */
  rollFile(sponsorId: string, batchId: string): Promise<RollFile> {
    return this.call('GET', `/v1/sponsors/${sponsorId}/schedules/${batchId}/roll-file`)
  }

  /**
   * The roll file itself, or its detached signature.
   *
   * Both come through this service rather than as a link to the bucket — the
   * file lists every name and service number on a payroll, and a presigned URL
   * works for whoever ends up holding it.
   */
  async rollFileDownload(
    sponsorId: string,
    batchId: string,
    part: 'download' | 'signature',
  ): Promise<{ blob: Blob; filename: string }> {
    const { blob, headers } = await this.call<{ blob: Blob; headers: Headers }>(
      'GET',
      `/v1/sponsors/${sponsorId}/schedules/${batchId}/roll-file/${part}`,
      undefined,
      { binary: true },
    )
    const named = /filename="([^"]+)"/.exec(headers.get('content-disposition') ?? '')
    return {
      blob,
      filename: named?.[1] ?? `${batchId}.txt${part === 'signature' ? '.asc' : ''}`,
    }
  }

  /** The assessor's queue — every member's claims, not one sponsor's. */
  claimQueue(): Promise<{ claims: ClaimQueueItem[] }> {
    return this.call('GET', '/v1/claims')
  }

  /**
   * The assessor's decision.
   *
   * `amountMinor` is theirs to set on an approval and is ignored otherwise. The
   * note is required by the server and is kept on the claim trail — a decline
   * with no reason on the record is the thing an ombudsman asks about.
   */
  assessClaim(
    ref: string,
    body: { decision: 'approve' | 'decline' | 'request_more'; note: string; amountMinor?: number },
  ): Promise<{ ref: string; state: string }> {
    return this.call('POST', `/v1/claims/${encodeURIComponent(ref)}/assess`, body)
  }

  /**
   * Send an approved claim's money. A different permission, held by a different
   * person — the server refuses the assessor who approved it, and so does the
   * database.
   */
  payClaim(ref: string, body: { bankCode: string; accountNumber: string }): Promise<Paid> {
    return this.call('POST', `/v1/claims/${encodeURIComponent(ref)}/pay`, body)
  }

  /**
   * An export, as a file the browser can save.
   *
   * <p>Not a link the screen can point at: every request carries a bearer token,
   * and a URL that works without one is an export anybody can fetch. So it is a
   * normal authenticated call whose body happens to be CSV, and the caller turns
   * it into a download.
   */
  async report(
    sponsorId: string,
    kind: string,
    period?: string,
  ): Promise<{ filename: string; csv: string }> {
    const { text, headers } = await this.call<{ text: string; headers: Headers }>(
      'GET',
      `/v1/sponsors/${sponsorId}/reports/${kind}${query({ period })}`,
      undefined,
      { raw: true },
    )
    // The server names the file. A folder of report.csv, report(1).csv,
    // report(2).csv is how the wrong month reaches an auditor.
    const named = /filename="([^"]+)"/.exec(headers.get('content-disposition') ?? '')
    return { filename: named?.[1] ?? `${kind}.csv`, csv: text }
  }

  /** The money, month by month. Derived from the ledger, not a stored summary. */
  remittances(sponsorId: string): Promise<{ remittances: Remittance[] }> {
    return this.call('GET', `/v1/sponsors/${sponsorId}/remittances`)
  }

  /** Who can act for this sponsor, and what each role may do. Admin only. */
  consoleUsers(sponsorId: string): Promise<{ users: ConsoleUser[] }> {
    return this.call('GET', `/v1/sponsors/${sponsorId}/users`)
  }

  /** The sponsor's own audit trail. */
  auditTrail(sponsorId: string): Promise<{ entries: AuditEntry[] }> {
    return this.call('GET', `/v1/sponsors/${sponsorId}/audit`)
  }

  /** What the bank said this month — and who is on grace with nothing set up. */
  debitRun(sponsorId: string): Promise<DebitRun> {
    return this.call('GET', `/v1/sponsors/${sponsorId}/collection/direct-debit`)
  }

  /** Claims on one sponsor's members, thinned to what an employer may see. */
  sponsorClaims(sponsorId: string): Promise<SponsorClaims> {
    return this.call('GET', `/v1/sponsors/${sponsorId}/claims`)
  }

  // ── plumbing ───────────────────────────────────────────────────────────────

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    options: { anonymous?: boolean; retried?: boolean; raw?: boolean; binary?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const held = this.tokens.read()

    // A cold start on the phone carries the device-bound refresh token but no
    // access token — the access token was only ever in memory. Redeeming it up
    // front is one round trip; discovering the same thing from a 401 is two.
    if (!options.anonymous && !options.retried && held && !held.accessToken && held.refreshToken) {
      if (!(await this.refresh())) {
        this.tokens.clear()
        this.onSignedOut?.()
        throw new ApiError(401, 'unauthenticated', 'Your session has ended. Sign in again.')
      }
      return this.call<T>(method, path, body, { ...options, retried: true })
    }

    if (!options.anonymous && held?.accessToken) {
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

    /*
     * A body that is not text at all — a scanned certificate.
     *
     * Read before `text()` gets to it: decoding a PDF or a JPEG as UTF-8 and
     * re-encoding it produces a file that opens as garbage, and the failure
     * looks like a storage problem rather than a client one.
     */
    if (response.ok && options.binary) {
      return { blob: await response.blob(), headers: response.headers } as T
    }

    const text = await response.text()
    const payload = text ? safeJson(text) : null

    /*
     * A response that is not JSON — an export, today.
     *
     * Through the same method rather than its own fetch, because everything
     * above this line is the part worth sharing: the bearer token, the one
     * recoverable 401, the single in-flight refresh. A second fetch elsewhere
     * would be a second place for a session to go stale differently.
     */
    if (response.ok && options.raw) {
      return { text, headers: response.headers } as T
    }

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
