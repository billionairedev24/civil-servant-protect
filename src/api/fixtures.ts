/**
 * The fixtures, in the API's shape.
 *
 * The screens already had this data in `src/data`; this re-expresses the parts a
 * query returns so a fixture and a live response are the same type. That is what
 * lets a screen read one value and not care which it got — and what makes a
 * disagreement between the two a compile error rather than a demo that looks
 * subtly different from production.
 */
import { BENEFICIARIES, CLAIM, CONTRIB_MONTHS, MEMBER } from '../data/member'
import type {
  BeneficiarySet, Claim, Ledger, LedgerRow, MemberSummary, MyClaim, ProtectionCard,
  Reconciliation, SponsorDashboard,
} from './types'

const NAIRA = 100

export const MEMBER_SUMMARY: MemberSummary = {
  member: {
    name: MEMBER.name,
    fullName: MEMBER.fullName,
    cspId: MEMBER.cspId,
    grade: MEMBER.grade,
  },
  sponsor: {
    id: 'fixture-federal',
    type: 'federal',
    name: MEMBER.ministry,
    shortName: 'IPPIS',
    method: 'payroll',
    rail: 'IPPIS deduction code CSP-114 · OAGF approved',
    ref: 'CSP-114',
  },
  cover: {
    tier: 'standard',
    sumAssuredMinor: 5_000_000 * NAIRA,
    inForceSince: '2025-07-16',
  },
  collection: {
    state: 'awaiting_file',
    lastPeriod: '2026-09-01',
    nextDate: '2026-09-28',
    answerDueAt: '2026-09-27T00:00:00Z',
    cardFallbackAt: '2026-10-04T00:00:00Z',
    gracePeriodEndsAt: '2026-11-26T00:00:00Z',
  },
  attention: [{ key: 'confirm_beneficiaries', severity: 'attention' }],
}

export const BENEFICIARY_SET: BeneficiarySet = {
  people: BENEFICIARIES.map((b, i) => ({
    id: `fixture-${i}`,
    name: b.name,
    relation: ['Spouse', 'Daughter', 'Son'][b.relIndex] ?? 'Family',
    msisdn: b.phone === '—' ? null : b.phone,
    ninOnFile: b.relIndex === 0,
    sharePct: b.share,
  })),
  // Fourteen months ago, so the annual nudge is true in the demo.
  lastConfirmedAt: '2025-07-16T00:00:00Z',
}

/**
 * The contribution ledger.
 *
 * Built from `CONTRIB_MONTHS` rather than written out, so the bar chart, the
 * total and the rows cannot drift apart — they are the same fifteen months seen
 * three ways. Fourteen paid months at ₦2,500 is the ₦35,000 the screen has
 * always shown.
 */
export const LEDGER_FIXTURE: Ledger = (() => {
  const rows: LedgerRow[] = CONTRIB_MONTHS.map((state, i) => {
    // The window ends at the current month and runs back through July 2025.
    const month = new Date(Date.UTC(2025, 6 + i, 1))
    const period = month.toISOString().slice(0, 10)
    const confirmed = state !== 'waiting'
    return {
      period,
      amountMinor: confirmed ? 2_500 * NAIRA : 0,
      // A `card` month is one the payroll file missed and the fallback
      // recovered. Saying "payroll" for it would hide the very thing the
      // member is being shown.
      source: state === 'card' ? 'card' : 'payroll',
      status: confirmed ? 'confirmed' : 'expected',
      railRef: confirmed ? MEMBER_SUMMARY.sponsor.ref : null,
      receivedAt: confirmed ? `${period}T09:00:00Z` : null,
      reversesId: null,
    }
  })
  const paid = rows.filter((r) => r.status === 'confirmed')
  return {
    // Newest first, the way the screen reads them.
    rows: rows.slice().reverse(),
    totals: {
      paidMinor: paid.reduce((sum, r) => sum + r.amountMinor, 0),
      monthsCovered: paid.length,
    },
  }
})()

export const PROTECTION_CARD: ProtectionCard = {
  cspId: MEMBER.cspId,
  tier: 'standard',
  inForceSince: MEMBER_SUMMARY.cover.inForceSince,
  collectedBy: MEMBER.ministry,
  // Stands in for the signed offline token. A hospital gate verifies this
  // without a network, which is the whole point of the card.
  qrPayload: `CSP1|${MEMBER.cspId}|standard|fixture`,
  expiresAt: '2026-12-14T00:00:00Z',
  printUrl: '#',
}

/**
 * An open claim, mid-assessment.
 *
 * The stage list is the audit log itself rather than a summary of it, so the
 * fixture carries the same five stages the tracking screen has always drawn —
 * three done, one in progress, one not started.
 */
