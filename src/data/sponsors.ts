/**
 * The collection model. Money does not come from one API — it comes from four
 * rails, and the rail a member sits on keys the entire downstream experience:
 * the enrolment door, the pay screen, the ID card, the contributions ledger and
 * the whole sponsor console.
 *
 *   Sponsor (employer / MDA / state / none) → Collection method → Member
 *
 * Identity, CSP-ID, cover and claims are identical in all four. Only the payment
 * source and the enrolment door differ, which is what lets a member who
 * transfers, retires or fails a deduction roll onto card without losing cover.
 */
export type SponsorId = 'federal' | 'state' | 'employer' | 'self'

export interface Sponsor {
  id: SponsorId
  /** Short label for chips and pickers. */
  name: string
  /** Mono badge, e.g. on the protection card. */
  tag: string
  /** The sponsoring organisation as a member would name it. */
  org: string
  /** How collection reads on the member's card. */
  short: string
  /** The actual rail reference — deduction code, schedule ref or mandate. */
  rail: string
  /** What the contributions ledger cites as the source of a cleared month. */
  ledger: string
  /**
   * True when money arrives as a monthly batch the sponsor controls. False only
   * for self-pay, the one rail that answers the same day.
   */
  payroll: boolean
  icon: string
}

export const SPONSORS: readonly Sponsor[] = [
  {
    id: 'federal',
    name: 'Federal',
    tag: 'FEDERAL',
    org: 'Fed. Min. of Education',
    short: 'IPPIS · Fed. Min. of Education',
    rail: 'IPPIS deduction code CSP-114 · OAGF approved',
    ledger: 'IPPIS',
    payroll: true,
    icon: 'ph ph-bank',
  },
  {
    id: 'state',
    name: 'State',
    tag: 'STATE',
    org: 'Lagos State Head of Service',
    short: 'Lagos State payroll',
    rail: 'Schedule CSP-LA-07 · State Accountant-General',
    ledger: 'LAG PAYROLL',
    payroll: true,
    icon: 'ph ph-map-trifold',
  },
  {
    id: 'employer',
    name: 'Employer',
    tag: 'EMPLOYER',
    org: 'Nightingale Hospital, Ikeja',
    short: 'Employer payroll',
    rail: 'Schedule CSP-EM-2214 · monthly CSV + invoice',
    ledger: 'CSV SCHEDULE',
    payroll: true,
    icon: 'ph ph-buildings',
  },
  {
    id: 'self',
    name: 'Self-pay',
    tag: 'SELF',
    org: 'No sponsor · self-paying members',
    short: 'Direct debit · GTBank ••4471',
    rail: 'NIBSS e-mandate MND-88214 · card on file',
    ledger: 'DIRECT DEBIT',
    payroll: false,
    icon: 'ph ph-user',
  },
]

export function sponsorById(id: SponsorId): Sponsor {
  return SPONSORS.find((s) => s.id === id) ?? SPONSORS[0]
}
