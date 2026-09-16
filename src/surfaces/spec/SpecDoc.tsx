import { useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { Kicker, Mono } from '../../components/primitives'
import { C, MONO } from '../../theme/tokens'
import {
  BREAKPOINTS, BUILD_ORDER, CONTRACTS, I18N_DEBT, I18N_STATS, KEY_ROWS, MATRIX, MINIMUMS,
  OPEN_QUESTIONS, RAILS, RAIL_HEAD, RULES, SPEC_SECTIONS, STATES, SURFACES,
  type Capability, type KeyState, type Severity, type SpecSection,
} from './content'

export function SpecDoc() {
  const [section, setSection] = useState<SpecSection>('overview')

  return (
    <div style={{ display: 'flex', gap: 28, padding: '30px 34px 44px', alignItems: 'flex-start', minHeight: '100vh' }}>
      <div style={{ flex: 'none', width: 206, position: 'sticky', top: 30, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Mono size={10} color={C.g} weight={500} style={{ letterSpacing: '.12em' }}>CIVIL SERVANT PROTECT</Mono>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.02em' }}>Implementation spec</div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: C.mut }}>
            What a build team needs that a mockup cannot show: contracts, keys, rules, breakpoints, and what belongs on
            which surface.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 11, borderTop: `1px solid ${C.line2}` }}>
          {SPEC_SECTIONS.map((s) => {
            const on = section === s.id
            return (
              <button
                key={s.id}
                type="button"
                className="nav-item"
                onClick={() => setSection(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  padding: '7px 9px', border: 0, borderRadius: 7,
                  background: on ? C.hover : 'transparent',
                  color: on ? C.ink : C.mut,
                  fontSize: 12.5, fontWeight: on ? 600 : 400, cursor: 'pointer',
                }}
              >
                <Icon name={s.icon} size={14} color={on ? C.g : C.faint} />
                {s.label}
              </button>
            )
          })}
        </div>

        <div style={{ paddingTop: 11, borderTop: `1px solid ${C.line2}`, fontSize: 11.5, lineHeight: 1.55, color: C.faint }}>
          Figures are illustrative, pending actuarial, legal and underwriting sign-off. Translations are machine-drafted
          and need a native-speaker pass.
        </div>
      </div>

      <div className="rise" style={{ flex: 1, minWidth: 0, maxWidth: 1080, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {section === 'overview' && <Overview />}
        {section === 'matrix' && <Matrix />}
        {section === 'contracts' && <Contracts />}
        {section === 'i18n' && <CopyKeys />}
        {section === 'rules' && <Validation />}
        {section === 'states' && <ScreenStates />}
        {section === 'responsive' && <Breakpoints />}
        {section === 'rails' && <RailBranching />}
      </div>
    </div>
  )
}

function SectionHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>{title}</div>
      <div style={{ fontSize: 14.5, lineHeight: 1.55, color: C.mut, marginTop: 5, maxWidth: 740 }}>{children}</div>
    </div>
  )
}

function Card({ children, pad = 20 }: { children: ReactNode; pad?: number }) {
  return <div style={{ padding: pad, borderRadius: 12, background: C.white, border: `1px solid ${C.line}` }}>{children}</div>
}

/** Zebra striping, used by every table in the spec. */
const stripe = (i: number) => (i % 2 ? '#FCFCFA' : C.white)

function Overview() {
  return (
    <>
      <div style={{ padding: '26px 28px', borderRadius: 13, background: C.white, border: `1px solid ${C.line}` }}>
        <Kicker>SYSTEM SHAPE</Kicker>
        <div style={{ fontSize: 26, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-.025em', marginTop: 8 }}>
          One member record, four collection rails, three surfaces
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: C.mut, marginTop: 9, maxWidth: 760 }}>
          Everything downstream of enrolment is driven by which rail pays the member. The surfaces differ in what they
          can do with a device, not in what they know. No member surface may write to the payroll record — that belongs
          to the sponsor, and the console is the only place it changes.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {SURFACES.map((sf) => (
          <div
            key={sf.name}
            style={{
              padding: 20, borderRadius: 12, background: C.white, border: `1px solid ${C.line}`,
              display: 'flex', flexDirection: 'column',
            }}
          >
            <Icon name={sf.icon} size={22} color={C.g} />
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 11 }}>{sf.name}</div>
            <Mono size={10.5} color={C.faint} style={{ display: 'block', marginTop: 3 }}>{sf.meta}</Mono>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.mut, marginTop: 9, flex: 1 }}>{sf.body}</div>
            <div
              style={{
                marginTop: 12, paddingTop: 11, borderTop: '1px solid #EFEEE8',
                fontSize: 12.5, lineHeight: 1.5, color: C.faint,
              }}
            >
              {sf.owner}
            </div>
          </div>
        ))}
      </div>

      <Card pad={22}>
        <Kicker>BUILD ORDER</Kicker>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {BUILD_ORDER.map((b) => (
            <div key={b.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span
                style={{
                  flex: 'none', width: 26, height: 26, borderRadius: '50%', background: C.gTint,
                  border: '1px solid #D8E6DE', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.g,
                }}
              >
                {b.n}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{b.title}</span>
                <span style={{ display: 'block', fontSize: 13.5, lineHeight: 1.55, color: C.mut, marginTop: 2 }}>{b.body}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

const CAP_MARK: Record<Capability, { icon: string; color: string; label: string }> = {
  yes: { icon: 'ph-fill ph-check-circle', color: C.g, label: 'Full capability' },
  part: { icon: 'ph-fill ph-circle-half', color: C.ochre, label: 'Reduced — stated on the screen' },
  no: { icon: 'ph ph-minus', color: C.line9, label: 'Deliberately absent' },
  na: { icon: 'ph ph-x', color: '#D9D6CC', label: 'Not possible on this surface' },
}

function Matrix() {
  const template = '1.45fr 74px 74px 74px 1.5fr'
  return (
    <>
      <SectionHead title="What lives where">
        A capability sits on a surface only if that surface can do it honestly. Phone-only items depend on a device we
        control; web-only items depend on a keyboard, a scanner or a printer.
      </SectionHead>

      <div style={{ borderRadius: 12, background: C.white, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: template, background: C.gTint, borderBottom: '1px solid #DDE9E2' }}>
          {['CAPABILITY', 'PHONE', 'WEB', 'CONSOLE', 'WHY'].map((h, i) => (
            <div
              key={h}
              style={{
                padding: i > 0 && i < 4 ? '11px 6px' : '11px 16px',
                textAlign: i > 0 && i < 4 ? 'center' : 'left',
                fontFamily: MONO, fontSize: 9.5, letterSpacing: '.1em', color: C.g,
              }}
            >
              {h}
            </div>
          ))}
        </div>
        {MATRIX.map(([cap, p, w, c, why], i) => (
          <div
            key={cap}
            style={{ display: 'grid', gridTemplateColumns: template, borderTop: '1px solid #EFEEE8', background: stripe(i), alignItems: 'center' }}
          >
            <div style={{ padding: '11px 16px', fontSize: 13.5, fontWeight: 500 }}>{cap}</div>
            {[p, w, c].map((mark, j) => (
              <div key={j} style={{ padding: '11px 6px', textAlign: 'center' }}>
                <Icon name={CAP_MARK[mark].icon} size={16} color={CAP_MARK[mark].color} style={{ display: 'inline-block' }} />
              </div>
            ))}
            <div style={{ padding: '11px 16px', fontSize: 12.5, lineHeight: 1.45, color: C.mut }}>{why}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex', gap: 20, flexWrap: 'wrap', padding: '14px 17px',
          borderRadius: 11, background: C.white, border: `1px solid ${C.line}`,
        }}
      >
        {(['yes', 'part', 'no', 'na'] as Capability[]).map((k) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.mut }}>
            <Icon name={CAP_MARK[k].icon} size={15} color={CAP_MARK[k].color} />
            {CAP_MARK[k].label}
          </span>
        ))}
      </div>
    </>
  )
}

function Contracts() {
  return (
    <>
      <SectionHead title="Data and API contracts">
        One API serves all three surfaces. Reads are identical everywhere; writes are gated by role. Money is never
        computed on a client — the server returns minor-unit integers plus a formatted string in the member's locale.
      </SectionHead>

      {CONTRACTS.map((cg) => (
        <div key={cg.name} style={{ borderRadius: 12, background: C.white, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px',
              background: C.gTint, borderBottom: '1px solid #DDE9E2',
            }}
          >
            <Icon name={cg.icon} size={17} color={C.g} />
            <span style={{ fontSize: 15, fontWeight: 600, color: C.gd }}>{cg.name}</span>
            <Mono size={10} color="#5C8A72">{cg.meta}</Mono>
          </div>
          {cg.rows.map((r) => (
            <div key={r.screen} style={{ display: 'grid', gridTemplateColumns: '190px 1fr', borderTop: '1px solid #EFEEE8' }}>
              <div style={{ padding: '14px 18px', background: '#FCFCFA', borderRight: '1px solid #EFEEE8' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.screen}</div>
                <Mono size={10} color={C.faint} style={{ display: 'block', marginTop: 3 }}>{r.surfaces}</Mono>
              </div>
              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Mono size={12} weight={500} color={C.g}>{r.endpoint}</Mono>
                <Mono size={11.5} color={C.mut} style={{ lineHeight: 1.7 }}>{r.fields}</Mono>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut }}>{r.note}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

const KEY_PILL: Record<KeyState, { bg: string; fg: string }> = {
  live: { bg: C.gTint, fg: C.gd },
  new: { bg: C.ochreBg, fg: C.ochre },
  untranslated: { bg: '#FBF0EB', fg: C.clay },
}

function CopyKeys() {
  const template = '1fr 1.9fr 124px'
  return (
    <>
      <SectionHead title="Copy keys">
        All five locales live in <Mono size={13}>src/i18n/strings.ts</Mono>, read through{' '}
        <Mono size={13}>useT()</Mono>. English is the source; a missing key falls back to English rather than rendering
        blank.
      </SectionHead>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {I18N_STATS.map((st) => (
          <Card key={st.label} pad={17}>
            <Kicker size={9.5}>{st.label}</Kicker>
            <Mono size={23} weight={500} color={st.alert ? C.ochre : C.ink} style={{ display: 'block', marginTop: 6 }}>
              {st.value}
            </Mono>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: C.faint, marginTop: 3 }}>{st.sub}</div>
          </Card>
        ))}
      </div>

      <div style={{ borderRadius: 12, background: C.white, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: template, background: C.gTint, borderBottom: '1px solid #DDE9E2' }}>
          {['SCREEN', 'KEYS', 'STATE'].map((h) => (
            <div key={h} style={{ padding: '11px 16px', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.1em', color: C.g }}>
              {h}
            </div>
          ))}
        </div>
        {KEY_ROWS.map(([screen, keys, state], i) => (
          <div
            key={screen}
            style={{ display: 'grid', gridTemplateColumns: template, borderTop: '1px solid #EFEEE8', alignItems: 'start', background: stripe(i) }}
          >
            <div style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 600 }}>{screen}</div>
            <Mono size={11.5} color={C.mut} style={{ padding: '12px 16px', lineHeight: 1.7 }}>{keys}</Mono>
            <div style={{ padding: '12px 16px' }}>
              <span
                style={{
                  display: 'inline-block', padding: '3px 9px', borderRadius: 99,
                  background: KEY_PILL[state].bg, color: KEY_PILL[state].fg,
                  fontFamily: MONO, fontSize: 9.5, fontWeight: 600,
                }}
              >
                {state.toUpperCase()}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '18px 20px', borderRadius: 12, background: C.ochreBg, border: `1px solid ${C.ochreBorder}` }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#6E4800' }}>Translation debt, stated plainly</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 9 }}>
          {I18N_DEBT.map((d) => (
            <div key={d} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <Icon name="ph ph-dot-outline" size={16} color={C.ochre} style={{ marginTop: 1 }} />
              <span style={{ fontSize: 13.5, lineHeight: 1.55, color: C.ochre }}>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

const SEV_PILL: Record<Severity, { bg: string; fg: string }> = {
  block: { bg: '#FBF0EB', fg: C.clay },
  nudge: { bg: C.ochreBg, fg: C.ochre },
  info: { bg: C.gTint, fg: C.gd },
}

function Validation() {
  return (
    <>
      <SectionHead title="Validation and edge cases">
        Every rule is enforced server-side as well as in the client. The message column is what the member or officer
        actually reads — put it in the locale file, not in the component.
      </SectionHead>

      {RULES.map((rg) => (
        <div key={rg.name} style={{ borderRadius: 12, background: C.white, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px',
              background: C.gTint, borderBottom: '1px solid #DDE9E2',
            }}
          >
            <Icon name={rg.icon} size={17} color={C.g} />
            <span style={{ fontSize: 15, fontWeight: 600, color: C.gd }}>{rg.name}</span>
          </div>
          {rg.rows.map((r) => (
            <div
              key={r.rule}
              style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr 92px', borderTop: '1px solid #EFEEE8', alignItems: 'start' }}
            >
              <div style={{ padding: '13px 18px', fontSize: 13.5, lineHeight: 1.5, fontWeight: 500 }}>{r.rule}</div>
              <div style={{ padding: '13px 18px', fontSize: 13, lineHeight: 1.5, color: C.mut }}>{r.msg}</div>
              <div style={{ padding: '13px 18px' }}>
                <span
                  style={{
                    display: 'inline-block', padding: '3px 9px', borderRadius: 99,
                    background: SEV_PILL[r.sev].bg, color: SEV_PILL[r.sev].fg,
                    fontFamily: MONO, fontSize: 9.5, fontWeight: 600,
                  }}
                >
                  {r.sev.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

function ScreenStates() {
  const template = '144px repeat(4,1fr)'
  return (
    <>
      <SectionHead title="Screen states">
        The mockups show the loaded, happy case. These are the other four a build has to draw. Skeletons must occupy the
        same box as the loaded content so nothing shifts.
      </SectionHead>

      <div style={{ borderRadius: 12, background: C.white, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: template, background: C.gTint, borderBottom: '1px solid #DDE9E2' }}>
          {['SCREEN', 'LOADING', 'EMPTY', 'ERROR', 'OFFLINE / CACHED'].map((h) => (
            <div key={h} style={{ padding: '11px 14px', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.1em', color: C.g }}>
              {h}
            </div>
          ))}
        </div>
        {STATES.map((row, i) => (
          <div key={row[0]} style={{ display: 'grid', gridTemplateColumns: template, borderTop: '1px solid #EFEEE8', background: stripe(i) }}>
            <div style={{ padding: '13px 14px', fontSize: 13, fontWeight: 600 }}>{row[0]}</div>
            {row.slice(1).map((cell, j) => (
              <div key={j} style={{ padding: '13px 14px', fontSize: 12.5, lineHeight: 1.5, color: C.mut, borderLeft: '1px solid #EFEEE8' }}>
                {cell}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

function Breakpoints() {
  return (
    <>
      <SectionHead title="Breakpoints and density">
        Two products, not one responsive one. The phone app is native; the web app is a browser layout that must survive
        a 1024-wide office monitor and a 360-wide phone browser. The console shares the web app's breakpoints.
      </SectionHead>

      {BREAKPOINTS.map((b) => (
        <div
          key={b.range}
          style={{
            display: 'grid', gridTemplateColumns: '170px 1fr', borderRadius: 12,
            background: C.white, border: `1px solid ${C.line}`, overflow: 'hidden',
          }}
        >
          <div style={{ padding: 18, background: C.gTint, borderRight: '1px solid #DDE9E2' }}>
            <Mono size={14} weight={500} color={C.g}>{b.range}</Mono>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{b.name}</div>
            <Mono size={10.5} color="#5C8A72" style={{ display: 'block', lineHeight: 1.5, marginTop: 3 }}>{b.who}</Mono>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {b.rules.map((r) => (
              <div key={r} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <Icon name="ph ph-arrow-right" size={14} color={C.faint} style={{ marginTop: 3 }} />
                <span style={{ fontSize: 13.5, lineHeight: 1.55, color: C.mut }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Card>
        <Kicker>NON-NEGOTIABLE MINIMUMS</Kicker>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginTop: 12 }}>
          {MINIMUMS.map((m) => (
            <div key={m.title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Icon name={m.icon} size={16} color={C.g} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 13.5, lineHeight: 1.5, color: C.mut }}>
                <span style={{ fontWeight: 600, color: C.ink }}>{m.title}</span> — {m.body}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

function RailBranching() {
  const template = '170px repeat(4,1fr)'
  return (
    <>
      <SectionHead title="How the four rails branch">
        The single largest source of conditional logic in the product. Treat the rail as a first-class field on the
        member record, resolved once at sign-in and passed to every screen.
      </SectionHead>

      <div style={{ borderRadius: 12, background: C.white, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: template, background: C.gTint, borderBottom: '1px solid #DDE9E2' }}>
          {RAIL_HEAD.map((h) => (
            <div key={h} style={{ padding: '11px 14px', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.1em', color: C.g }}>
              {h}
            </div>
          ))}
        </div>
        {RAILS.map((row, i) => (
          <div key={row[0]} style={{ display: 'grid', gridTemplateColumns: template, borderTop: '1px solid #EFEEE8', background: stripe(i) }}>
            <div style={{ padding: '13px 14px', fontSize: 13, fontWeight: 600 }}>{row[0]}</div>
            {row.slice(1).map((cell, j) => (
              <div key={j} style={{ padding: '13px 14px', fontSize: 12.5, lineHeight: 1.5, color: C.mut, borderLeft: '1px solid #EFEEE8' }}>
                {cell}
              </div>
            ))}
          </div>
        ))}
      </div>

      <Card>
        <Kicker>STILL OPEN</Kicker>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 11 }}>
          {OPEN_QUESTIONS.map((o) => (
            <div key={o.title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Icon
                name={o.warn ? 'ph-fill ph-warning-circle' : 'ph ph-info'}
                size={16}
                color={o.warn ? C.ochre : C.faint}
                style={{ marginTop: 2 }}
              />
              <span style={{ fontSize: 13.5, lineHeight: 1.55, color: C.mut }}>
                <span style={{ fontWeight: 600, color: C.ink }}>{o.title}</span> — {o.body}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