export const CLAIM_FIXTURE: Claim = {
  ref: CLAIM.openRef,
  type: 'death',
  state: 'assessing',
  amountMinor: 5_000_000 * NAIRA,
  assessor: { name: 'A. Bello', office: 'Claims, Lagos' },
  stages: [
    { key: 'reported', state: 'done', at: '2026-08-28T10:12:00Z', actor: 'Chinedu Okafor', note: null },
    { key: 'documents_received', state: 'done', at: '2026-09-01T14:40:00Z', actor: 'CSP Operations', note: null },
    { key: 'assessing', state: 'now', at: '2026-09-04T09:05:00Z', actor: 'A. Bello', note: null },
    { key: 'decision', state: 'todo', at: '', actor: null, note: null },
    { key: 'paid', state: 'todo', at: '', actor: null, note: null },
  ],
  documents: [
    { key: 'death_certificate', state: 'received', filename: 'certificate.pdf', uploadedAt: '2026-09-01T14:40:00Z' },
    { key: 'id_of_claimant', state: 'received', filename: 'nin-slip.jpg', uploadedAt: '2026-09-01T14:41:00Z' },
    { key: 'proof_of_relationship', state: 'received', filename: 'marriage.pdf', uploadedAt: '2026-09-01T14:42:00Z' },
    { key: 'bank_details', state: 'awaited', filename: null, uploadedAt: null },
  ],
}

/** The list the tracking screen reads before it can ask for any detail. */
export const MY_CLAIMS: { claims: MyClaim[] } = {
  claims: [
    {
      ref: CLAIM_FIXTURE.ref,
      type: CLAIM_FIXTURE.type,
      state: CLAIM_FIXTURE.state,
      amountMinor: CLAIM_FIXTURE.amountMinor,
      openedAt: '2026-08-28T10:12:00Z',
    },
  ],
}

/**
 * The console's dashboard, in the API's shape.
 *
 * Matches the federal rail's figures in `src/surfaces/console/data.ts` — 8,412
 * on the September schedule at ₦21,030,000 — so switching a console between
 * fixtures and the API changes where the numbers come from and not what they
 * say.
 */
export const SPONSOR_DASHBOARD: SponsorDashboard = {
  sponsor: {
    id: 'fixture-federal',
    name: MEMBER.ministry,
    shortName: 'IPPIS',
    tag: 'FEDERAL',
    type: 'federal',
    method: 'payroll',
    railCode: 'CSP-114',
  },
  cycle: {
    id: 'fixture-cycle',
    period: '2026-09-01',
    state: 'reconciling',
    railRef: 'CSP-114/09',
    scheduledCount: 8_412,
    scheduledMinor: 21_030_000 * NAIRA,
    sentAt: '2026-08-21T09:00:00Z',
    returnedAt: '2026-09-14T09:00:00Z',
  },
  roster: { members: 8_440, withoutBeneficiary: 203 },
  exceptions: {
    total: 57,
    open: 57,
    byKind: { unmatched: 31, no_deduction: 12, wrong_amount: 5, left_service: 9 },
  },
}

/**
 * The reconciliation queue.
 *
 * Re-expressed from RECON_PAYROLL. The mismatch *is* the evidence, so a row
 * carries both what we hold and what the file said — `ADAEZE N OKAFOR` against
 * service number 4471209 when ours reads 4471208 is the whole story of the
 * console's central screen.
 */
export const RECONCILIATION: Reconciliation = {
  method: 'payroll',
  matched: 8_324,
  summary: {
    total: 57,
    open: 57,
    byKind: { unmatched: 31, no_deduction: 12, wrong_amount: 5, left_service: 9 },
  },
  exceptions: [
    {
      id: 'fixture-ex-1', memberId: null, memberName: null, cspId: null,
      ourServiceNo: MEMBER.serviceNo, kind: 'unmatched',
      nameAsWritten: 'ADAEZE N OKAFOR', serviceNoAsWritten: '4471209',
      railResponse: null, expectedMinor: 2_500 * NAIRA, receivedMinor: 2_500 * NAIRA,
      proposedAction: null, proposedNote: null, proposedAt: null,
      resolvedAction: null, resolvedNote: null, resolvedAt: null,
    },
    {
      id: 'fixture-ex-2', memberId: 'fixture-m2', memberName: 'Musa Ibrahim',
      cspId: 'CSP-8812-4409', ourServiceNo: '8812441', kind: 'no_deduction',
      nameAsWritten: null, serviceNoAsWritten: null,
      railResponse: 'Card fallback attempted 08.09',
      expectedMinor: 1_500 * NAIRA, receivedMinor: 0,
      proposedAction: null, proposedNote: null, proposedAt: null,
      resolvedAction: null, resolvedNote: null, resolvedAt: null,
    },
    {
      id: 'fixture-ex-3', memberId: 'fixture-m3', memberName: 'Folake Adeyemi',
      cspId: 'CSP-7741-2280', ourServiceNo: '7741228', kind: 'wrong_amount',
      nameAsWritten: null, serviceNoAsWritten: null, railResponse: null,
      expectedMinor: 2_500 * NAIRA, receivedMinor: 1_500 * NAIRA,
      proposedAction: null, proposedNote: null, proposedAt: null,
      resolvedAction: null, resolvedNote: null, resolvedAt: null,
    },
  ],
}
