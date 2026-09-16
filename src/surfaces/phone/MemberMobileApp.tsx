import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import type { Lang } from '../../i18n'
import type { SponsorId } from '../../data/sponsors'
import { C } from '../../theme/tokens'
import { useAuth } from '../../api/auth'
import { PUBLIC_SCREENS, TABBED, TAB_ICONS, TAB_TARGETS, type PhoneScreen } from './nav'
import { PhoneStateProvider, usePhone } from './state'
import {
  BiometricScreen, OtpScreen, PhoneNumberScreen, SignInScreen, SplashScreen,
} from './screens/Auth'
import {
  EmployerOnboardScreen, EnrolDoneScreen, EnrolScreen, SponsorScreen, VerifyScreen,
} from './screens/Setup'
import { HomeScreen } from './screens/Home'
import {
  BeneConfirmScreen, BeneficiariesScreen, BenefitsScreen, FamilyScreen, ProtectionCardScreen,
} from './screens/Cover'
import { ContributionsScreen, PayScreen, WhyChangedScreen } from './screens/Pay'
import { AccidentScreen, ClaimScreen, TrackScreen } from './screens/Claims'
import { BeneficiaryPortalScreen, HrConsoleScreen, ProfileScreen } from './screens/Other'

const SCREENS: Record<PhoneScreen, () => JSX.Element> = {
  splash: SplashScreen,
  auth: SignInScreen,
  phone: PhoneNumberScreen,
  otp: OtpScreen,
  biometric: BiometricScreen,
  sponsor: SponsorScreen,
  verify: VerifyScreen,
  enrol: EnrolScreen,
  enroldone: EnrolDoneScreen,
  onboard: EmployerOnboardScreen,
  home: HomeScreen,
  pay: PayScreen,
  contrib: ContributionsScreen,
  id: ProtectionCardScreen,
  benefits: BenefitsScreen,
  benes: BeneficiariesScreen,
  family: FamilyScreen,
  more: ProfileScreen,
  beneconf: BeneConfirmScreen,
  whychanged: WhyChangedScreen,
  accident: AccidentScreen,
  claim: ClaimScreen,
  track: TrackScreen,
  hr: HrConsoleScreen,
  bene: BeneficiaryPortalScreen,
}

/**
 * The member app, mobile-first.
 *
 * The spec calls for a native Android build; this is its web twin and shares
 * every screen. It fills the viewport — there is no device frame, because the
 * device is the frame — and caps its width on a large screen rather than
 * stretching a phone layout across a monitor.
 */
export function MemberMobileApp({
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
  // Every screen is a real URL: /m/home, /m/claim, /m/track. Deep links,
  // back-button and refresh all work, which a screen held in component state
  // cannot do.
  const { screen } = useParams()
  const nav = useNavigate()
  const asked = (screen && screen in SCREENS ? screen : 'home') as PhoneScreen
  const navigate = (to: PhoneScreen) => nav({ pathname: `/m/${to}`, search: window.location.search })

  // Live and signed out, a deep link into the app goes to the phone-number
  // screen instead of a home screen whose every request would 401. A redirect
  // rather than a substitution, so the address bar says what is on screen —
  // otherwise /m/home shows a sign-in form and a reload repeats the detour.
  // On fixtures `signedIn` is always true, so the demo still opens anywhere.
  const { signedIn } = useAuth()
  if (!signedIn && !PUBLIC_SCREENS.includes(asked)) {
    return <Navigate to={{ pathname: '/m/phone', search: window.location.search }} replace />
  }

  return (
    <PhoneStateProvider
      lang={lang}
      setLang={setLang}
      sponsorId={sponsorId}
      setSponsor={setSponsor}
      screen={asked}
      navigate={navigate}
      demo={demo}
    >
      <Shell />
    </PhoneStateProvider>
  )
}

function Shell() {
  const { screen, offline, sun } = usePhone()
  const Body = SCREENS[screen]

  return (
    <div
      style={{
        height: '100dvh',
        overflow: 'hidden',
        background: C.paper,
        display: 'flex',
        justifyContent: 'center',
        // Sunlight is still a contrast simulation rather than a second palette;
        // see README. Applied to the app, not to a mockup of one.
        filter: sun ? 'contrast(1.24) saturate(.9) brightness(1.04)' : 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          height: '100dvh',
          background: C.surface,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {offline && <OfflineBar />}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <Body />
          {TABBED.includes(screen) && <TabBar />}
        </div>
      </div>
    </div>
  )
}

/** A real connectivity banner, pinned above the content. */
function OfflineBar() {
  const { t } = usePhone()
  return (
    <div
      role="status"
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '9px 16px',
        background: C.ochreBg,
        borderBottom: `1px solid ${C.ochreBorder}`,
        color: C.ochreInk,
        fontSize: 12.5,
        lineHeight: 1.4,
      }}
    >
      <Icon name="ph-fill ph-cloud-slash" size={15} color={C.ochre} />
      {t.offline_note}
    </div>
  )
}

function TabBar() {
  const { t, screen, go } = usePhone()
  return (
    <nav
      aria-label="Main"
      style={{
        flex: 'none',
        display: 'flex',
        justifyContent: 'space-around',
        gap: 2,
        // The extra bottom padding is the home-indicator inset on a real handset.
        padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 16px))',
        background: 'rgba(247,246,242,.95)',
        backdropFilter: 'blur(12px)',
        borderTop: `1px solid ${C.line}`,
      }}
    >
      {TAB_TARGETS.map((id, i) => {
        const on = screen === id
        return (
          <button
            key={id}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => go(id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '5px 2px',
              minHeight: 44,
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <Icon name={`${on ? 'ph-fill ph-' : 'ph ph-'}${TAB_ICONS[i]}`} size={23} color={on ? C.g : C.faint} />
            <span style={{ fontSize: 10.5, fontWeight: on ? 600 : 500, color: on ? C.g : C.faint }}>
              {t.tabs[i]}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
