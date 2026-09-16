import { Icon } from '../../components/Icon'
import { Kicker, Mono } from '../../components/primitives'
import { SPONSORS, type SponsorId } from '../../data/sponsors'
import { C, MONO } from '../../theme/tokens'
import {
  CONSOLE_FRAME, CONSOLE_GROUPS, CONSOLE_NAV, CONSOLE_TABS, MONEY_NOTES, type ConsoleScreen,
} from './nav'
import { ConsoleStateProvider, useConsole } from './state'
import { ConsoleDashboard } from './screens/Dashboard'
import { ConsoleSchedule } from './screens/Schedule'
import { ConsoleException, ConsoleRecon } from './screens/Recon'
import { ConsoleClaims, ConsoleMembers, ConsoleRoster } from './screens/People'
import { ConsoleDebit, ConsoleRemit } from './screens/Money'
import { ConsoleReports, ConsoleSettings } from './screens/Admin'

const SCREENS: Record<ConsoleScreen, () => JSX.Element> = {
  dash: ConsoleDashboard,
  upload: ConsoleSchedule,
  recon: ConsoleRecon,
  exception: ConsoleException,
  debit: ConsoleDebit,
  remit: ConsoleRemit,
  roster: ConsoleRoster,
  members: ConsoleMembers,
  claims: ConsoleClaims,
  settings: ConsoleSettings,
  reports: ConsoleReports,
}

export function ConsoleApp(props: { sponsorId: SponsorId; setSponsor: (id: SponsorId) => void }) {
  return (
    <ConsoleStateProvider {...props}>
      <ConsoleWorkbench />
    </ConsoleStateProvider>
  )
}

function ConsoleWorkbench() {
  return (
    <div style={{ display: 'flex', gap: 28, padding: '30px 34px 44px', alignItems: 'flex-start', minHeight: '100vh' }}>
      <IndexRail />
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <Frame />
        <HarnessControls />
      </div>
      <NotesRail />
    </div>
  )
}

function IndexRail() {
  const { screen, sponsor, setSponsor, device, set, go } = useConsole()

  return (
    <div style={{ flex: 'none', width: 206, position: 'sticky', top: 30, display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Mono size={10} color={C.g} weight={500} style={{ letterSpacing: '.12em' }}>CIVIL SERVANT PROTECT</Mono>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.02em' }}>Sponsor console</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: C.mut }}>
          The employer-side product. Eleven screens, driven by whichever collection rail the sponsor sits on.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 11, borderTop: `1px solid ${C.line2}` }}>
        <Kicker size={9.5}>SPONSOR TYPE</Kicker>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {SPONSORS.map((s) => {
            const on = sponsor.id === s.id
            return (
              <button
                key={s.id}
                type="button"
                className="chip"
                onClick={() => setSponsor(s.id)}
                style={{
                  padding: '5px 10px',
                  border: `1.5px solid ${on ? C.g : C.line2}`,
                  background: on ? C.gTint : 'transparent',
                  color: on ? C.gd : C.mut,
                  fontSize: 12, fontWeight: on ? 600 : 500,
                }}
              >
                <Icon name={s.icon} size={13} />
                {s.name}
              </button>
            )
          })}
        </div>
        <Mono size={10} color={C.faint} style={{ lineHeight: 1.5 }}>{sponsor.rail}</Mono>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 11, borderTop: `1px solid ${C.line2}` }}>
        <Kicker size={9.5}>VIEWING ON</Kicker>
        <div style={{ display: 'flex', gap: 5 }}>
          {([['Desktop', 'desktop', 'ph ph-monitor'], ['Phone', 'mobile', 'ph ph-device-mobile']] as const).map(
            ([name, id, icon]) => {
              const on = device === id
              return (
                <button
                  key={id}
                  type="button"
                  className="chip"
                  onClick={() => set({ device: id })}
                  style={{
                    padding: '5px 11px',
                    border: `1.5px solid ${on ? C.g : C.line2}`,
                    background: on ? C.gTint : 'transparent',
                    color: on ? C.gd : C.mut,
                    fontSize: 12, fontWeight: on ? 600 : 500,
                  }}
                >
                  <Icon name={icon} size={13} />
                  {name}
                </button>
              )
            },
          )}
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.faint }}>
          Finance officers work on desktop; the HR officer in a state secretariat is often on a phone.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 11, borderTop: `1px solid ${C.line2}` }}>
        {CONSOLE_NAV.map((it) => {
          const on = screen === it.id
          return (
            <button
              key={it.id}
              type="button"
              className="nav-item"
              onClick={() => go(it.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                textAlign: 'left', padding: '6px 9px', border: 0, borderRadius: 7,
                background: on ? C.hover : 'transparent',
                color: on ? C.ink : C.mut,
                fontSize: 12.5, fontWeight: on ? 600 : 400, cursor: 'pointer',
              }}
            >
              {it.label}
              <Mono size={9} color={on ? C.mut : C.ghost}>{it.group}</Mono>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Frame() {
  const { device } = useConsole()
  const f = CONSOLE_FRAME[device]
  const desk = device === 'desktop'

  return (
    <div
      style={{
        width: f.w, height: f.h, background: C.surface, border: f.border, borderRadius: f.radius,
        boxShadow: '0 24px 60px rgba(20,24,27,.22)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {desk ? <ChromeBar /> : <StatusBar />}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {desk && <SideNav />}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {!desk && <MobileHeader />}
          <Body />
          {!desk && <MobileTabs />}
        </div>
      </div>
    </div>
  )
}

function Body() {
  const { screen, device } = useConsole()
  const Screen = SCREENS[screen]
  return (
    <div className="rise" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: CONSOLE_FRAME[device].pad }}>
      <Screen />
    </div>
  )
}

function ChromeBar() {
  return (
    <div
      style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px',
        height: 38, background: C.line5, borderBottom: `1px solid ${C.line2}`,
      }}
    >
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: '#D2CFC4' }} />
      ))}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '4px 16px', borderRadius: 7,
            background: C.surface, fontFamily: MONO, fontSize: 11, color: C.faint,
          }}
        >
          <Icon name="ph ph-lock-simple" size={11} color={C.g} />
          sponsor.civilservantprotect.ng
        </div>
      </div>
      <div style={{ width: 78 }} />
    </div>
  )
}

