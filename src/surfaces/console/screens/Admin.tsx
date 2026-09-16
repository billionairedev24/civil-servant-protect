import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { PageSub, PageTitle, Panel } from '../../../components/surface'
import { C } from '../../../theme/tokens'
import { PERIODS, RECENT_EXPORTS, REPORTS, tone } from '../data'
import { useConsole } from '../state'
import { AUDIT_TRAIL, CONSOLE_USERS_FIXTURE, SPONSOR_DASHBOARD } from '../../../api/fixtures'
import { useAuditTrail, useConsoleUsers, useSponsorDashboard } from '../../../api/queries'
import { NotLive, dayFirst, useLive } from '../../../api/live'
import { initialsOf } from '../../../data/member'

/**
 * When somebody was last here, in the words an admin uses.
 *
 * "Never signed in" is the one that matters: an account nobody has used is an
 * account nobody would notice being used.
 */
function lastSeen(at: string | null): string {
  if (!at) return 'Never signed in'
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 21) return `${days} days ago`
  return dayFirst(at)
}

export function ConsoleSettings() {
  const { payroll, profile, sponsor } = useConsole()
  const { data: dash } = useLive(useSponsorDashboard(SPONSOR_DASHBOARD), SPONSOR_DASHBOARD)
  const { data: people, failed } = useLive(
    useConsoleUsers(dash.sponsor.id, CONSOLE_USERS_FIXTURE),
    CONSOLE_USERS_FIXTURE,
  )
  const { data: trail } = useLive(useAuditTrail(dash.sponsor.id, AUDIT_TRAIL), AUDIT_TRAIL)

  const settings = [
    { k: 'Deduction code', v: profile.code, note: 'Quoted on every row of the schedule' },
    { k: 'Payroll cut-off', v: payroll ? '5th' : '28th', note: payroll ? 'Schedule must be with them by this date' : 'Debits presented on this date' },
    { k: 'Expected return', v: payroll ? '28th' : 'same day', note: payroll ? 'When the file should come back' : 'Direct debit answers immediately' },
    { k: 'Grace period', v: '60 days', note: 'Before cover lapses for non-payment' },
    { k: 'Collections account', v: 'GTB ••4471', note: 'Where the remittance lands' },
  ]

  const contacts = payroll
    ? [
        { name: 'Mrs O. Adeleke', role: `${profile.dest} · deduction desk`, icon: 'ph ph-user-circle' },
        { name: 'Payroll helpdesk', role: 'Escalation after 7 days overdue', icon: 'ph ph-phone' },
      ]
    : [
        { name: 'NIBSS support', role: 'Mandate and settlement queries', icon: 'ph ph-bank' },
        { name: 'CSP operations', role: 'Failed debit escalation', icon: 'ph ph-headset' },
      ]

  return (
    <>
      <PageTitle>Sponsor settings</PageTitle>
      <PageSub style={{ lineHeight: 1.55, maxWidth: 640 }}>
        Who can act on behalf of {sponsor.org}, and the details that decide how money is collected.
      </PageSub>

      {failed && <NotLive what="This list" />}

      <Kicker size={9.5} style={{ marginTop: 22 }}>PEOPLE WITH ACCESS</Kicker>
      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {people.users.map((u) => {
          /* Green for the two who move money between them, ochre for an
             account nobody has used, neutral for read-only. The colour is the
             authority, not the person. */
          const t = u.disabled
            ? ('clay' as const)
            : u.lastSeenAt === null
              ? ('ochre' as const)
              : u.permissions.length > 1
                ? ('green' as const)
                : ('neutral' as const)
          const skin = tone(t)
          return (
            <div
              key={u.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px',
                border: `1px solid ${C.line}`, borderRadius: 11, background: C.white, flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  flex: 'none', width: 32, height: 32, borderRadius: '50%',
                  background: t === 'neutral' ? C.hover : skin.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: t === 'neutral' ? C.mut : skin.fg,
                }}
              >
                {initialsOf(u.name)}
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{u.name}</div>
                <div style={{ fontSize: 12, color: C.faint, marginTop: 1 }}>
                  {u.email ?? 'No email on file'}
                </div>
              </div>
              <span
                style={{
                  flex: 'none', fontSize: 12.5, fontWeight: 600, color: t === 'neutral' ? C.mut : skin.fg,
                  background: t === 'neutral' ? C.white : skin.bg,
                  border: `1px solid ${t === 'neutral' ? C.line : skin.bc}`,
                  borderRadius: 99, padding: '4px 11px', minWidth: 78, textAlign: 'center',
                }}
                /* What the role may actually do, rather than a word for it.
                   This screen hands out authority; the tooltip is the list the
                   server checks. */
                title={u.permissions.join(', ').toLowerCase().replace(/_/g, ' ')}
              >
                {u.roleLabel}
              </span>
              <span style={{ flex: 'none', fontSize: 12, color: C.faint, minWidth: 104 }}>
                {u.disabled ? 'Disabled' : lastSeen(u.lastSeenAt)}
              </span>
              <button
                type="button"
                aria-label={`Actions for ${u.name}`}
                style={{
                  flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, border: `1px solid ${C.line}`, borderRadius: '50%',
                  background: C.white, color: C.faint, cursor: 'pointer',
                }}
              >
                <Icon name="ph ph-dots-three" size={16} />
              </button>
            </div>
          )
        })}
        <button type="button" className="btn btn-md btn-tinted" style={{ height: 50, gap: 8 }}>
          <Icon name="ph ph-user-plus" size={16} />
          Invite someone
        </button>
      </div>

      {/* The control an internal auditor asks about first. */}
      <div style={{ marginTop: 14, padding: '15px 16px', border: `1px solid ${C.gBorder}`, borderRadius: 12, background: C.white }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="ph ph-users-three" size={17} color={C.g} />
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Two people, always</div>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: C.mut, marginTop: 5 }}>
          A preparer builds the schedule, an approver releases it. Nobody can change what payroll deducts on their own —
          this is the control an internal auditor will ask about first.
        </div>
      </div>

      {/* The trail itself, not a promise that one exists.
          "Showing your working" is the whole design of the maker–checker rule,
          and a control an officer cannot see is one they have to take on
          trust — which is what an auditor is there to not do. */}
      <Kicker size={9.5} style={{ marginTop: 26 }}>
        {trail.entries.length > 0 ? 'WHAT HAS BEEN DONE HERE' : 'NOTHING RECORDED YET'}
      </Kicker>
      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {trail.entries.slice(0, 8).map((e, i) => (
          <div
            key={`${e.at}-${i}`}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 12, padding: '11px 14px',
              border: `1px solid ${C.line7}`, borderRadius: 10, background: '#FDFDFB', flexWrap: 'wrap',
            }}
          >
            <Mono size={11.5} color={C.faint} style={{ flex: 'none', minWidth: 92 }}>
              {dayFirst(e.at)}
            </Mono>
            <span style={{ flex: 1, minWidth: 180, fontSize: 13 }}>
              {/* The action as the server recorded it. Prettified, never
                  reworded: "exception.resolved" is what the audit row says and
                  what somebody will search for. */}
              {e.action.replace(/[._]/g, ' ')}
            </span>
            <span style={{ flex: 'none', fontSize: 12.5, color: C.mut }}>
              {e.actorName ?? 'System'}
            </span>
          </div>
        ))}
      </div>

      <Kicker size={9.5} style={{ marginTop: 26 }}>COLLECTION DETAILS</Kicker>
      <div
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(258px,1fr))',
          gap: 12, marginTop: 9, alignItems: 'start',
        }}
      >
        <Panel pad={16} style={{ padding: '4px 16px' }}>
          {settings.map((sr, i) => (
            <div
              key={sr.k}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                padding: '13px 0',
                borderBottom: `1px solid ${i === settings.length - 1 ? 'transparent' : C.line7}`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{sr.k}</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.4, color: C.faint, marginTop: 1 }}>{sr.note}</div>
              </div>
              <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Mono size={12.5} weight={500} style={{ textAlign: 'right' }}>{sr.v}</Mono>
                <Icon name="ph ph-pencil-simple" size={13} color={C.ghost2} />
              </div>
            </div>
          ))}
        </Panel>

        <Panel pad={17}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Who to chase when the file is late</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: C.mut, marginTop: 6 }}>{profile.chase}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 13 }}>
            {contacts.map((ct) => (
              <div
                key={ct.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
                  border: `1px solid ${C.line7}`, borderRadius: 10, background: '#FDFDFB',
                }}
              >
                <Icon name={ct.icon} size={16} color={C.g} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{ct.name}</div>
                  <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>{ct.role}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  )
}

