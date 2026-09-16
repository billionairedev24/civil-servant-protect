import { Icon } from '../../components/Icon'
import { Kicker, Mono } from '../../components/primitives'
import { LANGS, type Lang } from '../../i18n'
import { SPONSORS, type SponsorId } from '../../data/sponsors'
import { C, MONO } from '../../theme/tokens'
import { APP_GROUPS, APP_SCREENS, SIDE_GROUPS, URLS, WEB_FRAME, WNAV, type WebScreen } from './nav'
import { WEB_MEMBER } from './data'
import { WebStateProvider, useWeb } from './state'
import { WebBenePortal, WebEnrol, WebSignIn } from './screens/Public'
import { WebBenefits, WebCard, WebDashboard, WebFamily } from './screens/Cover'
import { WebBeneficiaries, WebContributions } from './screens/Money'
import { WebClaim, WebTrack } from './screens/Claims'
import { WebProfile } from './screens/Profile'

const SCREENS: Record<WebScreen, () => JSX.Element> = {
  signin: WebSignIn,
  enrol: WebEnrol,
  beneportal: WebBenePortal,
  home: WebDashboard,
  benefits: WebBenefits,
  card: WebCard,
  family: WebFamily,
  contrib: WebContributions,
  benes: WebBeneficiaries,
  claim: WebClaim,
  track: WebTrack,
  profile: WebProfile,
}

export function WebApp(props: {
  lang: Lang
  setLang: (l: Lang) => void
  sponsorId: SponsorId
  setSponsor: (id: SponsorId) => void
}) {
  return (
    <WebStateProvider {...props}>
      <WebWorkbench />
    </WebStateProvider>
  )
}

function WebWorkbench() {
  return (
    <div style={{ display: 'flex', gap: 28, padding: '30px 34px 44px', alignItems: 'flex-start', minHeight: '100vh' }}>
      <IndexRail />
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <BrowserFrame />
        <FrameCaption />
      </div>
    </div>
  )
}

