/**
 * The fixtures, in the API's shape.
 *
 * The screens already had this data in `src/data`; this re-expresses the parts a
 * query returns so a fixture and a live response are the same type. That is what
 * lets a screen read one value and not care which it got — and what makes a
 * disagreement between the two a compile error rather than a demo that looks
 * subtly different from production.
 */
import { BENEFICIARIES, MEMBER } from '../data/member'
import type { BeneficiarySet, MemberSummary } from './types'

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
