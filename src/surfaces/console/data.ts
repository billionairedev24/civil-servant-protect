/**
 * Sponsor-console fixtures.
 *
 * The console's whole job is reconciling a batch nobody controls, so most of
 * this is shaped by one fact: on a payroll rail the return file — not the bank
 * credit — is the only thing that says who is actually covered.
 */
import { MEMBER } from '../../data/member'
import { C } from '../../theme/tokens'
import type { SponsorId } from '../../data/sponsors'

/** Console-only sponsor detail: where the schedule goes and what it must quote. */
export interface ConsoleProfile {
  /** Where the schedule is sent, in full. */
  dest: string
  /** The same, as it reads mid-sentence. */
  destShort: string
  /** Deduction code or mandate reference every row must carry. */
  code: string
  codeNote: string
  /** Accepted file formats, most-correct first. */
  formats: readonly string[]
  /** Members on this sponsor. */
  count: string
  /** Right-rail note about how this rail behaves. */
  note: string
  /** Who to chase when the file is late. */
  chase: string
}

export const CONSOLE_PROFILE: Record<SponsorId, ConsoleProfile> = {
  federal: {
    dest: 'IPPIS deduction unit, OAGF',
    destShort: 'the IPPIS unit',
    code: 'CSP-114',
    codeNote:
      'Issued by the Office of the Accountant-General. Every row on the file must quote it or the deduction is rejected.',
    formats: ['IPPIS fixed-width', 'CSV', 'XLSX'],
    count: '8,440',
    note: 'A federal MDA cannot be invoiced. The schedule goes to the IPPIS deduction unit, the deduction is applied at source, and one consolidated credit follows weeks later.',
    chase: 'When the return file is late, it is almost never the bank — it is a desk in the payroll unit. Keep a named person, not a generic email.',
  },
  state: {
    dest: 'Office of the State Accountant-General',
    destShort: "the AG's office",
    code: 'CSP-LA-07',
    codeNote:
      'State schedule reference. Lagos re-issues it each financial year, so check it every January before the first run.',
    formats: ['State template', 'CSV', 'XLSX'],
    count: '6,180',
    note: 'State payroll runs on its own calendar and its own file format. Expect the return file two to five weeks after the salary run, and build the grace period around that — not around the bank.',
    chase: 'State files slip most often in January and after a change of government. Two named contacts, not one.',
  },
  employer: {
    dest: 'Your own payroll and finance team',
    destShort: 'your payroll team',
    code: 'CSP-EM-2214',
    codeNote:
      'Your scheme reference. Quote it on the transfer so finance can reconcile the credit without calling us.',
    formats: ['CSV', 'XLSX', 'Payroll API'],
    count: '412',
    note: 'A private employer is both the sponsor and the payroll office, so the loop closes in days rather than weeks. The exceptions queue is the same one a ministry sees.',
    chase: 'You are chasing your own finance team here, which is faster — but the same 60-day grace applies to members if the transfer is missed.',
  },
  self: {
    dest: 'No payroll office — direct debit',
    destShort: 'the bank',
    code: 'MND-88214',
    codeNote:
      'NIBSS e-mandate reference. Each member authorises it once at their bank; card on file is the fallback.',
    formats: ['Debit run CSV', 'XLSX', 'NIBSS batch'],
    count: '1,240',
    note: 'No employer, no schedule, no waiting. Debits are presented and answered the same day, so this console spends its time on failed debits rather than on a ministry.',
    chase: 'Nobody to chase but the member. Failed debits become SMS and USSD prompts, then the grace clock.',
  },
}

export const FORMAT_NOTES = [
  'Fixed-width is what the IPPIS unit will actually accept. The others are for your own records.',
  'CSV imports cleanly into most state payroll bureaux; check the column order every January.',
  'XLSX is easier to read but easier to break. Send the machine format, keep the spreadsheet.',
] as const