function IndexRail() {
  const { screen, sponsor, setSponsor, lang, setLang, go } = useWeb()

  return (
    <div style={{ flex: 'none', width: 206, position: 'sticky', top: 30, display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Mono size={10} color={C.g} weight={500} style={{ letterSpacing: '.12em' }}>CIVIL SERVANT PROTECT</Mono>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.02em' }}>Member web</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: C.mut }}>
          The same twelve member jobs on a desk browser. Parity with the phone app, wider canvas, real paperwork.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 11, borderTop: `1px solid ${C.line2}` }}>
        <Kicker size={9.5}>WHO PAYS THIS MEMBER</Kicker>
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
        <Kicker size={9.5}>LANGUAGE</Kicker>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {LANGS.map(([code, , short]) => {
            const on = lang === code
            return (
              <button
                key={code}
                type="button"
                className="chip"
                onClick={() => setLang(code as Lang)}
                style={{
                  padding: '5px 10px',
                  border: `1.5px solid ${on ? C.g : C.line2}`,
                  background: on ? C.gTint : 'transparent',
                  color: on ? C.gd : C.mut,
                  fontSize: 12, fontWeight: on ? 600 : 500,
                }}
              >
                {short}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 11, borderTop: `1px solid ${C.line2}` }}>
        {SIDE_GROUPS.map((group) => {
          const items = WNAV.filter((n) => n.group === group)
          if (!items.length) return null
          return (
            <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Mono size={9} color={C.ghost} style={{ letterSpacing: '.12em', padding: '0 9px 3px' }}>{group}</Mono>
              {items.map((it) => {
                const on = screen === it.id
                return (
                  <button
                    key={it.id}
                    type="button"
                    className="nav-item"
                    onClick={() => go(it.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                      padding: '6px 9px', border: 0, borderRadius: 7,
                      background: on ? C.hover : 'transparent',
                      color: on ? C.ink : C.mut,
                      fontSize: 12.5, fontWeight: on ? 600 : 400, cursor: 'pointer',
                    }}
                  >
                    <Icon name={it.icon} size={14} color={on ? C.g : C.faint} />
                    {it.label}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BrowserFrame() {
  const { screen } = useWeb()
  const inApp = APP_SCREENS.includes(screen)

  return (
    <div
      style={{
        width: WEB_FRAME.w, height: WEB_FRAME.h, background: C.surface,
        border: '1px solid #D5D2C7', borderRadius: 12,
        boxShadow: '0 24px 60px rgba(20,24,27,.22)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <ChromeBar />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {inApp ? <SignedInShell /> : <PublicShell />}
      </div>
    </div>
  )
}

function ChromeBar() {
  const { screen } = useWeb()
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
          my.civilservantprotect.ng{URLS[screen]}
        </div>
      </div>
      <div style={{ width: 78 }} />
    </div>
  )
}

/** Public pages: green hero on the left, the form on the right, no session. */
function PublicShell() {
  const { t, screen, sponsor } = useWeb()
  const Body = SCREENS[screen]

  const heroPoints = [
    { icon: 'ph ph-buildings', text: `Collected by ${sponsor.short} — the web app never asks you to pay twice.` },
    { icon: 'ph ph-printer', text: 'Print your protection card, statements and claim papers at A4.' },
    { icon: 'ph ph-timer', text: 'Sessions end after 20 minutes idle, for cyber-cafe and office machines.' },
  ]

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      <div
        style={{
          flex: 'none', width: 454, background: C.g, color: C.gTint,
          padding: '44px 40px', display: 'flex', flexDirection: 'column',
        }}
      >
        <div
          style={{
            width: 46, height: 46, borderRadius: 13, background: 'rgba(255,255,255,.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="ph-fill ph-shield-check" size={25} />
        </div>
        <div style={{ marginTop: 26, fontSize: 34, lineHeight: 1.14, fontWeight: 700, letterSpacing: '-.03em' }}>
          Civil Servant
          <br />
          Protect Plan
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.55, color: 'rgba(241,246,243,.82)', marginTop: 12 }}>{t.tagline}</div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 22,
            borderTop: '1px solid rgba(255,255,255,.18)',
          }}
        >
          {heroPoints.map((p) => (
            <div key={p.text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Icon name={p.icon} size={17} color="rgba(241,246,243,.75)" style={{ marginTop: 2 }} />
              <span style={{ fontSize: 13.5, lineHeight: 1.5, color: 'rgba(241,246,243,.9)' }}>{p.text}</span>
            </div>
          ))}
        </div>
        <Mono size={10.5} color="rgba(241,246,243,.6)" style={{ display: 'block', marginTop: 18, lineHeight: 1.6 }}>
          {t.ussd_note}
        </Mono>
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '44px 52px', background: C.surface }}>
        <Body />
      </div>
    </div>
  )
}

function SignedInShell() {
  const { screen } = useWeb()
  const Body = SCREENS[screen]

  return (
    <>
      <TopBar />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <SideNav />
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '26px 30px 40px', background: C.surface }}>
          <Body />
        </div>
      </div>
    </>
  )
}

function TopBar() {
  const { screen, sponsor, lang } = useWeb()
  const title = WNAV.find((n) => n.id === screen)?.label ?? '—'
  const langName = LANGS.find((l) => l[0] === lang)?.[1]

  return (
    <div
      style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px',
        height: 54, background: C.white, borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div
          style={{
            width: 26, height: 26, borderRadius: 7, background: C.g,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="ph-fill ph-shield-check" size={15} color={C.surface} />
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-.01em' }}>Civil Servant Protect</div>
      </div>
      <div style={{ width: 1, height: 22, background: C.line }} />
      <div style={{ fontSize: 13, color: C.mut }}>{title}</div>
      <div style={{ flex: 1 }} />

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 99,
          background: C.gTint, border: '1px solid #D8E6DE',
        }}
      >
        <Icon name={sponsor.icon} size={13} color={C.g} />
        <span style={{ fontSize: 12, fontWeight: 600, color: C.gd }}>{sponsor.org}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="ph ph-translate" size={16} color={C.mut} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{langName}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderLeft: `1px solid ${C.line}` }}>
        <div
          style={{
            width: 28, height: 28, borderRadius: '50%', background: C.hover,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, color: C.mut,
          }}
        >
          {WEB_MEMBER.initials}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2 }}>{WEB_MEMBER.name}</span>
          <Mono size={9.5} color={C.faint}>{WEB_MEMBER.cspId}</Mono>
        </div>
      </div>
    </div>
  )
}

function SideNav() {
  const { screen, go } = useWeb()

  return (
    <div
      style={{
        flex: 'none', width: 218, background: C.white, borderRight: `1px solid ${C.line}`,
        display: 'flex', flexDirection: 'column', padding: '14px 12px', gap: 11,
      }}
    >
      {APP_GROUPS.map((group) => (
        <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Mono size={9} color={C.ghost} style={{ letterSpacing: '.12em', padding: '0 10px 4px' }}>{group}</Mono>
          {WNAV.filter((n) => n.group === group).map((it) => {
            const on = screen === it.id
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => go(it.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  padding: '8px 10px', border: 0, borderRadius: 8,
                  background: on ? C.gTint : 'transparent',
                  color: on ? C.gd : C.mut,
                  fontSize: 13.5, fontWeight: on ? 600 : 500, cursor: 'pointer',
                }}
              >
                <Icon name={it.icon} size={16} color={on ? C.g : C.faint} />
                <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
                {/* One outstanding beneficiary action, carried as a badge. */}
                {it.id === 'benes' && (
                  <Mono size={9} color={C.clay} weight={600}>1</Mono>
                )}
              </button>
            )
          })}
        </div>
      ))}

      <div style={{ flex: 1 }} />
      <div style={{ padding: 11, borderRadius: 9, background: C.gTint, border: '1px solid #D8E6DE' }}>
        <Kicker size={9} color={C.g}>SESSION</Kicker>
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: C.gd, marginTop: 4 }}>
          Signs you out after 20 minutes idle. Built for shared machines.
        </div>
      </div>
    </div>
  )
}

function FrameCaption() {
  const { screen, sponsor } = useWeb()
  const inApp = APP_SCREENS.includes(screen)

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, width: WEB_FRAME.w }}>
      <Mono size={10.5} color={C.faint}>
        {inApp ? `Signed in · ${sponsor.short}` : 'Public page · no session'}
      </Mono>
      <Mono size={10.5} color={C.faint}>
        {WEB_FRAME.w} × {WEB_FRAME.h} · breakpoint {WEB_FRAME.breakpoint}
      </Mono>
    </div>
  )
}
