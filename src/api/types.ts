/**
 * The API's wire types.
 *
 * Hand-written against docs/spec-source.ts rather than generated, because the
 * generator would need the server running and this is the one place where a
 * disagreement between client and server should be a compile error. Money is
 * always minor units (kobo) as a number — never a formatted string, never a
 * float. ₦2,500 is 250000.
 */

export type Rail = 'federal' | 'state' | 'employer' | 'self'
export type Method = 'payroll' | 'direct_debit'

/**
 * Which of these arrives decides what the member is told. `awaiting_file` and
 * `awaiting_bank` are separate on purpose: one means an office has not sent
 * something, the other means a bank has not answered, and only one of them is
 * anyone's fault.
 */
export type CollectionState =
  | 'confirmed'
  | 'awaiting_file'
  | 'awaiting_bank'
  | 'late'
  | 'lapsed'

export interface Session {
  userId: string
  name: string | null
  email: string | null
  role: string
  roleLabel: string
  /** The console greys out what a role cannot do rather than hiding it. */
  permissions: string[]
  memberId: string | null
  sponsorId: string | null
}

export interface Tokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  role: string
  memberId: string | null
  sponsorId: string | null
}

export interface MemberSummary {
  member: { name: string; fullName: string; cspId: string; grade: string | null }
  sponsor: {
    id: string
    type: Rail
    name: string
    shortName: string
    method: Method
    rail: string
    ref: string
  }
  cover: { tier: string; sumAssuredMinor: number; inForceSince: string }
  collection: {
    state: CollectionState
    lastPeriod: string | null
    nextDate: string
    answerDueAt: string
    cardFallbackAt: string
    gracePeriodEndsAt: string
  }
  /** Server-ranked. The client renders at most one and never decides priority. */
  attention: { key: string; severity: 'info' | 'attention' | 'urgent' }[]
}

export interface LedgerRow {
  period: string
  amountMinor: number
  source: 'payroll' | 'direct_debit' | 'card' | 'transfer' | 'reversal'
  status: 'expected' | 'confirmed' | 'failed' | 'reversed'
  railRef: string | null
  receivedAt: string | null
  reversesId: string | null
}

export interface Ledger {
  rows: LedgerRow[]
  totals: { paidMinor: number; monthsCovered: number }
}

export interface Beneficiary {
  id: string
  name: string
  relation: string
  msisdn: string | null
  /** Never the NIN itself — it is L3, and this is what a member needs to know. */
  ninOnFile: boolean
  sharePct: number
}

export interface BeneficiarySet {
  people: Beneficiary[]
  lastConfirmedAt: string | null
}

export interface ProtectionCard {
  cspId: string
  tier: string
  inForceSince: string
  collectedBy: string
  /** A signed offline token, so a hospital gate can verify with no network. */
  qrPayload: string
  expiresAt: string
  printUrl: string
}

export interface ClaimStage {
  key: string
  state: string
  at: string
  actor: string | null
  note: string | null
}

export interface Claim {
  ref: string
  type: string
  state: string
  amountMinor: number | null
  assessor: { name: string; office: string } | null
  /** The audit log itself, not a summary of it. */
  stages: ClaimStage[]
  documents: { key: string; state: string; filename: string | null; uploadedAt: string | null }[]
}

/** A row in the member's own claim list. The detail comes from `Claim`. */
export interface MyClaim {
  ref: string
  type: string
  state: string
  amountMinor: number | null
  openedAt: string
}

export interface SponsorDashboard {
  sponsor: {
    id: string
    name: string
    shortName: string
    tag: string
    type: Rail
    method: Method
    railCode: string
  }
  cycle: {
    id: string
    period: string
    state: string
    railRef: string | null
    scheduledCount: number
    scheduledMinor: number
    sentAt: string | null
    returnedAt: string | null
  } | null
  roster: { members: number; withoutBeneficiary: number }
  exceptions: { total: number; open: number; byKind: Record<string, number> }
}

export interface RosterMember {
  id: string
  cspId: string
  serviceNo: string | null
  name: string
  grade: string | null
  tier: string
  inForceSince: string
  /** The latest contribution's status, or null if this member has never had one. */
  collectionState: 'confirmed' | 'expected' | 'failed' | 'reversed' | null
  lastPeriod: string | null
  hasBeneficiary: boolean
}

export interface Roster {
  members: RosterMember[]
  /** Over the whole sponsor, not the page — a chip counting the page would lie. */
  counts: { all: number; paid: number; notDeducted: number; noBeneficiary: number }
}

export interface ClaimQueueItem {
  ref: string
  type: string
  state: string
  openedAt: string
  memberName: string
  cspId: string
  outstandingDocs: number
}

/**
 * A claim on a sponsor's member, as a sponsor may see it.
 *
 * No amount, no cause, no documents — see ClaimService.SponsorClaim on the
 * server. An employer knowing their late colleague's household received
 * ₦5,000,000 is a disclosure nobody consented to.
 */
export interface SponsorClaim {
  ref: string
  type: string
  state: string
  openedAt: string
  memberName: string
  cspId: string
  /** The insurer is waiting on the employer for something. */
  awaitingSponsor: boolean
}

export interface SponsorClaims {
  claims: SponsorClaim[]
  open: number
  paidThisYear: number
  paidThisYearMinor: number
}

/** One line of a payroll schedule, as it is sent. */
export interface ScheduleRow {
  serviceNo: string
  name: string
  amountMinor: number
}

/**
 * A schedule load in flight, or finished.
 *
 * `staged` is what the file contained; `matched` and `loaded` climb as the job
 * works through it. A row that matches no member is rejected with its line
 * number, which is what an officer needs to fix the file.
 */
export interface ScheduleBatch {
  batchId: string
  state: 'staged' | 'complete' | 'failed'
  stagedCount: number
  matchedCount: number
  loadedCount: number
  startedAt: string | null
  finishedAt: string | null
  failure: string | null
}

export interface ReconciliationException {
  id: string
  memberId: string | null
  memberName: string | null
  cspId: string | null
  ourServiceNo: string | null
  kind: string
  /** Exactly as the file or the bank wrote it. The mismatch is the evidence. */
  nameAsWritten: string | null
  serviceNoAsWritten: string | null
  railResponse: string | null
  expectedMinor: number
  receivedMinor: number
  proposedAction: string | null
  proposedNote: string | null
  proposedAt: string | null
  resolvedAction: string | null
  resolvedNote: string | null
  resolvedAt: string | null
}

export interface Reconciliation {
  method: Method
  matched: number
  exceptions: ReconciliationException[]
  summary: { total: number; open: number; byKind: Record<string, number> }
}
