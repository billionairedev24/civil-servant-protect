import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Kicker, Mono } from '../../components/primitives'
import { BP, useMediaQuery } from '../../components/useMediaQuery'
import { LANGS, type Lang } from '../../i18n'
import type { SponsorId } from '../../data/sponsors'
import { C } from '../../theme/tokens'
import {
  APP_GROUPS, APP_SCREENS, PUBLIC_WEB_SCREENS, URLS, WNAV, webScreenForPath, type WebScreen,
} from './nav'
import { useAuth } from '../../api/auth'
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

/**
 * The member web app.
 *
 * Designed at ≥1024 and required to survive a 360-wide phone browser. The nav
 * rail becomes a scrolling tab row below 1024; content is capped at 830 rather
 * than stretched, because these are reading-and-checking screens, not a
 * dashboard wall.
 */
export function MemberWebApp({
  lang,
  setLang,
  sponsorId,
  setSponsor,
  demo,
}: {
  lang: Lang
  setLang: (l: Lang) => void
  sponsorId: SponsorId
  setSponsor: (id: SponsorId) => void
  demo: { late: boolean; offline: boolean; sun: boolean }
}) {
  // Every page is a real address — /dashboard, /contributions, /claims/new —
  // so a member can bookmark one, and the browser's Back button means what it
  // says. The demo's language and rail ride along in the query string.
  const { pathname } = useLocation()
  const nav = useNavigate()
  const navigate = (to: WebScreen) => nav({ pathname: URLS[to], search: window.location.search })
  const asked = webScreenForPath(pathname)

  /* Live and signed out, a bookmarked page goes to the front door rather than
     rendering a dashboard whose every request would 401. On fixtures `signedIn`
     is always true, so a design review still opens any page directly. */
  const { signedIn } = useAuth()
  if (!signedIn && !PUBLIC_WEB_SCREENS.includes(asked)) {
    return <Navigate to={{ pathname: URLS.signin, search: window.location.search }} replace />
  }

  return (
    <WebStateProvider
      lang={lang}
      setLang={setLang}
      sponsorId={sponsorId}
      setSponsor={setSponsor}
      screen={asked}
      navigate={navigate}
      demo={demo}
    >
      <Shell />
    </WebStateProvider>
  )
}

function Shell() {
  const { screen } = useWeb()
  const inApp = APP_SCREENS.includes(screen)
  return inApp ? <SignedIn /> : <PublicPage />
}

/** Public pages: the green panel is the page's own left half, not a mockup. */
function PublicPage() {
  const { t, screen, sponsor } = useWeb()
  const Body = SCREENS[screen]
  const wide = useMediaQuery(BP.smallDesktop)

  const points = [
    { icon: 'ph ph-buildings', text: `Collected by ${sponsor.short} — the web app never asks you to pay twice.` },
    { icon: 'ph ph-printer', text: 'Print your protection card, statements and claim papers at A4.' },
    { icon: 'ph ph-timer', text: 'Sessions end after 20 minutes idle, for cyber-cafe and office machines.' },
  ]

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: wide ? 'row' : 'column', background: C.surface }}>
      <aside
        style={{
          flex: wide ? '0 0 clamp(360px, 32vw, 454px)' : 'none',
          background: C.g,
          color: C.gTint,
          padding: wide ? '44px 40px' : '28px 20px',
          display: 'flex',
          flexDirection: 'column',
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
        <h1
          style={{
            margin: 0, marginTop: 26, fontSize: wide ? 34 : 26, lineHeight: 1.14,
            fontWeight: 700, letterSpacing: '-.03em',
          }}
        >
          Civil Servant Protect Plan
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: 'rgba(241,246,243,.82)', marginTop: 12 }}>{t.tagline}</p>

        {wide && (
          <>
            <div style={{ flex: 1 }} />
            <div
              style={{
                display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 22,
                borderTop: '1px solid rgba(255,255,255,.18)',
              }}
            >
              {points.map((p) => (
                <div key={p.text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Icon name={p.icon} size={17} color="rgba(241,246,243,.75)" style={{ marginTop: 2 }} />
                  <span style={{ fontSize: 13.5, lineHeight: 1.5, color: 'rgba(241,246,243,.9)' }}>{p.text}</span>
                </div>
              ))}
            </div>
            {/* .75 of the tint on the green measures 4.19:1 at this size; .88
                clears 4.5. It is a phone number a member may need to read in a
                hurry, so it does not get to be decorative. */}
            <Mono size={10.5} color="rgba(241,246,243,.88)" style={{ display: 'block', marginTop: 18, lineHeight: 1.6 }}>
              {t.ussd_note}
            </Mono>
          </>
        )}
      </aside>

      <main
        style={{
          flex: 1, minWidth: 0, background: C.surface,
          padding: wide ? '44px clamp(24px, 4vw, 52px)' : '28px 16px 40px',
        }}
      >
        <Body />
      </main>
    </div>
  )
}