export const MOVEMENT = [
  { k: 'New starters enrolled', v: '+37', icon: 'ph ph-user-plus', tone: 'green' },
  { k: 'Left service or transferred', v: '−9', icon: 'ph ph-user-minus', tone: 'clay' },
  { k: 'Plan upgrades approved', v: '14', icon: 'ph ph-arrow-fat-up', tone: 'green' },
  { k: 'Moved to direct debit', v: '6', icon: 'ph ph-arrows-left-right', tone: 'ochre' },
] as const

export const SEND_LOG = [
  { period: 'AUG 26', what: 'Schedule sent, file returned, reconciling', amount: '₦21,030,000', state: '31 exceptions', tone: 'ochre' },
  { period: 'JUL 26', what: 'Closed · all members credited', amount: '₦20,880,000', state: 'Reconciled', tone: 'green' },
  { period: 'JUN 26', what: 'Closed · 4 moved to direct debit', amount: '₦20,745,000', state: 'Reconciled', tone: 'green' },
  { period: 'MAY 26', what: 'File arrived 19 days late', amount: '₦20,700,000', state: 'Closed late', tone: 'ochre' },
  { period: 'APR 26', what: 'Closed · deduction code re-issued', amount: '₦20,610,000', state: 'Reconciled', tone: 'green' },
] as const

/** Reconciliation rows. `f` is the filter bucket the chips select on. */
export interface ReconRow {
  name: string
  ref: string
  kind: string
  detail: string
  amount: string
  tone: 'clay' | 'ochre'
  icon: string
  f: number
}

export const RECON_PAYROLL: readonly ReconRow[] = [
  { name: 'ADAEZE N OKAFOR', ref: 'SVC 4471209 · not in our list', kind: 'Unmatched', detail: 'Closest match 94% likely', amount: '₦2,500', tone: 'clay', icon: 'ph-fill ph-warning-diamond', f: 1 },
  { name: 'Musa Ibrahim', ref: 'CSP 8812-4409 · GL 09', kind: 'No deduction', detail: 'Card fallback attempted 08.09', amount: '₦0', tone: 'ochre', icon: 'ph ph-clock-countdown', f: 2 },
  { name: 'Folake Adeyemi', ref: 'CSP 7741-2280 · GL 14', kind: 'Wrong amount', detail: '₦1,500 against a ₦2,500 plan', amount: '₦1,500', tone: 'ochre', icon: 'ph ph-scales', f: 3 },
  { name: 'Chinedu Eze', ref: 'CSP 5510-8842 · retired 31.07', kind: 'Left service', detail: 'Convert to direct debit or close', amount: '₦0', tone: 'clay', icon: 'ph ph-sign-out', f: 4 },
  { name: 'IBRAHIM M SANI', ref: 'SVC 9920117 · NIN matches nobody', kind: 'Unmatched', detail: 'No candidate found', amount: '₦4,000', tone: 'clay', icon: 'ph-fill ph-warning-diamond', f: 1 },
  { name: 'Grace Attah', ref: 'CSP 3391-7745 · GL 08', kind: 'No deduction', detail: 'Third month running', amount: '₦0', tone: 'ochre', icon: 'ph ph-clock-countdown', f: 2 },
]

