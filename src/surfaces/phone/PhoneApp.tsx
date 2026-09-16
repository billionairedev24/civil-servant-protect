import { Icon } from '../../components/Icon'
import { Kicker, Mono } from '../../components/primitives'
import type { Lang } from '../../i18n'
import { SPONSORS, type SponsorId } from '../../data/sponsors'
import { C, PHONE } from '../../theme/tokens'
import { LANG_NOTE, NAV, TABBED, TAB_ICONS, TAB_TARGETS, V3_CHANGES, type PhoneScreen } from './nav'
import { PhoneStateProvider, usePhone } from './state'
import { LANGS } from '../../i18n'
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

export function PhoneApp(props: {
  lang: Lang
  setLang: (l: Lang) => void
  sponsorId: SponsorId
  setSponsor: (id: SponsorId) => void
}) {
  return (
    <PhoneStateProvider {...props}>
      <PhoneWorkbench />
    </PhoneStateProvider>
  )
}

/** The prototype workbench: index rail, handset, and design notes. */
function PhoneWorkbench() {
  return (
    <div style={{ display: 'flex', gap: 30, padding: '30px 34px 44px', alignItems: 'flex-start', minHeight: '100vh' }}>
      <IndexRail />
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <Handset />
        <HarnessControls />
      </div>
      <NotesRail />
    </div>
  )
}

function IndexRail() {
  const { screen, sponsor, setSponsor, go } = usePhone()
  return (
    <div
      style={{
        flex: 'none', width: 200, position: 'sticky', top: 30,
        display: 'flex', flexDirection: 'column', gap: 13,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Mono size={10} color={C.g} weight={500} style={{ letterSpacing: '.12em' }}>
          CIVIL SERVANT PROTECT
        </Mono>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.02em' }}>Member · phone</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: C.mut }}>
          Carries the collection model: four sponsor types, one member record.
        </div>

        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8,
            paddingTop: 11, borderTop: `1px solid ${C.line2}`,
          }}
        >
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
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV.map((item) => {
          const on = screen === item.id
          return (
            <button
              key={item.id}
              type="button"
              className="nav-item"
              onClick={() => go(item.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                textAlign: 'left', padding: '6px 9px', border: 0, borderRadius: 7,
                background: on ? C.hover : 'transparent',
                color: on ? C.ink : C.mut,
                fontSize: 12.5, fontWeight: on ? 600 : 400, cursor: 'pointer',
              }}
            >
              {item.label}
              <Mono size={9} color={C.ghost}>{item.group}</Mono>
            </button>
          )
        })}
      </div>

      <div style={{ paddingTop: 11, borderTop: `1px solid ${C.line2}`, fontSize: 11.5, lineHeight: 1.55, color: C.faint }}>
        Translations are machine-drafted and need a native-speaker pass before any pilot — insurance vocabulary especially.
      </div>
    </div>
  )
}

function Handset() {
  const { screen, offline, sun } = usePhone()
  const Body = SCREENS[screen]

  return (
    <div
      style={{
        width: PHONE.w, height: PHONE.h, background: C.surface,
        border: `${PHONE.bezel}px solid #22262A`, borderRadius: PHONE.radius,
        boxShadow: '0 24px 60px rgba(20,24,27,.28)', overflow: 'hidden',
        position: 'relative', display: 'flex', flexDirection: 'column',
        // Sunlight is a contrast simulation over the whole frame, not a second
        // palette. A real high-contrast theme needs its own token set.
        filter: sun ? 'contrast(1.24) saturate(.9) brightness(1.04)' : 'none',
      }}
    >
      <div
        style={{
          flex: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '13px 26px 4px', fontSize: 12.5, fontWeight: 600,
        }}
      >
        <span>09:41</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', color: C.mut }}>
          <Mono size={10}>{offline ? 'no network' : 'MTN NG'}</Mono>
          <Icon name="ph-fill ph-cell-signal-medium" size={13} />
          <Icon name="ph-fill ph-battery-medium" size={15} />
        </span>
      </div>

      <div
        style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', position: 'relative',
        }}
      >
        <Body />
        {TABBED.includes(screen) && <TabBar />}
      </div>
    </div>
  )
}

function TabBar() {
  const { t, screen, go } = usePhone()
  return (
    <div
      style={{
        flex: 'none', position: 'absolute', left: 0, right: 0, bottom: 0,
        display: 'flex', justifyContent: 'space-around', gap: 2,
        padding: '10px 12px 26px', background: 'rgba(247,246,242,.95)',
        backdropFilter: 'blur(12px)', borderTop: `1px solid ${C.line}`,
      }}
    >
      {TAB_TARGETS.map((id, i) => {
        const on = screen === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '5px 2px', border: 0, background: 'transparent', cursor: 'pointer',
            }}
          >
            <Icon name={`${on ? 'ph-fill ph-' : 'ph ph-'}${TAB_ICONS[i]}`} size={23} color={on ? C.g : C.faint} />
            <span style={{ fontSize: 10.5, fontWeight: on ? 600 : 500, color: on ? C.g : C.faint }}>
              {t.tabs[i]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Prototype harness — the states a demo has to be able to show on demand. */
function HarnessControls() {
  const { offline, late, sun, set, go } = usePhone()

  const button = (label: string, onClick: () => void, active = false) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: 10, border: `1px solid ${active ? C.ochreBorder : C.line3}`,
        borderRadius: 8, background: C.white,
        color: active ? C.ochre : C.mut, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {button(offline ? 'Go back online' : 'Simulate no network', () => set({ offline: !offline }), offline)}
      {button(late ? 'Deduction arrived' : 'Simulate late deduction', () => set({ late: !late }), late)}
      {button(sun ? 'Back to indoor light' : 'Simulate bright sunlight', () => set({ sun: !sun }), sun)}
      {button('Restart from splash', () => go('splash'))}
    </div>
  )
}

function NotesRail() {
  const { lang } = usePhone()
  const langName = LANGS.find((l) => l[0] === lang)?.[1]

  return (
    <div
      style={{
        flex: 1, minWidth: 230, maxWidth: 310, position: 'sticky', top: 30,
        display: 'flex', flexDirection: 'column', gap: 15,
      }}
    >
      <div>
        <Kicker size={9.5}>HOW THIS SURFACE WORKS</Kicker>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 11 }}>
          {V3_CHANGES.map((c) => (
            <div key={c.t} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.g }}>{c.t}</span>
              <span style={{ fontSize: 13, lineHeight: 1.55, color: C.mut }}>{c.b}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 1, background: C.line2 }} />
      <div>
        <Kicker size={9.5}>CURRENT LANGUAGE</Kicker>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em', marginTop: 4 }}>{langName}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: C.mut, marginTop: 6 }}>{LANG_NOTE[lang]}</div>
      </div>
    </div>
  )
}
