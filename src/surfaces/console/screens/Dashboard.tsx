import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { PageSub, PageTitle, Panel } from '../../../components/surface'
import { C } from '../../../theme/tokens'
import { MOVEMENT, tone } from '../data'
import { useConsole } from '../state'

export function ConsoleDashboard() {
  const { payroll, profile, late, go } = useConsole()

  const cycleState = payroll ? (late ? 'File overdue' : 'Reconciling') : 'Retrying'
  const cycleSkin = late ? tone('clay') : tone('ochre')

  const stats = payroll
    ? [
        { v: profile.count, k: 'Members on this sponsor', tag: 'ROSTER', icon: 'ph ph-users-three', alert: false },
        { v: '₦21.0m', k: 'Scheduled for August', tag: 'SCHEDULED', icon: 'ph ph-arrow-up-right', alert: false },
        {
          v: late ? '—' : '99.6%',
          k: late ? 'No file returned yet' : 'Returned in the August file',
          tag: 'RETURNED', icon: 'ph ph-file-text', alert: late,
        },
        {
          v: late ? '8,412' : '57',
          k: late ? 'Members waiting on the file' : 'Exceptions to clear',
          tag: 'EXCEPTIONS', icon: 'ph ph-warning-diamond', alert: true,
        },
      ]
    : [
        { v: profile.count, k: 'Self-paying members', tag: 'ROSTER', icon: 'ph ph-users-three', alert: false },
        { v: '₦3.1m', k: 'Presented on 28 August', tag: 'PRESENTED', icon: 'ph ph-arrow-up-right', alert: false },
        { v: '96.0%', k: 'Settled the same day', tag: 'SETTLED', icon: 'ph ph-check-circle', alert: false },
        { v: '51', k: 'Failed debits to work', tag: 'FAILED', icon: 'ph ph-warning-diamond', alert: true },
      ]

  const tasks = [
    {
      title: payroll ? 'Clear the exceptions queue' : 'Retry the failed debits',
      sub: payroll ? 'Blocks the next payroll run' : 'Second attempt due 04.09',
      count: payroll ? '57' : '51',
      icon: 'ph ph-git-diff', skin: tone('clay'),
      to: payroll ? ('recon' as const) : ('debit' as const),
    },
    {
      title: 'Members with no beneficiary', sub: 'Chase before annual confirmation', count: '203',
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
  const cycle = payroll
    ? [
        { title: 'Schedule sent', sub: '8,412 members · ₦21,030,000', when: '02.08', done: true },
        { title: `With ${profile.destShort}`, sub: 'No API — the file sits on a desk for the month', when: '02–26.08', done: true },
        {
          title: late ? 'Return file overdue' : 'Return file received',
          sub: late ? 'Expected 28.08 · chased twice' : '8,381 deductions · 31 with no matching member',
          when: late ? 'overdue' : '28.08',
          done: !late,
        },
        {
          title: 'Reconciled and members told',
          sub: late ? 'Cannot start until the file arrives' : 'Blocked until the 57 exceptions are cleared',
          when: 'pending', done: false,
        },
      ]
    : [
        { title: 'Mandate batch queued', sub: '1,240 members · ₦3,100,000', when: '26.08', done: true },
        { title: 'Debits presented', sub: 'NIBSS direct debit, card as fallback', when: '28.08', done: true },
        { title: 'Results returned', sub: 'Same day — the one rail that answers live', when: '28.08', done: true },
        { title: 'Retries and dunning', sub: '41 insufficient funds · retry 04.09', when: 'running', done: false },
      ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <PageTitle>{payroll ? 'August deduction cycle' : 'August collection run'}</PageTitle>
          <PageSub style={{ lineHeight: 1.5 }}>
            {payroll
              ? `Schedule sent 02.08 · return file ${late ? 'still outstanding' : 'received 28.08'}`
              : '1,240 mandates presented 28.08 · settled the same day'}
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
            <Mono size={10} color={C.faint}>AUGUST 2026 CYCLE</Mono>
          </div>
        </div>
      </div>

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
