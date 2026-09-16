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
