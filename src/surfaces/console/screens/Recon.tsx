import { friendly } from '../../../api/problems'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { PageSub, PageTitle, Panel } from '../../../components/surface'
import { MEMBER } from '../../../data/member'
import { C } from '../../../theme/tokens'
import { tone } from '../data'
import { useConsole } from '../state'
import { useAuth } from '../../../api/auth'
import { RECONCILIATION, SPONSOR_DASHBOARD } from '../../../api/fixtures'
import {
  useCloseCycle, useProposeResolution, useReconciliation, useResolveException,
  useSponsorDashboard,
} from '../../../api/queries'
import { NotLive, naira, dayFirst, monthName, periodLabel, useLive } from '../../../api/live'
import type { ReconciliationException } from '../../../api/types'

/** The four the server accepts — see the `exception_action` enum. */
type ExceptionAction = 'match' | 'waive' | 'chase' | 'remove'

/**
 * What a kind of exception is usually resolved as.
 *
 * A default, not a decision: the officer picks from the four options on screen
 * and that choice wins. This is only what happens if they write a note and
 * press without choosing — and it is the obvious answer in each case, which is
 * why the option is listed first.
 */
function defaultActionFor(kind: string): ExceptionAction {
  switch (kind) {
    case 'unmatched':
      return 'match'
    case 'left_service':
    case 'mandate_revoked':
      return 'remove'
    case 'wrong_amount':
      return 'waive'
    default:
      return 'chase'
  }
}

/**
 * What each kind of exception is called, and how it looks.
 *
 * The wire uses `no_deduction`; an officer reads "No deduction". Keeping the
 * mapping in one table rather than in the JSX means the filter chips, the match
 * bar, the legend and the rows cannot start disagreeing about what a kind is —
 * which they did, in the design bundle, for `left_service`.
 */
const KINDS: Record<string, { label: string; tone: 'clay' | 'ochre'; icon: string; bg: string }> = {
  unmatched: { label: 'Unmatched', tone: 'clay', icon: 'ph-fill ph-warning-diamond', bg: C.clay },
  no_deduction: { label: 'No deduction', tone: 'ochre', icon: 'ph ph-clock-countdown', bg: C.ochre },
  wrong_amount: { label: 'Wrong amount', tone: 'ochre', icon: 'ph ph-scales', bg: C.ochreBorder },
  left_service: { label: 'Left service', tone: 'clay', icon: 'ph ph-sign-out', bg: '#D98F6A' },
  no_funds: { label: 'No funds', tone: 'ochre', icon: 'ph ph-clock-countdown', bg: C.ochre },
  mandate_revoked: { label: 'Mandate revoked', tone: 'clay', icon: 'ph-fill ph-warning-diamond', bg: C.clay },
  card_expired: { label: 'Card expired', tone: 'ochre', icon: 'ph ph-credit-card', bg: C.ochreBorder },
}

const kindOf = (key: string) =>
  KINDS[key] ?? { label: key.replace(/_/g, ' '), tone: 'ochre' as const, icon: 'ph ph-question', bg: C.ochre }

/**
 * The line under a row's name.
 *
 * Whatever the file or the bank actually said, because the mismatch is the
 * evidence. A row we could not match shows the name as written *and* the
 * service number as written — that pair is the entire reason an officer has to
 * look at it rather than a rule resolving it.
 */
function evidenceFor(e: ReconciliationException): string {
  if (e.nameAsWritten || e.serviceNoAsWritten) {
    const parts = [e.serviceNoAsWritten && `SVC ${e.serviceNoAsWritten}`, 'not in our list']
    return parts.filter(Boolean).join(' · ')
  }
  return [e.cspId && `CSP ${e.cspId}`, e.ourServiceNo && `SVC ${e.ourServiceNo}`]
    .filter(Boolean)
    .join(' · ')
}

/** The second line: what happened, in money or in the rail's own words. */
function detailFor(e: ReconciliationException): string {
  if (e.railResponse) return e.railResponse
  if (e.kind === 'wrong_amount') {
    return `${naira(e.receivedMinor)} against a ${naira(e.expectedMinor)} plan`
  }
  if (e.proposedAt) return `Proposed ${dayFirst(e.proposedAt)} — waiting on an approver`
  return 'Needs a decision'
}

