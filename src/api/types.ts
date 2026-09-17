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
  /** `premiumMinor` is the member's own monthly price, quoted by the server. */
  cover: { tier: string; sumAssuredMinor: number; premiumMinor: number; inForceSince: string }
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

/**
 * Somebody on a member's family cover.
 *
 * `active: false` is somebody who was taken off. The row stays, because it is
 * what says this person was covered from March to September — a claim in that
 * window is assessed against it.
 */
export interface Dependant {
  id: string
  name: string
  relation: string
  dob: string
  sumAssuredMinor: number
  premiumMinor: number
  active: boolean
}

/**
 * What adding one costs, quoted by the server.
 *
 * The band and both figures come back from the API and are never computed here.
 * A price the client works out is a price an out-of-date app gets wrong and an
 * edited request gets cheaply.
 */
export interface AddedDependant {
  band: 'child' | 'adult' | 'senior'
  sumAssuredMinor: number
  premiumMinor: number
  /** The whole family premium after this one, so no screen adds prices up. */
  newPremiumMinor: number
  effectiveFrom: string
}

export interface RemovedDependant {
  name: string
  newPremiumMinor: number
  /** Cover runs to here: the month has been paid for. */
  coveredUntil: string
  effectiveFrom: string
}

/**
 * The benefit schedule: what each tier is sold as, and for how much.
 *
 * Keyed rather than positional, so a locale can order the rows its own way and
 * a benefit added later does not shift every figure on the screen by one.
 * `valueMinor` is null for a benefit a tier does not include — which is not the
 * same as zero, and reads as "—" rather than "₦0".
 */
export interface BenefitSchedule {
  /** The policy wording these figures belong to. It changes when they do. */
  wordingVersion: string
  effectiveFrom: string
  tiers: {
    code: Tier
    name: string
    priceMinor: number
    benefits: { key: string; valueMinor: number | null; text: string | null }[]
  }[]
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

/**
 * Somebody who can act on a sponsor's behalf in the console.
 *
 * `permissions` is the same list `can()` checks, so the screen that hands out
 * authority shows exactly what it is handing out rather than a role name and a
 * guess about what it means.
 */
export interface ConsoleUser {
  id: string
  name: string
  email: string | null
  role: string
  roleLabel: string
  permissions: string[]
  lastSeenAt: string | null
  disabled: boolean
}

/** One line of a sponsor's own audit trail. Showing your working is the point. */
export interface AuditEntry {
  at: string
  action: string
  subjectType: string | null
  subjectId: string | null
  actorName: string | null
  actorRole: string | null
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
  /*
   * Null for almost everybody, and set together when they are not. The second
   * is the date that matters: cover continues to it whatever happens, so it is
   * what an officer chases a direct debit against.
   */
  leftOn?: string | null
  graceUntil?: string | null
}

/**
 * Somebody who has come off the schedule.
 *
 * Not somebody who has been deleted — the deduction stops, the cover does not.
 * `outcome` is the sentence the server composes for this reason and this date,
 * kept there rather than here so the console and the SMS cannot disagree about
 * what a member was told.
 */
export interface Leaver {
  memberId: string
  cspId: string
  name: string
  serviceNo: string | null
  reason: 'retired' | 'transferred' | 'resigned' | 'dismissed'
  leftOn: string
  graceUntil: string
  outcome: string
}

/**
 * The direct-debit run for the month being collected.
 *
 * Counted from the ledger rather than reported by the rail: a presentment is a
 * contribution row, a settlement is that row confirmed, a failure is an
 * exception raised against the cycle. A screen fed by NIBSS's own summary would
 * agree with NIBSS and disagree with the ledger — and the ledger is what pays a
 * claim.
 */
export interface DebitRun {
  period: string
  method: Method
  counts: { presented: number; settled: number; awaiting: number; failed: number }
  failures: {
    kind: string
    count: number
    /** Nobody can retry a revoked mandate into working. The member has to act. */
    memberMustAct: boolean
  }[]
  /** presented → retried → cardFallback → graceEnds, in that order. */
  timeline: Record<string, string>
  /** Leavers whose cover is on grace and who have not paid this month. */
  grace: { cspId: string; name: string; graceUntil: string; daysLeft: number }[]
}

export interface Roster {
  members: RosterMember[]
  /** Over the whole sponsor, not the page — a chip counting the page would lie. */
  counts: { all: number; paid: number; notDeducted: number; noBeneficiary: number }
}

/**
 * One month's money.
 *
 * A credit arriving is not cover. On a payroll rail a single transfer covers
 * thousands of members and only becomes cover once it is matched to the return
 * file, member by member — so `receivedMinor` is what was credited to members,
 * not what a bank statement said. `varianceMinor` is negative when less arrived
 * than was asked for, which is the direction that costs somebody their cover.
 */
export interface Remittance {
  cycleId: string
  period: string
  state: string
  railRef: string | null
  valueDate: string | null
  scheduledMinor: number
  receivedMinor: number
  scheduledCount: number
  creditedCount: number
  varianceMinor: number
  openExceptions: number
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

/** The four cover tiers, as the API spells them. */
export type Tier = 'basic' | 'standard' | 'enhanced' | 'executive'

/**
 * Somebody a sponsor is putting on the scheme.
 *
 * The sponsor already holds all of this — it is a staff record, not a form the
 * member fills in. There is no self-service version: membership follows payroll,
 * and a public enrolment endpoint would only be a way to attach a phone number
 * you control to a civil servant whose details you have read.
 */
export interface NewMember {
  nin: string
  fullName: string
  /** ISO, because that is what the API takes. The screen shows day-first. */
  dateOfBirth: string
  /** +234 and ten digits. The invitation goes here, and so does every sign-in. */
  msisdn: string
  serviceNo?: string
  grade?: string
  tier: Tier
  beneficiaries?: { name: string; relation: string; msisdn?: string; sharePct: number }[]
}

export interface Enrolled {
  memberId: string
  cspId: string
  tier: Tier
  priceMinor: number
  inForceSince: string
  collectionRail: string
  beneficiariesNamed: boolean
}

/**
 * What a list of new starters did.
 *
 * Both halves matter. `enrolled` is the good news, and `rejected` carries the
 * spreadsheet line number and the reason — a file of two hundred with three bad
 * NINs enrols a hundred and ninety-seven people and names the three.
 */
export interface BulkEnrolment {
  submitted: number
  enrolled: number
  members: Enrolled[]
  rejected: { row: number; name: string; reason: string }[]
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
