import { useState } from 'react'
import { Icon } from './components/Icon'
import { Mono } from './components/primitives'
import { LangProvider, LANGS, type Lang } from './i18n'
import { SPONSORS, sponsorById, type SponsorId } from './data/sponsors'
import { C } from './theme/tokens'
import { PhoneApp } from './surfaces/phone/PhoneApp'
import { WebApp } from './surfaces/web/WebApp'
import { ConsoleApp } from './surfaces/console/ConsoleApp'
import { SpecDoc } from './surfaces/spec/SpecDoc'

type Surface = 'phone' | 'web' | 'console' | 'spec'

const TABS: readonly {
  id: Surface
  label: string
  icon: string
  name: string
  note: string
  meta: string
}[] = [
  {
    id: 'phone', label: 'Phone', icon: 'ph ph-device-mobile', name: 'Member · phone',
    note: 'The native app. Enrolment, the offline protection card, the camera and USSD fallback live here.',
    meta: 'ANDROID-FIRST · 4.1 MB',
  },
  {
    id: 'web', label: 'Web', icon: 'ph ph-monitor', name: 'Member · web',
    note: 'The same twelve member jobs on a desk browser: full tables, scanned uploads, printing and PDFs.',
    meta: '≥1024 DESIGNED · 20-MIN SESSION',
  },
  {
    id: 'console', label: 'Console', icon: 'ph ph-buildings', name: 'Sponsor · console',
    note: 'The employer side. Schedules, return files, reconciliation, exceptions, debit runs and roster.',
    meta: 'DESKTOP-FIRST · HR PHONE LAYOUT',
  },
  {
    id: 'spec', label: 'Spec', icon: 'ph ph-file-text', name: 'Implementation spec',
    note: 'Contracts, copy keys, validation rules, screen states, breakpoints and how the four rails branch.',
    meta: 'FOR THE BUILD TEAM',
  },
]

/**
 * The system shell.
 *
 * One entry point over all four surfaces, with the rail and language pickers in
 * the header driving every surface at once — the point being that a member, the
 * same member on a desk browser, and their sponsor's officer are all looking at
 * one record on one collection rail.
 */
export function App() {
  const [surface, setSurface] = useState<Surface>('phone')
  const [lang, setLang] = useState<Lang>('en')
  const [sponsorId, setSponsor] = useState<SponsorId>('federal')

  const tab = TABS.find((t) => t.id === surface) ?? TABS[0]
  const sponsor = sponsorById(sponsorId)

  return (
    <LangProvider lang={lang}>
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center',
          gap: '14px 20px', flexWrap: 'wrap', padding: '9px 26px', minHeight: 62,
          background: C.ink, color: C.surface,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: 8, background: C.g,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="ph-fill ph-shield-check" size={16} color={C.surface} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.2 }}>
              Civil Servant Protect
            </span>
            <Mono size={9} color="rgba(247,246,242,.5)" style={{ letterSpacing: '.12em' }}>
              ONE SYSTEM · THREE SURFACES
            </Mono>
          </div>
        </div>

        {/* Tabs hold their width and never wrap mid-label. */}
        <div
          style={{
            flex: 'none', display: 'flex', gap: 3, padding: 3,
            borderRadius: 99, background: 'rgba(247,246,242,.08)',
          }}
        >
          {TABS.map((t) => {
            const on = surface === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSurface(t.id)}
                style={{
                  flex: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 15px', border: 0, borderRadius: 99,
                  background: on ? C.g : 'transparent',
                  color: on ? C.surface : 'rgba(247,246,242,.7)',
                  fontSize: 13, fontWeight: on ? 600 : 500, cursor: 'pointer', transition: 'background .15s',
                }}
              >
                <Icon name={t.icon} size={15} />
                {t.label}
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0 }} />

        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
          <Icon name={tab.icon} size={15} color={C.gBright2} />
          <Mono size={10} color="rgba(247,246,242,.5)" style={{ letterSpacing: '.1em' }}>{tab.meta}</Mono>
        </div>
      </div>

      {/* Control strip: rail and language on the light ground, not in the dark bar. */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 20px',
          padding: '13px 26px', background: C.white, borderBottom: `1px solid ${C.line}`,
        }}
      >
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap' }}>
          <Mono size={9} color={C.faint} style={{ letterSpacing: '.12em' }}>RAIL</Mono>
          <div style={{ display: 'flex', gap: 5 }}>
            {SPONSORS.map((s) => {
              const on = sponsorId === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  className="chip"
                  onClick={() => setSponsor(s.id)}
                  style={{
                    padding: '6px 11px',
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
        </div>

        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap' }}>
          <Mono size={9} color={C.faint} style={{ letterSpacing: '.12em' }}>LANG</Mono>
          <div style={{ display: 'flex', gap: 5 }}>
            {LANGS.map(([code, , short]) => {
              const on = lang === code
              return (
                <button
                  key={code}
                  type="button"
                  className="chip"
                  onClick={() => setLang(code as Lang)}
                  style={{
                    padding: '6px 10px',
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

        <div style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{tab.name}</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.45, color: C.mut }}>{tab.note}</span>
        </div>
        <Mono size={10.5} color={C.faint} style={{ flex: 'none', whiteSpace: 'nowrap' }}>
          {surface === 'spec' ? 'All four rails documented' : sponsor.rail}
        </Mono>
      </div>

      <div className="rise">
        {surface === 'phone' && (
          <PhoneApp lang={lang} setLang={setLang} sponsorId={sponsorId} setSponsor={setSponsor} />
        )}
        {surface === 'web' && (
          <WebApp lang={lang} setLang={setLang} sponsorId={sponsorId} setSponsor={setSponsor} />
        )}
        {surface === 'console' && <ConsoleApp sponsorId={sponsorId} setSponsor={setSponsor} />}
        {surface === 'spec' && <SpecDoc />}
      </div>
    </LangProvider>
  )
}