/**
 * Reconciliation queue. The core screen of the console: matching one lump-sum
 * credit against thousands of members, and deciding the rows that did not
 * match. The cycle stays blocked until every row here has an answer.
 */
export function ConsoleRecon() {
  const { payroll, filter, set, go } = useConsole()
  const { can } = useAuth()

  /* Two reads. The dashboard carries which cycle is open — there is no cycle id
     in the URL, because an officer navigates to "reconciliation", not to a
     cycle — and the reconciliation itself hangs off that. TanStack dedupes the
     dashboard with the one the home screen already fetched. */
  const { data: dash } = useLive(useSponsorDashboard(SPONSOR_DASHBOARD), SPONSOR_DASHBOARD)
  const { data: recon, failed } = useLive(
    useReconciliation(dash.sponsor.id, dash.cycle?.id ?? '', RECONCILIATION),
    RECONCILIATION,
  )

  /* Everything below is derived from one response. The bar, the legend, the
     chips and the rows were four hand-kept lists that had already drifted
     apart; now a kind that appears in the data appears in all four or in none. */
  const kinds = Object.entries(recon.summary.byKind).filter(([, n]) => n > 0)
  const settledLabel = payroll ? 'Matched' : 'Settled'

  const matchBar = [
    { key: 'matched', flex: recon.matched, bg: C.g },
    ...kinds.map(([key, n]) => ({ key, flex: n, bg: kindOf(key).bg })),
  ]

  const legend = [
    { label: settledLabel, n: recon.matched.toLocaleString('en-NG'), bg: C.g },
    ...kinds.map(([key, n]) => ({ label: kindOf(key).label, n: String(n), bg: kindOf(key).bg })),
  ]

  // Index 0 is "All"; the rest line up with `kinds`, so the chip an officer
  // presses and the rows they get are the same list read twice.
  const filters: [string, string][] = [
    ['All', String(recon.summary.total)],
    ...kinds.map(([key, n]): [string, string] => [kindOf(key).label, String(n)]),
  ]

  const rows =
    filter === 0
      ? recon.exceptions
      : recon.exceptions.filter((e) => e.kind === kinds[filter - 1]?.[0])

  const total = recon.matched + recon.summary.total

  /* Closing the cycle is the moment money becomes cover for everybody on it, so
     it has three gates and they are not the same gate:
       — the role may not be allowed to close at all (a preparer is not),
       — the cycle may still have undecided rows, which the server refuses with
         a 409 and which this can say before the click,
       — and the request itself can fail.
     Each gets its own sentence, because "cannot close" covering all three tells
     an officer nothing about what to do next. */
  const mayClose = can('CYCLE_CLOSE')
  const blocked = recon.summary.open > 0
  const close = useCloseCycle()
  const closeCycle = () => {
    if (!mayClose || blocked || close.isPending) return
    close.mutate({ sponsorId: dash.sponsor.id, cycleId: dash.cycle?.id ?? '' })
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <PageTitle>
            {payroll ? 'Return file' : 'Debit results'} · {periodLabel(dash.cycle?.period)}
          </PageTitle>
          <PageSub style={{ lineHeight: 1.5 }}>
            {payroll
              ? `Received ${dayFirst(dash.cycle?.returnedAt)} · ${total.toLocaleString('en-NG')} rows · matched against ${(dash.cycle?.scheduledCount ?? 0).toLocaleString('en-NG')} scheduled members.`
              : `Answered ${dayFirst(dash.cycle?.returnedAt)} · ${(dash.cycle?.scheduledCount ?? 0).toLocaleString('en-NG')} mandates presented · settled the same day.`}
          </PageSub>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          style={{ height: 44, padding: '0 18px', gap: 8 }}
          onClick={() => !payroll && go('debit')}
        >
          <Icon name={payroll ? 'ph ph-upload-simple' : 'ph ph-arrows-clockwise'} size={16} />
          {payroll ? 'Replace file' : 'The debit run'}
        </button>
      </div>

      {!payroll && (
        <div
          style={{
            display: 'flex', gap: 11, alignItems: 'flex-start', marginTop: 18, padding: '14px 15px',
            border: `1.5px solid ${C.ochreBorder}`, borderRadius: 12, background: C.ochreBg,
          }}
        >
          <Icon name="ph-fill ph-info" size={19} color={C.ochre} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ochreInk }}>There is no return file on this rail</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.ochre, marginTop: 3 }}>
              Self-paying members are answered by their bank the same day, so reconciliation is only ever about failed
              debits — never a payroll office. The exceptions below are bank responses.
            </div>
          </div>
        </div>
      )}

      <Panel pad={18} style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <Kicker size={9.5}>MATCH RESULT</Kicker>
          <div style={{ fontSize: 12.5, color: C.mut }}>
            {recon.matched.toLocaleString('en-NG')} of {total.toLocaleString('en-NG')} members
            reconciled — {recon.summary.open} need a decision
          </div>
        </div>
        <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 12, background: C.line7 }}>
          {matchBar.map((m) => (
            <div key={m.key} style={{ flex: m.flex, background: m.bg }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 11 }}>
          {legend.map((l) => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: l.bg }} />
              <span style={{ fontSize: 12.5, color: C.mut }}>{l.label}</span>
              <Mono size={12.5} weight={500}>{l.n}</Mono>
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 22 }}>
        {filters.map(([label, n], i) => {
          const on = filter === i
          return (
            <button
              key={label}
              type="button"
              className="chip"
              onClick={() => set({ filter: i })}
              style={{
                padding: '8px 13px', borderRadius: 999,
                border: `1.5px solid ${on ? C.g : C.line3}`,
                background: on ? C.gTint : C.white,
                color: on ? C.gd : C.ink,
                fontSize: 12.5, fontWeight: on ? 600 : 500,
              }}
            >
              {label}
              <Mono size={11} color={on ? C.g : C.faint}>{n}</Mono>
            </button>
          )
        })}
      </div>

      {failed && <NotLive what="This return file" />}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((e) => {
          const kind = kindOf(e.kind)
          const skin = tone(kind.tone)
          return (
            <button
              key={e.id}
              type="button"
              className="pick"
              onClick={() => go('exception')}
              style={{
                gap: 13, padding: '14px 15px', border: `1px solid ${skin.bc}`,
                borderRadius: 11, background: C.white, flexWrap: 'wrap',
              }}
            >
              <Icon name={kind.icon} size={19} color={skin.ic} />
              <span style={{ flex: 1, minWidth: 170 }}>
                {/* The name as the file wrote it, when we could not match it.
                    "ADAEZE N OKAFOR" in shouting caps against our "Adaeze Nkiru
                    Okafor" is the mismatch, and normalising it here would hide
                    the one thing the officer is being asked to look at. */}
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
                  {e.nameAsWritten ?? e.memberName ?? 'Unknown'}
                </span>
                <Mono size={11.5} color={C.faint} style={{ display: 'block', marginTop: 2 }}>
                  {evidenceFor(e)}
                </Mono>
              </span>
              <span style={{ flex: 'none', minWidth: 140 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: skin.ic }}>{kind.label}</span>
                <span style={{ display: 'block', fontSize: 12, color: C.mut, marginTop: 1 }}>{detailFor(e)}</span>
              </span>
              <Mono size={13} style={{ flex: 'none', minWidth: 82, textAlign: 'right' }}>
                {naira(e.receivedMinor)}
              </Mono>
              <Icon name="ph ph-caret-right" size={15} color={C.ghost2} />
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 9, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" style={{ height: 46, padding: '0 18px', fontSize: 14, gap: 7 }}>
          <Icon name="ph ph-download-simple" size={16} />
          Export exceptions
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ height: 46, padding: '0 20px', fontSize: 14.5, gap: 7 }}
          disabled={!mayClose || blocked || close.isPending}
          onClick={closeCycle}
        >
          <Icon name="ph ph-check-circle" size={16} />
          {close.isPending ? 'Closing…' : payroll ? 'Close the cycle' : 'Close the run'}
        </button>
      </div>

      {close.isSuccess && (
        <div
          role="status"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, padding: '12px 13px',
            border: `1px solid ${C.gBorder}`, borderRadius: 10, background: C.gTint,
          }}
        >
          <Icon name="ph-fill ph-check-circle" size={17} color={C.g} />
          <span style={{ fontSize: 13, lineHeight: 1.45, color: C.gInk }}>
            Closed. {recon.matched.toLocaleString('en-NG')} members have been told their
            contribution cleared.
          </span>
        </div>
      )}
      {close.isError && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, padding: '12px 13px',
            border: `1px solid ${C.clayBorder2}`, borderRadius: 10, background: C.clayBg,
          }}
        >
          <Icon name="ph-fill ph-warning-circle" size={17} color={C.clay} />
          <span style={{ fontSize: 13, lineHeight: 1.45, color: C.clayInk }}>
            {friendly(close.error, 'That could not be closed.')}
          </span>
        </div>
      )}

      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: C.faint, marginTop: 10, maxWidth: 620 }}>
        {!mayClose
          ? 'Closing a cycle is an approver\u2019s decision. Yours is to clear the rows above; an approver signs off the month.'
          : payroll
            ? `Closing the cycle tells ${recon.matched.toLocaleString('en-NG')} members their ${monthName(dash.cycle?.period)} contribution cleared, and starts the 7-day card fallback for those who were not deducted.${blocked ? ` It is blocked while ${recon.summary.open} row(s) above are undecided.` : ''}`
            : `Closing the run tells ${recon.matched.toLocaleString('en-NG')} members their contribution cleared, and puts the failed debits on the retry ladder.${blocked ? ` It is blocked while ${recon.summary.open} row(s) above are undecided.` : ''}`}
      </div>
    </>
  )
}

