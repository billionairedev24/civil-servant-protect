/**
 * The collection cycle, branched by rail.
 *
 * Payroll sponsors: you send a deduction schedule, it sits with the payroll
 * office for most of a month, a return file comes back, and only then can
 * anything be reconciled. There is no live deduction API — treat payroll as an
 * async batch reconciliation problem, never a request/response.
 *
 * Self-pay: NIBSS direct debit, presented and answered the same day. This is the
 * only rail that responds live, which is why its exceptions are bank response
 * codes rather than file mismatches.
 */
import { C } from '../theme/tokens'
import type { Sponsor } from './sponsors'

export interface CycleStep {
  title: string
  sub: string
  when: string
  state: 'done' | 'now'
}

export const CYCLE_PAYROLL: readonly CycleStep[] = [
  { title: 'Schedule sent', sub: '8,412 members · ₦21,030,000', when: '02.08', state: 'done' },
  { title: 'With the payroll office', sub: 'No API — the file sits with them for the month', when: '02–26.08', state: 'done' },
  { title: 'Return file received', sub: '8,381 deductions · 31 with no matching member', when: '28.08', state: 'done' },
  { title: 'Reconciled and members told', sub: 'Blocked until the exceptions below are cleared', when: 'pending', state: 'now' },
]

export const CYCLE_SELF: readonly CycleStep[] = [
  { title: 'Mandate batch queued', sub: '1,240 members · ₦3,100,000', when: '26.08', state: 'done' },
  { title: 'Debits presented', sub: 'NIBSS direct debit + card fallback', when: '28.08', state: 'done' },
  { title: 'Results returned', sub: 'Same day — this is the one rail that answers live', when: '28.08', state: 'done' },
  { title: 'Retries and dunning', sub: '41 insufficient funds · retry on 04.09', when: 'running', state: 'now' },
]

export interface ExceptionRow {
  n: number
  title: string
  sub: string
  /** Hard exceptions are clay, recoverable ones ochre. */
  hard: boolean
}

export const EXCEPTIONS_PAYROLL: readonly ExceptionRow[] = [
  { n: 31, title: 'Deductions with no matching member', sub: 'Name or service number does not match our file', hard: true },
  { n: 12, title: 'Members with no deduction', sub: 'Card fallback attempted 08.09 · 9 recovered', hard: false },
  { n: 5, title: 'Amount does not match the tier', sub: '₦1,500 received against a ₦2,500 plan', hard: false },
  { n: 9, title: 'Left service or transferred out', sub: 'Move to direct debit, or close the cover', hard: true },
]

export const EXCEPTIONS_SELF: readonly ExceptionRow[] = [
  { n: 41, title: 'Insufficient funds', sub: 'Retry 04.09, then SMS with a USSD link', hard: false },
  { n: 7, title: 'Mandate revoked at the bank', sub: 'Member must re-authorise before 60 days', hard: true },
  { n: 3, title: 'Card expired', sub: 'Two SMS sent · in-app prompt live', hard: false },
]

export function exceptionColors(hard: boolean) {
  return hard ? { ic: C.clay, bc: C.clayBorder } : { ic: C.ochre, bc: C.ochreBorder }
}

/** Everything the console header and cycle block need for one sponsor. */
export function collectionFor(sponsor: Sponsor) {
  const payroll = sponsor.payroll
  const exceptions = payroll ? EXCEPTIONS_PAYROLL : EXCEPTIONS_SELF

  return {
    payroll,
    cycle: payroll ? CYCLE_PAYROLL : CYCLE_SELF,
    exceptions,
    exceptionTotal: exceptions.reduce((n, e) => n + e.n, 0),
    cycleHeading: payroll ? 'DEDUCTION CYCLE · AUGUST' : 'COLLECTION RUN · AUGUST',
    actionA: payroll ? 'Schedule (CSV)' : 'Export debit run (CSV)',
    actionAIcon: 'ph ph-download-simple',
    actionB: payroll ? 'Upload return file' : 'Retry failed debits',
    actionBIcon: payroll ? 'ph ph-upload-simple' : 'ph ph-arrows-clockwise',
    cycleNote: payroll
      ? 'Federal MDAs send this to the IPPIS department, states to the Accountant-General, employers upload it themselves. Same file, three doors.'
      : 'Self-paying members reconcile the same day, so this console is only ever chasing failed debits — never a ministry.',
    consoleNote: payroll
      ? 'A federal MDA sends this schedule to IPPIS, a state sends it to its Accountant-General, a private employer uploads it as a CSV. Different door, same file, same exceptions queue below — that queue is the product.'
      : 'Self-paying members have no schedule to send, so this console only ever chases the debit run. The exceptions queue is the same one a ministry sees — which is why one console serves all four sponsor types.',
    stats: payroll
      ? [
          { v: '8,412', k: 'Members on this sponsor' },
          { v: '₦21.0m', k: 'Scheduled for August' },
          { v: '99.6%', k: 'Returned in the August file' },
        ]
      : [
          { v: '1,240', k: 'Self-paying members' },
          { v: '₦3.1m', k: 'Presented on 28 August' },
          { v: '96.0%', k: 'Settled the same day' },
        ],
    tasks: [
      {
        title: 'Approve plan upgrades',
        sub: payroll ? 'Start from the next payroll run' : 'Start from the next collection',
        count: '14',
        icon: 'ph ph-arrow-fat-up',
        ic: C.g,
        bc: C.gBorder,
      },
      {
        title: 'Members with no beneficiary',
        sub: 'Chase before annual confirmation',
        count: '203',
        icon: 'ph ph-user-minus',
        ic: C.ochre,
        bc: C.ochreBorder,
      },
      {
        title: 'New starters to enrol',
        sub: 'Joined in the last 30 days',
        count: '37',
        icon: 'ph ph-user-plus',
        ic: C.g,
        bc: C.line,
      },
    ],
  }
}
