import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { PageSub, PageTitle, Panel } from '../../../components/surface'
import { C } from '../../../theme/tokens'
import { REMIT_ROWS, tone } from '../data'
import { useConsole } from '../state'
import { DEBIT_RUN, SPONSOR_DASHBOARD } from '../../../api/fixtures'
import { useDebitRun, useSponsorDashboard } from '../../../api/queries'
import { NotLive, dayFirst, periodLabel, titleCase, useLive } from '../../../api/live'

/**
 * The direct-debit run. On a payroll rail this only covers the people the file
 * missed; on self-pay it is the whole collection — and the only rail that
 * answers the same day.
 */
/**
 * What each failure means, and whether anybody here can do something about it.
 *
 * The distinction is the reason this screen is worth opening. An empty account
 * on the 28th is often a full one on the 4th, so that one is retried and needs
 * nobody. A revoked mandate is the bank being told to stop — only the member can
 * tell it otherwise, and a screen that offers "retry" for that teaches an
 * officer to press a button for a fortnight.
 */
const DEBIT_FAILURES: Record<string, { title: string; sub: string }> = {
  no_funds: {
    title: 'Insufficient funds',
    sub: 'Most clear on the second attempt, after salaries land',
  },
  mandate_revoked: {
    title: 'Mandate revoked at the bank',
    sub: 'The member must re-authorise — we cannot do it for them',
  },
  card_expired: {
    title: 'Card expired',
    sub: 'In-app prompt and an SMS; nothing happens until they replace it',
  },
}