/**
 * A single exception, with the file row and the member record side by side and
 * four decisions. This is where money becomes cover — or does not.
 */
export function ConsoleException() {
  const { payroll, profile, go } = useConsole()
  /* Maker-checker, in the console as well as in the aspect layer and the DB
     constraint. Three places, because the first two are conveniences and only
     the third cannot be gone around.

     Two separate capabilities, not one: a preparer may *propose* and an
     approver may *apply*. Gating both on "may resolve" left the preparer with a
     button they could read and not press, which is the opposite of the point —
     proposing is their half of the control. */
  const { can } = useAuth()
  const mayResolve = can('EXCEPTION_RESOLVE')
  const mayPropose = can('EXCEPTION_PROPOSE')

  const { data: dash } = useLive(useSponsorDashboard(SPONSOR_DASHBOARD), SPONSOR_DASHBOARD)
  const { data: recon } = useLive(
    useReconciliation(dash.sponsor.id, dash.cycle?.id ?? '', RECONCILIATION),
    RECONCILIATION,
  )
  /* The queue's first undecided row. The URL carries a member reference rather
     than an exception id — an officer forwards "the exception on CSP-114-88214"
     to a colleague by pasting the address bar — so the row is found by it and
     falls back to the head of the queue. The console is one `/console/*` route,
     so the reference is read off the path rather than from a route param. */
  const { pathname } = useLocation()
  const record = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '')
  const exception =
    recon.exceptions.find((e) => e.cspId === record) ??
    recon.exceptions.find((e) => e.resolvedAt === null) ??
    recon.exceptions[0]

  const [note, setNote] = useState('')
  const [chosen, setChosen] = useState<ExceptionAction | null>(null)
  const propose = useProposeResolution()
  const resolve = useResolveException()
  const pending = propose.isPending || resolve.isPending
  const failure = propose.error ?? resolve.error
  const done = propose.isSuccess || resolve.isSuccess

  /* One button, two halves of the same control. A preparer's press records what
     they think should happen; an approver's applies it. The server refuses an
     approver who is also the proposer — see checker_is_not_maker — so this is a
     convenience, not the safeguard. */
  const submit = () => {
    if (!exception || pending || !note.trim()) return
    const action = chosen ?? defaultActionFor(exception.kind)
    if (mayResolve) resolve.mutate({ exceptionId: exception.id, note })
    else if (mayPropose) propose.mutate({ exceptionId: exception.id, action, note })
  }

  const filePanel = payroll
    ? [
        { k: 'Name as written', v: 'ADAEZE N OKAFOR', alert: true },
        { k: 'Service number', v: '4471209', alert: true },
        { k: 'NIN', v: '•••• •••• 4471', alert: false },
        { k: 'Grade level', v: 'GL 12', alert: false },
        { k: 'Amount deducted', v: '₦2,500', alert: false },
        { k: 'Deduction code', v: profile.code, alert: false },
      ]
    : [
        { k: 'Response', v: '51 · INSUFFICIENT FUNDS', alert: true },
        { k: 'Presented', v: '28.08.2026 06:00', alert: false },
        { k: 'Bank', v: 'GTBank ••4471', alert: false },
        { k: 'Amount requested', v: '₦2,500', alert: false },
        { k: 'Collected', v: '₦0', alert: true },
        { k: 'Mandate', v: profile.code, alert: false },
      ]

  const memberPanel = payroll
    ? [
        { k: 'Name on our record', v: 'Adaeze Nkiru Okafor', match: true },
        { k: 'Service number', v: MEMBER.serviceNo, match: false },
        { k: 'NIN', v: '•••• •••• 4471', match: true },
        { k: 'Grade level', v: 'GL 12', match: true },
        { k: 'Plan amount', v: '₦2,500', match: true },
        { k: 'CSP-ID', v: MEMBER.cspId, match: null },
      ]
    : [
        { k: 'Member', v: 'Adaeze Nkiru Okafor', match: true },
        { k: 'CSP-ID', v: MEMBER.cspId, match: null },
        { k: 'Mandate authorised', v: '04.03.2024', match: true },
        { k: 'Paid on time', v: '28 of 30 months', match: true },
        { k: 'Plan amount', v: '₦2,500', match: true },
        { k: 'Grace ends', v: '27.10.2026', match: false },
      ]

  const actions = payroll
    ? [
        { title: 'Link this deduction to Adaeze Nkiru Okafor', sub: 'Credits her August contribution and corrects the service number on our record. She gets an SMS today.', icon: 'ph-fill ph-link', t: 'green' as const, action: 'match' as const },
        { title: 'Create a new member from the file row', sub: 'Use only if this really is a different person. Enrolment still needs their NIN verified and a beneficiary named.', icon: 'ph ph-user-plus', t: 'neutral' as const, action: 'remove' as const },
        { title: 'Return the money to payroll', sub: '₦2,500 goes back on next month’s schedule as a credit. Use when nobody should have been deducted.', icon: 'ph ph-arrow-u-up-left', t: 'ochre' as const, action: 'waive' as const },
        { title: `Hold and ask ${profile.destShort}`, sub: 'Parks the row and drafts a query with the file reference. The cycle stays open until it comes back.', icon: 'ph ph-chat-circle-text', t: 'neutral' as const, action: 'chase' as const },
      ]
    : [
        { title: 'Retry on 4 September', sub: 'The standard second attempt, after salaries land. Most no-funds failures clear here and she is never told anything went wrong.', icon: 'ph ph-arrows-clockwise', t: 'green' as const, action: 'chase' as const },
        { title: 'Move her collection date to the 30th', sub: 'Permanent fix if her salary date has changed. Needs no new mandate — only the presentation day changes.', icon: 'ph ph-calendar-dot', t: 'neutral' as const, action: 'match' as const },
        { title: 'Try the card on file instead', sub: 'Card ••4471 is on file as the backup. It costs more to collect, so it is the second choice, not the first.', icon: 'ph ph-credit-card', t: 'ochre' as const, action: 'match' as const },
        { title: 'Send the USSD prompt', sub: 'SMS with a string she can dial without a smartphone. Use when two retries have already failed.', icon: 'ph ph-device-mobile', t: 'neutral' as const, action: 'chase' as const },
      ]

  return (
    <>
      <button type="button" className="btn-back" onClick={() => go('recon')} style={{ padding: '2px 0 10px' }}>
        <Icon name="ph ph-arrow-left" size={16} />
        Reconciliation queue
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Mono
          size={10}
          color={C.clay}
          style={{ letterSpacing: '.1em', border: `1px solid ${C.clayBorder}`, borderRadius: 5, padding: '3px 8px' }}
        >
          {payroll ? 'UNMATCHED DEDUCTION' : 'FAILED DEBIT'}
        </Mono>
        <Mono size={11.5} color={C.faint}>
          {payroll ? 'EXC-2608-0031 · 1 of 31' : 'EXC-2608-0041 · 1 of 41'}
        </Mono>
      </div>

      <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.02em', marginTop: 8, textWrap: 'balance' }}>
        {payroll
          ? '₦2,500 was deducted from someone we cannot identify'
          : "₦2,500 was refused by the member's bank"}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.mut, marginTop: 6, maxWidth: 660 }}>
        {payroll
          ? 'The payroll file has a deduction under this name and service number, but nothing in our member list matches it. Until it is resolved the money sits unallocated and nobody gets credited for August.'
          : 'The mandate is valid but the account had no funds on presentation day. Nothing has been collected for August yet, and her 60-day grace clock started the moment the debit failed.'}
      </div>

      <div
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(272px,1fr))',
          gap: 12, marginTop: 20, alignItems: 'start',
        }}
      >
        <div style={{ padding: 17, border: `1.5px solid ${C.clayBorder}`, borderRadius: 12, background: C.white }}>
          <Kicker size={9.5} color={C.clay}>
            {payroll ? 'FROM THE PAYROLL FILE' : 'FROM THE BANK RESPONSE'}
          </Kicker>
          {filePanel.map((r) => (
            <div
              key={r.k}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.line7}` }}
            >
              <span style={{ fontSize: 12.5, color: C.mut }}>{r.k}</span>
              <Mono size={13} weight={500} color={r.alert ? C.clay : C.ink} style={{ textAlign: 'right' }}>{r.v}</Mono>
            </div>
          ))}
          <div style={{ fontSize: 12, lineHeight: 1.5, color: C.faint, marginTop: 11 }}>
            {payroll
              ? `Row 4,208 of the August return file, exactly as sent by ${profile.destShort}.`
              : `NIBSS response code 51 against mandate ${profile.code}, returned within the hour.`}
          </div>
        </div>

        <div style={{ padding: 17, border: `1px solid ${C.gBorder}`, borderRadius: 12, background: C.white }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <Kicker size={9.5} color={C.g}>
              {payroll ? 'CLOSEST MEMBER MATCH' : 'THE MEMBER AND HER MANDATE'}
            </Kicker>
            <Mono
              size={10.5}
              color={C.g}
              style={{ background: C.gTint, border: `1px solid ${C.gBorder}`, borderRadius: 99, padding: '2px 8px' }}
            >
              {payroll ? '94% LIKELY' : 'MANDATE VALID'}
            </Mono>
          </div>
          {memberPanel.map((r) => (
            <div
              key={r.k}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.line7}` }}
            >
              <span style={{ fontSize: 12.5, color: C.mut }}>{r.k}</span>
              <Mono
                size={13}
                weight={500}
                color={r.match === null ? C.ink : r.match ? C.g : C.clay}
                style={{ textAlign: 'right' }}
              >
                {r.v}
              </Mono>
            </div>
          ))}
          <div style={{ fontSize: 12, lineHeight: 1.5, color: C.mut, marginTop: 11 }}>
            {payroll
              ? 'Same NIN, same grade level, name spelled differently and one digit out on the service number — almost certainly a payroll typo, not a different person.'
              : 'The mandate itself is fine, so nothing needs re-authorising. This is a timing problem: she is paid on the 30th and we presented on the 28th.'}
          </div>
        </div>
      </div>

      <Kicker size={9.5} style={{ marginTop: 24 }}>WHAT DO YOU WANT TO DO</Kicker>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 9 }}>
        {actions.map((a) => {
          const skin = tone(a.t)
          return (
            <button
              key={a.title}
              type="button"
              className="pick"
              aria-pressed={chosen === a.action}
              onClick={() => setChosen(a.action)}
              style={{
                alignItems: 'flex-start', gap: 12, padding: '14px 15px',
                // The chosen one is outlined rather than merely tinted: this is
                // a record of a decision someone is accountable for, and which
                // one they picked must be legible at a glance before they
                // write the note that goes on the audit trail.
                border: `1.5px solid ${
                  chosen === a.action ? C.g : a.t === 'green' ? C.gBorder3 : skin.bc
                }`,
                borderRadius: 11,
                background: chosen === a.action || a.t === 'green' ? C.gTint : C.white,
              }}
            >
              <Icon name={a.icon} size={19} color={skin.ic} style={{ marginTop: 1 }} />
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: skin.fg }}>{a.title}</span>
                <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45, color: C.mut, marginTop: 2 }}>{a.sub}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Whatever is decided, the reason is kept — this is the audit trail the
          whole product is sold on. */}
      <Panel pad={16} style={{ marginTop: 16, padding: '15px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          Why did this happen? <span style={{ fontWeight: 400, color: C.faint }}>(kept on the audit trail)</span>
        </div>
        <textarea
          rows={2}
          aria-label="Why did this happen?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            payroll
              ? 'e.g. name corrected on payroll in July, our record not updated'
              : 'e.g. member says salary now lands on the 30th'
          }
          style={{
            width: '100%', boxSizing: 'border-box', marginTop: 9, padding: '11px 12px',
            border: `1px solid ${C.line3}`, borderRadius: 9, background: '#FDFDFB',
            fontSize: 13, lineHeight: 1.5, color: C.ink, resize: 'vertical', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 9, marginTop: 11, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ height: 44, padding: '0 18px', color: C.mut }}
            onClick={() => go('recon')}
          >
            Skip for now
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            style={{ height: 44, padding: '0 20px' }}
            /* A note is required, not encouraged. The server enforces it too,
               but being told after the fact that the reason was too short means
               retyping it — and this is the field the audit trail is made of. */
            disabled={(!mayResolve && !mayPropose) || pending || note.trim().length < 4}
            title={note.trim().length < 4 ? 'Say why first — it is kept on the audit trail.' : undefined}
            onClick={submit}
          >
            {pending ? 'Saving…' : mayResolve ? 'Resolve and go to next' : 'Send for approval'}
          </button>
        </div>

        {done && (
          <div
            role="status"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 11, padding: '11px 12px',
              border: `1px solid ${C.gBorder}`, borderRadius: 10, background: C.gTint,
            }}
          >
            <Icon name="ph-fill ph-check-circle" size={16} color={C.g} />
            <span style={{ fontSize: 13, lineHeight: 1.45, color: C.gInk }}>
              {mayResolve
                ? 'Resolved. The member is being told.'
                : 'Sent. An approver sees it in their queue — it cannot be signed off by you.'}
            </span>
          </div>
        )}
        {failure && (
          <div
            role="alert"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 11, padding: '11px 12px',
              border: `1px solid ${C.clayBorder2}`, borderRadius: 10, background: C.clayBg,
            }}
          >
            <Icon name="ph-fill ph-warning-circle" size={16} color={C.clay} />
            {/* Verbatim. "An exception cannot be resolved by the person who
                proposed it" is the control explaining itself; a generic
                apology teaches an officer that the console is flaky. */}
            <span style={{ fontSize: 13, lineHeight: 1.45, color: C.clayInk }}>
              {friendly(failure, 'That could not be saved.')}
            </span>
          </div>
        )}
        {/* Greyed out with the reason, not hidden. A preparer who cannot find
            the button assumes the console is broken; one who is told an approver
            has to sign it off has learned how the control works. */}
        {!mayResolve && mayPropose && (
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.faint, marginTop: 9 }}>
            Resolving an exception is an approver's decision, and it cannot be the
            same person who proposed it. Yours goes to the approver's queue.
          </div>
        )}
      </Panel>
    </>
  )
}
