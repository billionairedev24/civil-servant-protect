import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { PageSub, PageTitle, Panel } from '../../../components/surface'
import { SPONSOR_DASHBOARD } from '../../../api/fixtures'
import { useSponsorDashboard } from '../../../api/queries'
import { NotLive, dayFirst, monthName, naira, periodLabel, useLive } from '../../../api/live'
import { C } from '../../../theme/tokens'
import { MOVEMENT, tone } from '../data'
import { useConsole } from '../state'

export function ConsoleDashboard() {
  const { payroll, profile, late, go } = useConsole()
  /* Polled every minute — an officer leaves this open while a colleague works
     the same queue, and a count five minutes stale is how two people resolve
     the same exception twice. */
  const { data: dash, failed } = useLive(useSponsorDashboard(SPONSOR_DASHBOARD), SPONSOR_DASHBOARD)

  /* The cycle's state comes from the record rather than from the demo's `late`
     flag, which only exists so the overdue story can be shown without waiting a
     month for it. `late` still drives the fixture demo. */
  const overdue = late || dash.cycle?.state === 'overdue'
  const cycleState = payroll ? (overdue ? 'File overdue' : 'Reconciling') : 'Retrying'
  const cycleSkin = overdue ? tone('clay') : tone('ochre')
  const exceptions = String(dash.exceptions.open)

  const scheduled = dash.cycle?.scheduledCount ?? 0
  // Of what was scheduled, how much came back accounted for. Derived rather
  // than stated: an officer who is told "99.6%" and separately "57 exceptions"
  // should be able to check that those are the same claim.
  const returnedPct =
    scheduled === 0 ? '—' : `${(((scheduled - dash.exceptions.total) / scheduled) * 100).toFixed(1)}%`

  const stats = payroll
    ? [
        {
          v: dash.roster.members.toLocaleString('en-NG'),
          k: 'Members on this sponsor', tag: 'ROSTER', icon: 'ph ph-users-three', alert: false,
        },
        { v: millions(dash.cycle?.scheduledMinor), k: `Scheduled for ${monthName(dash.cycle?.period)}`, tag: 'SCHEDULED', icon: 'ph ph-arrow-up-right', alert: false },
        {
          v: overdue ? '—' : returnedPct,
          k: overdue ? 'No file returned yet' : `Returned in the ${monthName(dash.cycle?.period)} file`,
          tag: 'RETURNED', icon: 'ph ph-file-text', alert: overdue,
        },
        {
          v: overdue ? scheduled.toLocaleString('en-NG') : exceptions,
          k: overdue ? 'Members waiting on the file' : 'Exceptions to clear',
          tag: 'EXCEPTIONS', icon: 'ph ph-warning-diamond', alert: true,
        },
      ]
    : [
        {
          v: dash.roster.members.toLocaleString('en-NG'),
          k: 'Self-paying members', tag: 'ROSTER', icon: 'ph ph-users-three', alert: false,
        },
        { v: millions(dash.cycle?.scheduledMinor), k: `Presented on ${dayFirst(dash.cycle?.sentAt)}`, tag: 'PRESENTED', icon: 'ph ph-arrow-up-right', alert: false },
        { v: '96.0%', k: 'Settled the same day', tag: 'SETTLED', icon: 'ph ph-check-circle', alert: false },
        { v: exceptions, k: 'Failed debits to work', tag: 'FAILED', icon: 'ph ph-warning-diamond', alert: true },
      ]

  const tasks = [
    {
      title: payroll ? 'Clear the exceptions queue' : 'Retry the failed debits',
      sub: payroll ? 'Blocks the next payroll run' : 'Second attempt due 04.09',
      count: exceptions,
      icon: 'ph ph-git-diff', skin: tone('clay'),
      to: payroll ? ('recon' as const) : ('debit' as const),
    },
    {
      title: 'Members with no beneficiary',
      sub: 'Chase before annual confirmation',
      count: String(dash.roster.withoutBeneficiary),
      icon: 'ph ph-user-minus', skin: tone('ochre'), to: 'roster' as const,
    },
    {
      title: 'New starters to enrol', sub: 'Joined in the last 30 days', count: '37',
      icon: 'ph ph-user-plus', skin: { ...tone('green'), bc: C.line }, to: 'members' as const,
    },
  ]

  /* The cycle is the console's spine: a file goes out, it sits on someone's
     desk for most of a month, a return file comes back, and only then can
     anything be reconciled. */
  const sent = dayFirst(dash.cycle?.sentAt)
  const returned = dayFirst(dash.cycle?.returnedAt)
  const scheduledLine = `${scheduled.toLocaleString('en-NG')} members · ${naira(dash.cycle?.scheduledMinor)}`

  const cycle = payroll
    ? [
        { title: 'Schedule sent', sub: scheduledLine, when: sent, done: true },
        {
          title: `With ${profile.destShort}`,
          sub: 'No API — the file sits on a desk for the month',
          when: overdue ? `since ${sent}` : `${sent}–${returned}`,
          done: true,
        },
        {
          title: overdue ? 'Return file overdue' : 'Return file received',
          sub: overdue
            ? 'Chased twice · nothing back'
            : `${(scheduled - dash.exceptions.total).toLocaleString('en-NG')} deductions · ${dash.exceptions.byKind.unmatched ?? 0} with no matching member`,
          when: overdue ? 'overdue' : returned,
          done: !overdue,
        },
        {
          title: 'Reconciled and members told',
          sub: overdue
            ? 'Cannot start until the file arrives'
            : `Blocked until the ${dash.exceptions.open} exceptions are cleared`,
          when: 'pending', done: false,
        },
      ]
    : [
        { title: 'Mandate batch queued', sub: scheduledLine, when: sent, done: true },
        { title: 'Debits presented', sub: 'NIBSS direct debit, card as fallback', when: sent, done: true },
        { title: 'Results returned', sub: 'Same day — the one rail that answers live', when: returned, done: true },
        {
          title: 'Retries and dunning',
          sub: `${dash.exceptions.open} to work · retry on the next presentation date`,
          when: 'running', done: false,
        },
      ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <PageTitle>
            {monthName(dash.cycle?.period)} {payroll ? 'deduction cycle' : 'collection run'}
          </PageTitle>
          <PageSub style={{ lineHeight: 1.5 }}>
            {payroll
              ? `Schedule sent ${dayFirst(dash.cycle?.sentAt)} · return file ${
                  overdue ? 'still outstanding' : `received ${dayFirst(dash.cycle?.returnedAt)}`
                }`
              : `${scheduled.toLocaleString('en-NG')} mandates presented ${dayFirst(
                  dash.cycle?.sentAt,
                )} · settled the same day`}
          </PageSub>
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
            border: `1px solid ${cycleSkin.bc}`, borderRadius: 10, background: cycleSkin.bg,
          }}
        >
          <Icon name={late ? 'ph-fill ph-warning-circle' : 'ph-fill ph-circle-notch'} size={17} color={cycleSkin.ic} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: cycleSkin.fg }}>{cycleState}</div>
            <Mono size={10} color={C.faint}>{periodLabel(dash.cycle?.period)} CYCLE</Mono>
          </div>
        </div>
      </div>

      {failed && <NotLive what="This cycle" />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(158px,1fr))', gap: 10, marginTop: 20 }}>
        {stats.map((s) => (
          <Panel key={s.tag} pad={16} style={{ padding: '15px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name={s.icon} size={14} color={s.alert ? C.clay : C.ink} />
              <Mono size={9.5} color={C.faint} style={{ letterSpacing: '.1em' }}>{s.tag}</Mono>
            </div>
            <div
              style={{
                fontSize: 27, fontWeight: 700, letterSpacing: '-.03em',
                color: s.alert ? C.clay : C.ink, marginTop: 8,
              }}
            >
              {s.v}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.35, color: C.mut, marginTop: 2 }}>{s.k}</div>
          </Panel>
        ))}
      </div>

      <Kicker size={9.5} style={{ marginTop: 26 }}>NEEDS YOU THIS WEEK</Kicker>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 9, marginTop: 9 }}>
        {tasks.map((task) => (
          <button
            key={task.title}
            type="button"
            className="pick"
            onClick={() => go(task.to)}
            style={{ gap: 12, padding: '14px 15px', border: `1px solid ${task.skin.bc}`, background: C.white }}
          >
            <Icon name={task.icon} size={20} color={task.skin.ic} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{task.title}</span>
              <span style={{ display: 'block', fontSize: 12, lineHeight: 1.4, color: C.mut, marginTop: 2 }}>{task.sub}</span>
            </span>
            <span style={{ flex: 'none', fontSize: 17, fontWeight: 700, color: task.skin.ic }}>{task.count}</span>
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
          gap: 14, marginTop: 26, alignItems: 'start',
        }}
      >
        <div>
          <Kicker size={9.5}>{payroll ? 'DEDUCTION CYCLE · AUGUST' : 'COLLECTION RUN · AUGUST'}</Kicker>
          <Panel pad={16} style={{ marginTop: 9 }}>
            {cycle.map((c, i) => {
              const last = i === cycle.length - 1
              return (
                <div key={c.title} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 11, alignItems: 'start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                    <Icon
                      name={c.done ? 'ph-fill ph-check-circle' : 'ph-fill ph-circle-notch'}
                      size={19}
                      color={c.done ? C.g : C.ochre}
                    />
                    <div
                      style={{
                        width: 2, flex: 1, minHeight: last ? 0 : 12, borderRadius: 1,
                        background: last ? 'transparent' : C.gBorder,
                      }}
                    />
                  </div>
                  <div style={{ paddingBottom: last ? 12 : 18 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.45, color: C.faint, marginTop: 2 }}>{c.sub}</div>
                  </div>
                  <Mono size={11} color={C.faint} style={{ whiteSpace: 'nowrap' }}>{c.when}</Mono>
                </div>
              )
            })}

            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              {/* The primary takes the slack rather than splitting the row
                  evenly — "Open reconciliation" does not survive an equal
                  split at this column width, and the labels must not clip. */}
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                style={{ flex: '0 1 auto', gap: 7 }}
                onClick={() => go('remit')}
              >
                <Icon name="ph ph-receipt" size={16} />
                Remittances
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                style={{ flex: '1 1 auto', minWidth: 'fit-content', gap: 7 }}
                onClick={() => go(payroll ? 'recon' : 'debit')}
              >
                <Icon name={payroll ? 'ph ph-git-diff' : 'ph ph-arrows-clockwise'} size={16} />
                {payroll ? 'Open reconciliation' : 'Open the debit run'}
              </button>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: C.faint, marginTop: 11 }}>
              {payroll
                ? 'Federal MDAs send this to the IPPIS unit, states to the Accountant-General, employers to their own finance team. Same file, three doors, one exceptions queue.'
                : 'Self-paying members reconcile the same day, so this console only ever chases failed debits — never a ministry.'}
            </div>
          </Panel>
        </div>

        <div>
          <Kicker size={9.5}>MEMBERSHIP MOVEMENT · AUGUST</Kicker>
          <Panel pad={16} style={{ marginTop: 9, padding: '4px 16px' }}>
            {MOVEMENT.map((m, i) => {
              const skin = tone(m.tone)
              return (
                <div
                  key={m.k}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '12px 0',
                    borderBottom: `1px solid ${i === MOVEMENT.length - 1 ? 'transparent' : C.line7}`,
                  }}
                >
                  <Icon name={m.icon} size={17} color={skin.ic} />
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{m.k}</span>
                  <Mono size={14} weight={500} color={skin.ic}>{m.v}</Mono>
                </div>
              )
            })}
            <div style={{ padding: '12px 0 14px', fontSize: 12, lineHeight: 1.5, color: C.faint }}>
              Movement changes next month's schedule total. Leavers keep cover for 60 days on direct debit unless you
              close it.
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}

/** "₦21.0m" — the scale a cycle is read at, not the kobo it is stored in. */
function millions(minor: number | null | undefined): string {
  if (minor == null) return '—'
  const naira = minor / 100
  if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(1)}m`
  if (naira >= 1_000) return `₦${Math.round(naira / 1_000)}k`
  return `₦${Math.round(naira)}`
}
