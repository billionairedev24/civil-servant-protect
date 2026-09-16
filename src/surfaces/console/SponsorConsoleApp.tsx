import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Mono } from '../../components/primitives'
import { BP, useMediaQuery } from '../../components/useMediaQuery'
import type { SponsorId } from '../../data/sponsors'
import { C } from '../../theme/tokens'
import {
  CONSOLE_GROUPS, CONSOLE_NAV, CONSOLE_TABS, CONSOLE_URLS, consoleScreenForPath, type ConsoleScreen,
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

/**
 * The sponsor console.
 *
 * Desktop-first — finance officers work on a monitor — but it collapses to a
 * bottom tab bar rather than degrading, because the HR officer in a state
 * secretariat is often on a handset and needs the same screens, not fewer.
 */
export function SponsorConsoleApp({
  sponsorId,
  setSponsor,
  demo,
}: {
  sponsorId: SponsorId
  setSponsor: (id: SponsorId) => void
  demo: { late: boolean; offline: boolean; sun: boolean }
}) {
  // A finance officer forwards "the November exception on CSP-114-88214" to a
  // colleague by pasting the address bar, so the record id lives in the URL.
  const { pathname } = useLocation()
  const nav = useNavigate()
  const navigate = (to: ConsoleScreen) =>
    nav({ pathname: CONSOLE_URLS[to], search: window.location.search })

  return (
    <ConsoleStateProvider
      sponsorId={sponsorId}
      setSponsor={setSponsor}
      screen={consoleScreenForPath(pathname)}
      navigate={navigate}
      demo={demo}
    >
      <Shell />
    </ConsoleStateProvider>
  )
}

function Shell() {
  const { screen } = useConsole()
  const Body = SCREENS[screen]
  const wide = useMediaQuery(BP.smallDesktop)

  return (
    <div
      style={{
        height: wide ? undefined : '100dvh',
        minHeight: wide ? '100dvh' : undefined,
        overflow: wide ? undefined : 'hidden',
        display: 'flex',
        background: C.surface,
      }}
    >
      {wide && <SideNav />}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!wide && <MobileHeader />}
        <main
          style={{
            flex: 1, minWidth: 0,
            overflowY: wide ? undefined : 'auto',
            padding: wide ? '26px clamp(20px, 2.5vw, 30px) 40px' : '16px 16px 30px',
          }}
        >
          <Body />
        </main>
        {!wide && <MobileTabs />}
      </div>
    </div>
  )
}

function SideNav() {
  const { screen, sponsor, payroll, go } = useConsole()

  const badgeFor = (badge?: 'recon' | 'claims') =>
    badge === 'recon' ? (payroll ? '57' : '51') : badge === 'claims' ? '4' : ''

  return (
    <nav
      aria-label="Main"
      style={{
        flex: 'none', width: 224, display: 'flex', flexDirection: 'column',
        background: C.white, borderRight: `1px solid ${C.line}`,
        position: 'sticky', top: 0, height: '100dvh',
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
            <Mono size={9} color={C.faint} style={{ letterSpacing: '.12em', padding: '0 8px 6px', display: 'block' }}>
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
                    aria-current={on ? 'page' : undefined}
                    onClick={() => go(it.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left',
                      minHeight: 40, padding: '8px 9px', border: 0, borderRadius: 8,
                      background: on ? C.gTint : 'transparent',
                      color: on ? C.gd : C.mut,
                      fontSize: 13, fontWeight: on ? 600 : 500, cursor: 'pointer',
                    }}
                  >
                    <Icon name={it.icon} size={16} color={on ? C.g : C.faint} />
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
    </nav>
  )
}

function MobileHeader() {
  const { sponsor } = useConsole()
  return (
    <header
      style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', background: C.white, borderBottom: `1px solid ${C.line}`,
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
    </header>
  )
}

function MobileTabs() {
  const { screen, go } = useConsole()
  return (
    <nav
      aria-label="Main"
      style={{
        flex: 'none', display: 'flex', justifyContent: 'space-around', gap: 2,
        padding: '9px 10px calc(9px + env(safe-area-inset-bottom, 15px))',
        background: 'rgba(247,246,242,.96)', backdropFilter: 'blur(12px)',
        borderTop: `1px solid ${C.line}`,
      }}
    >
      {CONSOLE_TABS.map((tb) => {
        const on = screen === tb.to
        return (
          <button
            key={tb.to}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => go(tb.to)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              minHeight: 44, padding: '5px 2px', border: 0, background: 'transparent', cursor: 'pointer',
            }}
          >
            <Icon name={`${on ? 'ph-fill ph-' : 'ph ph-'}${tb.icon}`} size={22} color={on ? C.g : C.faint} />
            <span style={{ fontSize: 10.5, fontWeight: on ? 600 : 500, color: on ? C.g : C.faint }}>{tb.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