export const RECON_SELF: readonly ReconRow[] = [
  { name: 'Adaeze Nkiru Okafor', ref: `CSP ${MEMBER.cspId} · GTB ••4471`, kind: 'No funds', detail: 'Retry due 04.09 · first failure', amount: '₦2,500', tone: 'ochre', icon: 'ph ph-clock-countdown', f: 1 },
  { name: 'Musa Ibrahim', ref: 'CSP 8812-4409 · Zenith ••8812', kind: 'No funds', detail: 'Second failure this quarter', amount: '₦1,500', tone: 'ochre', icon: 'ph ph-clock-countdown', f: 1 },
  { name: 'Grace Attah', ref: 'CSP 3391-7745 · UBA ••3391', kind: 'Mandate revoked', detail: 'Cancelled at the branch 21.08', amount: '₦0', tone: 'clay', icon: 'ph-fill ph-warning-diamond', f: 2 },
  { name: 'Folake Adeyemi', ref: 'CSP 7741-2280 · card ••2280', kind: 'Card expired', detail: 'Two SMS sent · in-app prompt live', amount: '₦0', tone: 'ochre', icon: 'ph ph-credit-card', f: 3 },
  { name: 'Halima Yusuf', ref: 'CSP 2204-9917 · First ••2204', kind: 'No funds', detail: 'Retry due 04.09', amount: '₦6,000', tone: 'ochre', icon: 'ph ph-clock-countdown', f: 1 },
  { name: 'Sadiq Aliyu', ref: 'CSP 1182-6640 · account closed', kind: 'Mandate revoked', detail: 'Needs a new bank account', amount: '₦0', tone: 'clay', icon: 'ph-fill ph-warning-diamond', f: 2 },
]

export const ROSTER = [
  { name: 'Adaeze Nkiru Okafor', ref: `CSP ${MEMBER.cspId} · SVC ${MEMBER.serviceNo}`, tier: 'Standard', price: '₦2,500', state: 'Paid to August', icon: 'ph-fill ph-check-circle', tone: 'green', initials: 'AO' },
  { name: 'Musa Ibrahim', ref: 'CSP 8812-4409 · SVC 8812441', tier: 'Basic', price: '₦1,500', state: 'Not in August file', icon: 'ph ph-clock-countdown', tone: 'ochre', initials: 'MI' },
  { name: 'Folake Adeyemi', ref: 'CSP 7741-2280 · SVC 7741228', tier: 'Enhanced', price: '₦4,000', state: 'Underpaid ₦1,000', icon: 'ph ph-scales', tone: 'ochre', initials: 'FA' },
  { name: 'Grace Attah', ref: 'CSP 3391-7745 · SVC 3391774', tier: 'Basic', price: '₦1,500', state: 'In 60-day grace', icon: 'ph-fill ph-warning-circle', tone: 'clay', initials: 'GA' },
  { name: 'Chinedu Eze', ref: 'CSP 5510-8842 · retired 31.07', tier: 'Standard', price: '₦2,500', state: 'Moving to direct debit', icon: 'ph ph-arrows-left-right', tone: 'ochre', initials: 'CE' },
  { name: 'Halima Yusuf', ref: 'CSP 2204-9917 · SVC 2204991', tier: 'Executive', price: '₦6,000', state: 'No beneficiary named', icon: 'ph ph-user-minus', tone: 'ochre', initials: 'HY' },
  { name: 'Tunde Bakare', ref: 'CSP 6628-3310 · SVC 6628331', tier: 'Standard', price: '₦2,500', state: 'Paid to August', icon: 'ph-fill ph-check-circle', tone: 'green', initials: 'TB' },
] as const

/** Removing someone stops the deduction — it does not cancel cover. What
    happens next depends entirely on why they left. */
export const LEAVERS = [
  {
    name: 'Chinedu Eze', ref: 'CSP 5510-8842', reason: 'Retired', tone: 'green', icon: 'ph ph-arrows-left-right',
    outcome: 'Cover continues on direct debit at the same price, keeping his CSP-ID and start date. Twenty-two years of contribution history is not lost.',
  },
  {
    name: 'Blessing Umoh', ref: 'CSP 9930-2214', reason: 'Transferred out', tone: 'ochre', icon: 'ph ph-buildings',
    outcome: "Moves to her new MDA's schedule if they run the scheme; otherwise direct debit. She keeps her CSP-ID either way.",
  },
  {
    name: 'Sadiq Aliyu', ref: 'CSP 1182-6640', reason: 'Dismissed', tone: 'clay', icon: 'ph ph-sign-out',
    outcome: 'Sixty days of grace, then cover lapses unless he sets up a direct debit himself. Contributions already made are not refundable.',
  },
] as const