export function ConsoleDebit() {
  const { payroll: demoPayroll, profile, go } = useConsole()
  const { data: dash } = useLive(useSponsorDashboard(SPONSOR_DASHBOARD), SPONSOR_DASHBOARD)
  const { data: run, failed, live } = useLive(useDebitRun(dash.sponsor.id, DEBIT_RUN), DEBIT_RUN)

  /*
   * Which rail this sponsor is on, from the server when there is one.
   *
   * `payroll` in the console's own state is the demo rail switcher — the thing
   * that re-renders every screen as a different sponsor so four collection
   * rails can be reviewed without four backends. Live, it is not the officer's
   * sponsor, and this screen told a self-paying sponsor that they collect
   * through payroll.
   */
  const payroll = live ? run.method === 'payroll' : demoPayroll

  const counts = run.counts
  const needMember = run.failures.filter((f) => f.memberMustAct).reduce((n, f) => n + f.count, 0)
  const retryable = run.failures.filter((f) => !f.memberMustAct).reduce((n, f) => n + f.count, 0)

  const stats = [
    { v: counts.presented, k: 'Presented', t: 'neutral' as const },
    { v: counts.settled, k: payroll ? 'Settled' : 'Settled same day', t: 'green' as const },
    { v: retryable, k: 'Insufficient funds', t: 'ochre' as const },
    { v: needMember, k: 'Revoked or expired', t: 'clay' as const },
  ]

  /*
   * The ladder, weighted by what is actually left at each rung rather than by a
   * fixed set of widths. A bar that always looks the same is decoration.
   */
  const retryBar = [
    { flex: Math.max(1, counts.settled), bg: C.g },
    { flex: Math.max(1, retryable), bg: C.ochreBorder },
    { flex: Math.max(1, needMember), bg: C.clayBorder2 },
  ]

  const steps: [string, string][] = [
    ['First attempt', run.timeline.presented],
    ['Second attempt', run.timeline.retried],
    ['Card fallback', run.timeline.cardFallback],
    ['Grace ends', run.timeline.graceEnds],
  ]

  return (
    <>
      <PageTitle>Direct-debit run</PageTitle>
      <PageSub style={{ lineHeight: 1.55, maxWidth: 660 }}>
        The only rail that answers the same day. Mandates are presented through NIBSS with the card on file as fallback,
        so you know who paid within hours rather than weeks.
      </PageSub>

      {payroll && (
        <div
          style={{
            display: 'flex', gap: 11, alignItems: 'flex-start', marginTop: 18, padding: '14px 15px',
            border: `1.5px solid ${C.ochreBorder}`, borderRadius: 12, background: C.ochreBg,
          }}
        >
          <Icon name="ph-fill ph-info" size={19} color={C.ochre} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ochreInk }}>This sponsor collects through payroll</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.ochre, marginTop: 3 }}>
              Debits here only cover members who left service or were missed by the file —{' '}
              {counts.presented.toLocaleString('en-NG')} this month. The main collection is the{' '}
              <button
                type="button"
                onClick={() => go('upload')}
                style={{ border: 0, background: 'transparent', padding: 0, color: C.g, font: 'inherit', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                monthly schedule
              </button>
              .
            </div>
          </div>
        </div>
      )}

      <Panel pad={18} style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <Kicker size={9.5}>
              {periodLabel(run.period)} · PRESENTED {dayFirst(run.timeline.presented)}
            </Kicker>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em', marginTop: 5 }}>
              {counts.settled.toLocaleString('en-NG')} settled of{' '}
              {counts.presented.toLocaleString('en-NG')} presented
            </div>
          </div>
          {/* Only the ones a retry can help. Offering it for a revoked mandate
              is offering to press a button that cannot work. */}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            style={{ height: 44, padding: '0 18px', gap: 7 }}
            disabled={retryable === 0}
          >
            <Icon name="ph ph-arrows-clockwise" size={16} />
            {retryable === 0 ? 'Nothing to retry' : `Retry ${retryable.toLocaleString('en-NG')} now`}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(132px,1fr))', gap: 10, marginTop: 16 }}>
          {stats.map((s) => {
            const skin = tone(s.t)
            return (
              <div key={s.k} style={{ padding: '13px 14px', border: `1px solid ${skin.bc}`, borderRadius: 11, background: skin.bg }}>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.025em', color: s.t === 'neutral' ? C.ink : skin.fg }}>
                  {s.v.toLocaleString('en-NG')}
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.35, color: C.mut, marginTop: 2 }}>{s.k}</div>
              </div>
            )
          })}
        </div>
      </Panel>

      {failed && <NotLive what="This run" />}

      <Kicker size={9.5} style={{ marginTop: 24 }}>
        {run.failures.length > 0 ? 'WHY DEBITS FAILED' : 'NOTHING FAILED THIS RUN'}
      </Kicker>
      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {run.failures.map((f) => {
          const skin = tone(f.memberMustAct ? 'clay' : 'ochre')
          const known = DEBIT_FAILURES[f.kind]
          return (
            <div
              key={f.kind}
              style={{
                display: 'flex', alignItems: 'center', gap: 13, padding: '14px 15px',
                border: `1px solid ${skin.bc}`, borderRadius: 11, background: C.white, flexWrap: 'wrap',
              }}
            >
              <Mono size={17} weight={500} color={skin.ic} style={{ minWidth: 34 }}>
                {f.count.toLocaleString('en-NG')}
              </Mono>
              <span style={{ flex: 1, minWidth: 180 }}>
                {/* A kind the server knows and this screen does not is shown as
                    itself rather than dropped — a failure nobody can see is
                    worse than one with an ugly name. */}
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
                  {known?.title ?? titleCase(f.kind.replace(/_/g, ' '))}
                </span>
                {known && (
                  <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4, color: C.mut, marginTop: 2 }}>
                    {known.sub}
                  </span>
                )}
              </span>
              <span
                style={{
                  flex: 'none', fontSize: 12.5, fontWeight: 600, color: skin.ic, background: skin.bg,
                  border: `1px solid ${skin.bc}`, borderRadius: 99, padding: '4px 11px',
                }}
              >
                {f.memberMustAct ? 'Member must act' : `Retry ${dayFirst(run.timeline.retried)}`}
              </span>
            </div>
          )
        })}
      </div>

      {/* The list this screen exists for on a payroll rail. These members left
          the schedule with cover in force, and the only thing keeping it in
          force is a mandate somebody has to ask them to set up — while the main
          collection reports that everything is fine. */}
      {run.grace.length > 0 && (
        <>
          <Kicker size={9.5} style={{ marginTop: 24 }}>ON GRACE, NOT YET PAYING</Kicker>
          <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {run.grace.map((g) => {
              const skin = tone(g.daysLeft <= 14 ? 'clay' : 'ochre')
              return (
                <div
                  key={g.cspId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px',
                    border: `1px solid ${C.line}`, borderRadius: 11, background: C.white, flexWrap: 'wrap',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 170 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{g.name}</span>
                    <Mono size={11.5} color={C.faint} style={{ display: 'block', marginTop: 2 }}>
                      {g.cspId}
                    </Mono>
                  </span>
                  <span
                    style={{
                      flex: 'none', fontSize: 12.5, fontWeight: 600, color: skin.ic, background: skin.bg,
                      border: `1px solid ${skin.bc}`, borderRadius: 99, padding: '4px 11px',
                    }}
                  >
                    {g.daysLeft} days · cover to {dayFirst(g.graceUntil)}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Cover only lapses when the grace period runs out — not on a failed debit. */}
      <Kicker size={9.5} style={{ marginTop: 24 }}>RETRY LADDER</Kicker>
      <Panel pad={17} style={{ marginTop: 9 }}>
        <div style={{ display: 'flex', gap: 4, height: 12, borderRadius: 6, overflow: 'hidden', background: C.line7 }}>
          {retryBar.map((r, i) => (
            <div key={i} style={{ flex: r.flex, background: r.bg, borderRadius: 3 }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 11 }}>
          {steps.map(([label, on]) => (
            <div key={label} style={{ flex: 1, minWidth: 118 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
              <Mono size={11} color={C.faint} style={{ display: 'block', marginTop: 2 }}>
                {dayFirst(on)}
              </Mono>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: C.mut, marginTop: 13 }}>
          After the second retry the member is on the 60-day grace clock and gets an SMS with a USSD string, so they can
          pay without a smartphone. Cover only lapses when the grace period runs out.
        </div>
      </Panel>

      <div style={{ marginTop: 14, fontSize: 12, color: C.faint }}>
        Mandate reference on this rail: <Mono size={12}>{profile.code}</Mono>
      </div>
    </>
  )
}

/**
 * Remittances. One transfer covers thousands of members, so the credit alone
 * tells you nothing — it only becomes cover once matched to the return file.
 */
export function ConsoleRemit() {
  const { payroll, profile } = useConsole()

  const stats = [
    { v: payroll ? '₦20.95m' : '₦2.98m', k: 'Received in August', green: false },
    { v: payroll ? '99.6%' : '96.0%', k: 'Allocated to members', green: true },
    { v: payroll ? '₦77,500' : '₦124,000', k: 'Still unallocated', alert: true },
  ]

  const detail = [
    { k: 'Value date', v: '29.08.2026' },
    { k: 'Bank reference', v: 'NIBSS/8842119' },
    { k: 'From', v: payroll ? profile.dest : '1,189 member banks' },
    { k: 'Scheduled', v: '₦21,030,000' },
    { k: 'Variance', v: '−₦77,500' },
    { k: 'Members credited', v: '8,324' },
  ]

  return (
    <>
      <PageTitle>Remittances and receipts</PageTitle>
      <PageSub style={{ lineHeight: 1.55, maxWidth: 660 }}>
        {payroll
          ? 'One transfer covers thousands of members, so the credit alone tells you nothing. It only becomes real cover once it is matched to the return file, member by member.'
          : 'Every debit settles against a named member, so allocation is automatic. Receipts are issued the same day.'}
      </PageSub>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 20 }}>
        {stats.map((s) => (
          <Panel key={s.k} pad={16} style={{ padding: '15px 16px' }}>
            <div
              style={{
                fontSize: 24, fontWeight: 700, letterSpacing: '-.03em',
                color: s.alert ? C.clay : s.green ? C.gd : C.ink,
              }}
            >
              {s.v}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.35, color: C.mut, marginTop: 3 }}>{s.k}</div>
          </Panel>
        ))}
      </div>

      <div style={{ marginTop: 22, padding: 18, border: `1.5px solid ${C.gBorder}`, borderRadius: 12, background: C.white }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Icon name="ph-fill ph-check-circle" size={16} color={C.g} />
              <Mono size={9.5} color={C.g} style={{ letterSpacing: '.12em' }}>FULLY ALLOCATED · AUGUST 2026</Mono>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.03em', marginTop: 7 }}>₦20,952,500</div>
            <div style={{ fontSize: 13, color: C.mut, marginTop: 2 }}>Credited 29.08 · allocated to 8,324 members</div>
          </div>
          <button type="button" className="btn btn-sm btn-outline" style={{ height: 44, padding: '0 18px', gap: 7 }}>
            <Icon name="ph ph-file-pdf" size={16} />
            Receipt
          </button>
        </div>

        <div
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
            gap: '0 20px', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line7}`,
          }}
        >
          {detail.map((d) => (
            <div key={d.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0' }}>
              <span style={{ fontSize: 12.5, color: C.mut }}>{d.k}</span>
              <Mono size={12.5} weight={500} style={{ textAlign: 'right' }}>{d.v}</Mono>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: C.faint, marginTop: 12 }}>
          The credit and the return file are reconciled separately. ₦77,500 of this payment stayed unallocated until the
          31 unmatched rows were cleared.
        </div>
      </div>

      <Kicker size={9.5} style={{ marginTop: 24 }}>EARLIER PAYMENTS</Kicker>
      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {REMIT_ROWS.map((r) => {
          const skin = tone(r.tone)
          return (
            <div
              key={r.period}
              style={{
                display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px',
                border: `1px solid ${C.line}`, borderRadius: 11, background: C.white, flexWrap: 'wrap',
              }}
            >
              <Mono size={12} color={C.faint} style={{ minWidth: 62 }}>{r.period}</Mono>
              <Mono size={14} weight={500} style={{ minWidth: 104 }}>{r.amount}</Mono>
              <Mono size={11.5} color={C.faint} style={{ flex: 1, minWidth: 130 }}>{r.ref}</Mono>
              <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, minWidth: 126 }}>
                <Icon name={r.icon} size={14} color={skin.ic} />
                <span style={{ fontSize: 12.5, fontWeight: 500, color: skin.ic }}>{r.state}</span>
              </span>
              <button
                type="button"
                aria-label={`Download ${r.period} receipt`}
                style={{
                  flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, border: `1px solid ${C.line}`, borderRadius: '50%',
                  background: C.white, color: C.faint, cursor: 'pointer',
                }}
              >
                <Icon name="ph ph-download-simple" size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