export function ConsoleReports() {
  const { period, set } = useConsole()

  return (
    <>
      <PageTitle>Reports</PageTitle>
      <PageSub style={{ lineHeight: 1.55, maxWidth: 660 }}>
        Everything a finance officer gets asked for at year end, and the one report nobody asks for until it is too
        late.
      </PageSub>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20, alignItems: 'center' }}>
        <Kicker size={9.5}>PERIOD</Kicker>
        {PERIODS.map((name, i) => {
          const on = period === i
          return (
            <button
              key={name}
              type="button"
              className="chip"
              onClick={() => set({ period: i })}
              style={{
                padding: '8px 13px', borderRadius: 999,
                border: `1.5px solid ${on ? C.g : C.line3}`,
                background: on ? C.gTint : C.white,
                color: on ? C.gd : C.ink,
                fontSize: 12.5, fontWeight: on ? 600 : 500,
              }}
            >
              {name}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(268px,1fr))', gap: 10, marginTop: 14 }}>
        {REPORTS.map((rp) => {
          const skin = tone(rp.tone)
          return (
            <div
              key={rp.title}
              style={{
                display: 'flex', flexDirection: 'column', padding: 17,
                border: `1px solid ${rp.tone === 'neutral' ? C.line : skin.bc}`,
                borderRadius: 12, background: C.white,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Icon name={rp.icon} size={19} color={rp.tone === 'clay' ? C.clay : C.g} />
                <div style={{ flex: 1, fontSize: 14.5, fontWeight: 700 }}>{rp.title}</div>
              </div>
              <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.5, color: C.mut, marginTop: 7 }}>{rp.sub}</div>
              <div style={{ display: 'flex', gap: 7, marginTop: 13, flexWrap: 'wrap' }}>
                {['CSV', 'PDF'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1, minWidth: 78, height: 40, padding: '0 13px', fontSize: 13 }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <Kicker size={9.5} style={{ marginTop: 26 }}>RECENT EXPORTS</Kicker>
      <Panel pad={16} style={{ marginTop: 9, padding: '4px 16px' }}>
        {RECENT_EXPORTS.map((ex, i) => (
          <div
            key={ex.name}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', flexWrap: 'wrap',
              borderBottom: `1px solid ${i === RECENT_EXPORTS.length - 1 ? 'transparent' : C.line7}`,
            }}
          >
            <Icon name={ex.icon} size={16} color={C.faint} />
            <span style={{ flex: 1, minWidth: 170, fontSize: 13.5, fontWeight: 500 }}>{ex.name}</span>
            <span style={{ flex: 'none', fontSize: 12, color: C.faint, minWidth: 112 }}>{ex.who}</span>
            <Mono size={11.5} color={C.faint} style={{ minWidth: 74 }}>{ex.when}</Mono>
            <button
              type="button"
              aria-label={`Download ${ex.name}`}
              style={{
                flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, border: `1px solid ${C.line}`, borderRadius: '50%',
                background: C.white, color: C.faint, cursor: 'pointer',
              }}
            >
              <Icon name="ph ph-download-simple" size={15} />
            </button>
          </div>
        ))}
        {/* Member-level files carry NINs, so downloads are traceable by design. */}
        <div style={{ padding: '12px 0 14px', fontSize: 12, lineHeight: 1.5, color: C.faint }}>
          Every export is logged with the person who ran it. Member-level files carry NINs, so downloads are traceable
          by design.
        </div>
      </Panel>
    </>
  )
}