/**
 * Claims as a sponsor may see them. Cause of death, medical documents, hospital
 * names and beneficiary bank details are never shown — members are told this at
 * enrolment, and it is why they trust the scheme with a NIN.
 */
export const CONSOLE_CLAIMS = [
  {
    ref: 'CLM-2026-0084', member: 'Late Adaeze N. Okafor', kind: 'Death benefit · family claiming',
    amount: '₦5,000,000', state: 'Awaiting you', icon: 'ph-fill ph-hand-waving', tone: 'ochre',
    askTitle: 'Confirm she was in service on 14.08.2026',
    askSub: 'The insurer needs one line from the employer. Nothing medical is asked of you.',
    askCta: 'Confirm service',
  },
  {
    ref: 'CLM-2026-0079', member: 'Musa Ibrahim', kind: 'Accident · hospital cash',
    amount: '₦150,000', state: 'Assessing', icon: 'ph-fill ph-circle-notch', tone: 'neutral',
  },
  {
    ref: 'CLM-2026-0071', member: 'Folake Adeyemi', kind: 'Permanent disability',
    amount: '₦2,500,000', state: 'Paid 18.08', icon: 'ph-fill ph-check-circle', tone: 'green',
  },
  {
    ref: 'CLM-2026-0066', member: 'Late Sadiq Aliyu', kind: 'Death benefit · cover lapsed',
    amount: '—', state: 'Declined', icon: 'ph-fill ph-x-circle', tone: 'clay',
    askTitle: 'Cover had lapsed 11 days before the date of death',
    askSub: 'August and September deductions never reached us. The family has been told, and can appeal within 30 days.',
    askCta: 'See the record',
  },
] as const

export const REPORTS = [
  { title: 'Deduction schedule', sub: 'What you asked payroll to deduct, per member, for the period.', icon: 'ph ph-list-numbers', tone: 'neutral' },
  { title: 'Remittance reconciliation', sub: 'Credits received against the file, with every variance and how it was resolved. This is the one auditors ask for.', icon: 'ph ph-git-diff', tone: 'green' },
  { title: 'Membership movement', sub: 'Starters, leavers, transfers and tier changes, with effective dates.', icon: 'ph ph-users-three', tone: 'neutral' },
  { title: 'Claims summary', sub: 'Counts, amounts and outcomes. No medical detail, no cause of death.', icon: 'ph ph-first-aid-kit', tone: 'neutral' },
  { title: 'Lapse risk', sub: 'Members inside the 60-day grace window, ordered by days remaining. Nobody asks for this until a family is refused.', icon: 'ph ph-warning-diamond', tone: 'clay' },
] as const

export const RECENT_EXPORTS = [
  { name: 'Remittance reconciliation · Aug 2026', who: 'Musa Danjuma', when: '29.08', icon: 'ph ph-file-csv' },
  { name: 'Deduction schedule · Sep 2026', who: 'Amina Bello', when: '01.09', icon: 'ph ph-file-csv' },
  { name: 'Lapse risk · Aug 2026', who: 'Amina Bello', when: '28.08', icon: 'ph ph-file-pdf' },
  { name: 'Membership movement · Q2 2026', who: 'Ngozi Eze', when: '12.07', icon: 'ph ph-file-xls' },
] as const

export const PERIODS = ['August 2026', 'Q3 2026', 'Year to date', '2025 full year'] as const

/** Shared tone → colour mapping, so a row's semantic is set once. */
export function tone(t: 'green' | 'ochre' | 'clay' | 'neutral') {
  return {
    green: { ic: C.g, fg: C.gd, bc: C.gBorder, bg: C.gTint },
    ochre: { ic: C.ochre, fg: C.ochreInk, bc: C.ochreBorder, bg: C.ochreBg },
    clay: { ic: C.clay, fg: C.clay, bc: C.clayBorder, bg: C.clayBg },
    neutral: { ic: C.mut, fg: C.ink, bc: C.line, bg: C.white },
  }[t]
}