function SignedIn() {
  const { screen } = useWeb()
  const Body = SCREENS[screen]
  const wide = useMediaQuery(BP.smallDesktop)

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: C.surface }}>
      <TopBar />
      {!wide && <TabRail />}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {wide && <SideNav />}
        <main
          style={{
            flex: 1, minWidth: 0,
            padding: wide ? '26px clamp(20px, 3vw, 30px) 40px' : '20px 16px 40px',
          }}
        >
          <div style={{ maxWidth: 830 }}>
            <Body />
          </div>
        </main>
      </div>
    </div>
  )
}

function TopBar() {
  const { screen, sponsor, lang, setLang } = useWeb()
  const title = WNAV.find((n) => n.id === screen)?.label ?? ''
  const wide = useMediaQuery(BP.smallDesktop)

  return (
    <header
      style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        padding: '0 clamp(14px, 2vw, 22px)', minHeight: 54,
        background: C.white, borderBottom: `1px solid ${C.line}`,
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
        <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-.01em' }}>Civil Servant Protect</span>
      </div>

      {wide && (
        <>
          <div style={{ width: 1, height: 22, background: C.line }} />
          <span style={{ fontSize: 13, color: C.mut }}>{title}</span>
        </>
      )}

      <div style={{ flex: 1, minWidth: 0 }} />

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 99,
          background: C.gTint, border: '1px solid #D8E6DE',
        }}
      >
        <Icon name={sponsor.icon} size={13} color={C.g} />
        <span style={{ fontSize: 12, fontWeight: 600, color: C.gd }}>{sponsor.org}</span>
      </div>

      {/* Language is a real account setting, so it belongs in the product. */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon name="ph ph-translate" size={16} color={C.mut} />
        <span className="sr-only">Language</span>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          style={{
            minHeight: 32, border: `1px solid ${C.line3}`, borderRadius: 8, background: C.white,
            color: C.ink, fontSize: 12.5, fontWeight: 600, padding: '4px 8px', cursor: 'pointer',
          }}
        >
          {LANGS.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
      </label>

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
        {wide && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2 }}>{WEB_MEMBER.name}</span>
            <Mono size={9.5} color={C.faint}>{WEB_MEMBER.cspId}</Mono>
          </div>
        )}
      </div>
    </header>
  )
}

/** Below 1024 the rail becomes a scrolling row of labelled tabs. */
function TabRail() {
  const { screen, go } = useWeb()
  const items = WNAV.filter((n) => APP_SCREENS.includes(n.id))

  return (
    <nav
      aria-label="Sections"
      style={{
        flex: 'none', display: 'flex', gap: 4, overflowX: 'auto',
        padding: '8px 12px', background: C.white, borderBottom: `1px solid ${C.line}`,
      }}
    >
      {items.map((it) => {
        const on = screen === it.id
        return (
          <button
            key={it.id}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => go(it.id)}
            style={{
              flex: 'none', display: 'flex', alignItems: 'center', gap: 7, minHeight: 44,
              padding: '0 13px', border: 0, borderRadius: 99, cursor: 'pointer',
              background: on ? C.gTint : 'transparent',
              color: on ? C.gd : C.mut,
              fontSize: 13.5, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap',
            }}
          >
            <Icon name={it.icon} size={16} color={on ? C.g : C.faint} />
            {it.label}
          </button>
        )
      })}
    </nav>
  )
}

function SideNav() {
  const { screen, go } = useWeb()

  return (
    <nav
      aria-label="Main"
      style={{
        flex: 'none', width: 218, background: C.white, borderRight: `1px solid ${C.line}`,
        display: 'flex', flexDirection: 'column', padding: '14px 12px', gap: 11,
      }}
    >
      {APP_GROUPS.map((group) => (
        <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Mono size={9} color={C.faint} style={{ letterSpacing: '.12em', padding: '0 10px 4px', display: 'block' }}>
            {group}
          </Mono>
          {WNAV.filter((n) => n.group === group).map((it) => {
            const on = screen === it.id
            return (
              <button
                key={it.id}
                type="button"
                aria-current={on ? 'page' : undefined}
                onClick={() => go(it.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  minHeight: 40, padding: '8px 10px', border: 0, borderRadius: 8,
                  background: on ? C.gTint : 'transparent',
                  color: on ? C.gd : C.mut,
                  fontSize: 13.5, fontWeight: on ? 600 : 500, cursor: 'pointer',
                }}
              >
                <Icon name={it.icon} size={16} color={on ? C.g : C.faint} />
                <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
                {it.id === 'benes' && <Mono size={9} color={C.clay} weight={600}>1</Mono>}
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
    </nav>
  )
}