function StatusBar() {
  return (
    <div
      style={{
        flex: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '13px 24px 4px', fontSize: 12.5, fontWeight: 600,
      }}
    >
      <span>09:41</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center', color: C.mut }}>
        <Icon name="ph-fill ph-cell-signal-medium" size={13} />
        <Icon name="ph-fill ph-battery-medium" size={15} />
      </span>
    </div>
  )
}

function SideNav() {
  const { screen, sponsor, payroll, go } = useConsole()

  const badgeFor = (badge?: 'recon' | 'claims') =>
    badge === 'recon' ? (payroll ? '57' : '51') : badge === 'claims' ? '4' : ''

  return (
    <div
      style={{
        flex: 'none', width: 224, display: 'flex', flexDirection: 'column',
        background: C.white, borderRight: `1px solid ${C.line}`,
      }}
    >
      <div style={{ padding: '17px 16px 15px', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              flex: 'none', width: 30, height: 30, borderRadius: 8, background: C.g,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="ph-fill ph-shield-check" size={17} color={C.surface} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13.5, fontWeight: 700, letterSpacing: '-.01em',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {sponsor.org}
            </div>
            <Mono size={9} color={C.g} style={{ letterSpacing: '.1em' }}>{sponsor.tag} SPONSOR</Mono>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 10px' }}>
        {CONSOLE_GROUPS.map((group) => (
          <div key={group} style={{ marginBottom: 16 }}>
            <Mono size={9} color={C.ghost} style={{ letterSpacing: '.12em', padding: '0 8px 6px', display: 'block' }}>
              {group}
            </Mono>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {CONSOLE_NAV.filter((n) => n.group === group).map((it) => {
                const on = screen === it.id
                const badge = badgeFor(it.badge)
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => go(it.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left',
                      padding: '8px 9px', border: 0, borderRadius: 8,
                      background: on ? C.gTint : 'transparent',
                      color: on ? C.gd : C.mut,
                      fontSize: 13, fontWeight: on ? 600 : 500, cursor: 'pointer',
                      transition: 'background .12s',
                    }}
                  >
                    <Icon name={it.icon} size={16} color={on ? C.g : C.ghost} />
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.label}
                    </span>
                    {badge && (
                      <Mono
                        size={10}
                        weight={500}
                        color={C.clay}
                        style={{ flex: 'none', background: C.clayBg, borderRadius: 99, padding: '2px 7px' }}
                      >
                        {badge}
                      </Mono>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          flex: 'none', padding: '12px 14px', borderTop: `1px solid ${C.line}`,
          display: 'flex', alignItems: 'center', gap: 9,
        }}
      >
        <div
          style={{
            flex: 'none', width: 28, height: 28, borderRadius: '50%', background: C.hover,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11.5, fontWeight: 700, color: C.mut,
          }}
        >
          AB
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Amina Bello
          </div>
          <div style={{ fontSize: 11, color: C.faint }}>Preparer</div>
        </div>
        <Icon name="ph ph-caret-up-down" size={13} color={C.ghost2} />
      </div>
    </div>
  )
}

function MobileHeader() {
  const { sponsor } = useConsole()
  return (
    <div
      style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 18px 12px', borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div
        style={{
          flex: 'none', width: 28, height: 28, borderRadius: 8, background: C.g,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon name="ph-fill ph-shield-check" size={16} color={C.surface} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sponsor.org}
        </div>
        <Mono size={9} color={C.g} style={{ letterSpacing: '.1em' }}>{sponsor.tag} SPONSOR</Mono>
      </div>
      <div
        style={{
          flex: 'none', width: 28, height: 28, borderRadius: '50%', background: C.hover,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: C.mut,
        }}
      >
        AB
      </div>
    </div>
  )
}

function MobileTabs() {
  const { screen, go } = useConsole()
  return (
    <div
      style={{
        flex: 'none', display: 'flex', justifyContent: 'space-around', gap: 2,
        padding: '9px 10px 24px', background: 'rgba(247,246,242,.96)', borderTop: `1px solid ${C.line}`,
      }}
    >
      {CONSOLE_TABS.map((tb) => {
        const on = screen === tb.to
        return (
          <button
            key={tb.to}
            type="button"
            onClick={() => go(tb.to)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '5px 2px', border: 0, background: 'transparent', cursor: 'pointer',
            }}
          >
            <Icon name={`${on ? 'ph-fill ph-' : 'ph ph-'}${tb.icon}`} size={22} color={on ? C.g : C.faint} />
            <span style={{ fontSize: 10.5, fontWeight: on ? 600 : 500, color: on ? C.g : C.faint }}>{tb.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function HarnessControls() {
  const { payroll, late, set, go } = useConsole()
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={() => set({ late: !late })}
        style={{
          flex: 1, minWidth: 150, padding: 10, borderRadius: 8, background: C.white, cursor: 'pointer',
          border: `1px solid ${late ? C.ochreBorder : C.line3}`,
          color: late ? C.ochre : C.mut, fontSize: 12.5, fontWeight: 500,
        }}
      >
        {late
          ? payroll ? 'Return file has arrived' : 'Debits have settled'
          : payroll ? 'Simulate a late return file' : 'Simulate failed debits'}
      </button>
      <button
        type="button"
        onClick={() => go('dash')}
        style={{
          flex: 1, minWidth: 150, padding: 10, border: `1px solid ${C.line3}`, borderRadius: 8,
          background: C.white, color: C.mut, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
        }}
      >
        Back to the dashboard
      </button>
    </div>
  )
}

function NotesRail() {
  const { sponsor, profile } = useConsole()
  return (
    <div
      style={{
        flex: 1, minWidth: 225, maxWidth: 305, position: 'sticky', top: 30,
        display: 'flex', flexDirection: 'column', gap: 15,
      }}
    >
      <div>
        <Kicker size={9.5}>HOW THE MONEY ACTUALLY ARRIVES</Kicker>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 11 }}>
          {MONEY_NOTES.map((n) => (
            <div key={n.n} style={{ display: 'flex', gap: 9 }}>
              <Mono size={11} color={C.g} style={{ flex: 'none', paddingTop: 2 }}>{n.n}</Mono>
              <span>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.g }}>{n.t}</span>
                <span style={{ display: 'block', fontSize: 13, lineHeight: 1.55, color: C.mut, marginTop: 2 }}>{n.b}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 1, background: C.line2 }} />
      <div>
        <Kicker size={9.5}>THIS SPONSOR</Kicker>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em', marginTop: 4 }}>{sponsor.org}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: C.mut, marginTop: 6 }}>{profile.note}</div>
      </div>
    </div>
  )
}
