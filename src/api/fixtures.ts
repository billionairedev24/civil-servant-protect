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
  BeneficiarySet, Claim, ClaimQueueItem, DebitRun, Dependant, Leaver, Ledger, LedgerRow,
  MemberSummary, MyClaim, ProtectionCard, Reconciliation, Roster, SponsorClaims, SponsorDashboard,
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
    premiumMinor: 2_500 * NAIRA,
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
 * The family cover, in the API's shape.
 *
 * The same two people the screens have always shown, priced by the bands the
 * server quotes — ₦1,200 for an adult, ₦600 for a child — plus one who was
 * taken off, because a row that stays after somebody is removed is the part of
 * this model worth seeing in the demo.
 */
export const DEPENDANTS: { dependants: Dependant[] } = {
  dependants: [
    {
      id: 'fx-dep-1', name: 'Chinedu Okafor', relation: 'Spouse', dob: '1988-03-12',
      sumAssuredMinor: 2_000_000 * NAIRA, premiumMinor: 1_200 * NAIRA, active: true,
    },
    {
      id: 'fx-dep-2', name: 'Ngozi Okafor', relation: 'Daughter', dob: '2016-09-04',
      sumAssuredMinor: 500_000 * NAIRA, premiumMinor: 600 * NAIRA, active: true,
    },
    {
      id: 'fx-dep-3', name: 'Emeka Okafor', relation: 'Son', dob: '2004-01-22',
      sumAssuredMinor: 2_000_000 * NAIRA, premiumMinor: 1_200 * NAIRA, active: false,
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

/**
 * The member roster, in the API's shape.
 *
 * Re-expressed from ROSTER in the console's data module, keeping the states
 * that make the screen worth looking at: somebody not in the file, somebody
 * underpaid, somebody with nobody named. A roster where everyone is fine is a
 * roster nobody needs to open.
 */
export const ROSTER_FIXTURE: Roster = {
  members: [
    {
      id: 'fx-1', cspId: MEMBER.cspId, serviceNo: MEMBER.serviceNo, name: 'Adaeze Nkiru Okafor',
      grade: 'GL 12', tier: 'standard', inForceSince: '2025-08-01',
      collectionState: 'confirmed', lastPeriod: '2026-09-01', hasBeneficiary: true,
    },
    {
      id: 'fx-2', cspId: 'CSP-114-88215', serviceNo: '8812441', name: 'Musa Ibrahim',
      grade: 'GL 09', tier: 'basic', inForceSince: '2025-09-01',
      collectionState: 'expected', lastPeriod: '2026-09-01', hasBeneficiary: true,
    },
    {
      id: 'fx-3', cspId: 'CSP-114-88216', serviceNo: '7741228', name: 'Folake Adeyemi',
      grade: 'GL 14', tier: 'enhanced', inForceSince: '2025-08-01',
      collectionState: 'failed', lastPeriod: '2026-09-01', hasBeneficiary: true,
    },
    {
      id: 'fx-4', cspId: 'CSP-114-88217', serviceNo: '3391774', name: 'Grace Attah',
      grade: 'GL 08', tier: 'basic', inForceSince: '2026-01-01',
      collectionState: 'expected', lastPeriod: '2026-08-01', hasBeneficiary: false,
    },
    {
      id: 'fx-5', cspId: 'CSP-114-88218', serviceNo: '2204991', name: 'Halima Yusuf',
      grade: 'GL 16', tier: 'executive', inForceSince: '2025-11-01',
      collectionState: 'confirmed', lastPeriod: '2026-09-01', hasBeneficiary: false,
    },
    {
      id: 'fx-6', cspId: 'CSP-114-88219', serviceNo: '6628331', name: 'Tunde Bakare',
      grade: 'GL 12', tier: 'standard', inForceSince: '2025-08-01',
      collectionState: 'confirmed', lastPeriod: '2026-09-01', hasBeneficiary: true,
    },
  ],
  counts: { all: 8_440, paid: 8_196, notDeducted: 244, noBeneficiary: 203 },
}

/** The assessor's queue. Four claims, which is what the console's badge says. */
export const CLAIM_QUEUE: { claims: ClaimQueueItem[] } = {
  claims: [
    {
      ref: CLAIM.openRef, type: 'death', state: 'assessing', openedAt: '2026-08-28T10:12:00Z',
      memberName: 'Adaeze Okafor', cspId: MEMBER.cspId, outstandingDocs: 1,
    },
    {
      ref: 'CLM-2026-0088', type: 'accident', state: 'documents_pending',
      openedAt: '2026-09-02T08:30:00Z', memberName: 'Musa Ibrahim', cspId: 'CSP-114-88215',
      outstandingDocs: 2,
    },
    {
      ref: 'CLM-2026-0089', type: 'death', state: 'approved', openedAt: '2026-08-19T15:02:00Z',
      memberName: 'Grace Attah', cspId: 'CSP-114-88217', outstandingDocs: 0,
    },
    {
      ref: 'CLM-2026-0090', type: 'disability', state: 'assessing',
      openedAt: '2026-09-08T11:45:00Z', memberName: 'Tunde Bakare', cspId: 'CSP-114-88219',
      outstandingDocs: 0,
    },
  ],
}

/** Claims on the federal sponsor's members, as that sponsor sees them. */
/**
 * Three people who have come off the schedule.
 *
 * The same three the console has always shown, now in the shape the API
 * answers with — and with the outcome sentence the server composes rather than
 * one written here, so the demo cannot say something the product would not.
 */
export const LEAVERS_FIXTURE: { leavers: Leaver[] } = {
  leavers: [
    {
      memberId: 'fx-lv-1', cspId: 'CSP-114-88220', name: 'Chinedu Eze', serviceNo: '5510-8842',
      reason: 'retired', leftOn: '2026-08-31', graceUntil: '2026-10-30',
      outcome:
        'Cover continues to 2026-10-30. A retiree keeps their CSP-ID, their start date and their '
        + 'price — set up a direct debit before then and nothing else changes.',
    },
    {
      memberId: 'fx-lv-2', cspId: 'CSP-114-88221', name: 'Blessing Umoh', serviceNo: '9930-2214',
      reason: 'transferred', leftOn: '2026-08-15', graceUntil: '2026-10-14',
      outcome:
        'Cover continues to 2026-10-14. If the new MDA runs the scheme they go onto its schedule; '
        + 'otherwise a direct debit. Either way they keep their CSP-ID and their start date.',
    },
    {
      memberId: 'fx-lv-3', cspId: 'CSP-114-88222', name: 'Sadiq Aliyu', serviceNo: '1182-6640',
      reason: 'dismissed', leftOn: '2026-07-31', graceUntil: '2026-09-29',
      outcome:
        'Cover continues to 2026-09-29. After that it lapses unless they set up a direct debit '
        + 'themselves. Contributions already made are not refunded and not lost — the cover they '
        + 'bought was in force for those months.',
    },
  ],
}

/**
 * A debit run mid-month: most settled the same day, a handful did not.
 *
 * The failure mix is the point of the screen. Insufficient funds mostly clears
 * on the retry after salaries land; a revoked mandate never does, because only
 * the member can tell their bank to allow it again.
 */
export const DEBIT_RUN: DebitRun = {
  period: '2026-09-01',
  method: 'direct_debit',
  counts: { presented: 1240, settled: 1189, awaiting: 0, failed: 51 },
  failures: [
    { kind: 'no_funds', count: 41, memberMustAct: false },
    { kind: 'mandate_revoked', count: 7, memberMustAct: true },
    { kind: 'card_expired', count: 3, memberMustAct: true },
  ],
  timeline: {
    presented: '2026-09-28',
    retried: '2026-10-05',
    cardFallback: '2026-10-12',
    graceEnds: '2026-11-27',
  },
  grace: [
    { cspId: 'CSP-114-88220', name: 'Chinedu Eze', graceUntil: '2026-10-30', daysLeft: 44 },
    { cspId: 'CSP-114-88221', name: 'Blessing Umoh', graceUntil: '2026-10-14', daysLeft: 28 },
  ],
}

export const SPONSOR_CLAIMS: SponsorClaims = {
  claims: [
    {
      ref: CLAIM.openRef, type: 'death', state: 'documents_pending',
      openedAt: '2026-08-28T10:12:00Z', memberName: 'Adaeze Nkiru Okafor', cspId: MEMBER.cspId,
      awaitingSponsor: true,
    },
    {
      ref: 'CLM-2026-0079', type: 'accident', state: 'assessing',
      openedAt: '2026-08-14T09:20:00Z', memberName: 'Musa Ibrahim', cspId: 'CSP-114-88215',
      awaitingSponsor: false,
    },
    {
      ref: 'CLM-2026-0071', type: 'death', state: 'approved', openedAt: '2026-07-02T11:00:00Z',
      memberName: 'Chinedu Eze', cspId: 'CSP-114-88220', awaitingSponsor: false,
    },
    {
      ref: 'CLM-2026-0066', type: 'disability', state: 'assessing',
      openedAt: '2026-06-18T14:30:00Z', memberName: 'Grace Attah', cspId: 'CSP-114-88217',
      awaitingSponsor: false,
    },
  ],
  open: 4,
  paidThisYear: 11,
  paidThisYearMinor: 18_400_000 * NAIRA,
}
