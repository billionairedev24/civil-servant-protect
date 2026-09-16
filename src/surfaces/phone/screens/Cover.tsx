import { Icon } from '../../../components/Icon'
import { Kicker, Mono, ScreenTitle, Sub } from '../../../components/primitives'
import { EN_ONLY, fill } from '../../../i18n'
import {
  BENEFICIARIES, FAMILY_COVER, MEMBER, SCHEDULE_VALUES, TIER_NAMES,
} from '../../../data/member'
import { C } from '../../../theme/tokens'
import { Screen } from '../Screen'
import { usePhone } from '../state'
import { TierList } from './Setup'

/** Digital CSP-ID. Saved on the handset and openable with no network — the
    whole point of it is that it works when nothing else does. */
export function ProtectionCardScreen() {
  const { t, sponsor } = usePhone()
  return (
    <Screen scroll>
      <ScreenTitle style={{ paddingTop: 12 }}>{t.card_title}</ScreenTitle>
      <Sub>{t.card_sub}</Sub>

      <div
        style={{
          marginTop: 16, borderRadius: 16, background: C.ink, color: C.surface,
          padding: '20px 18px', position: 'relative', overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute', right: -30, top: -30, width: 130, height: 130,
            borderRadius: '50%', background: 'rgba(4,106,56,.4)',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="ph-fill ph-shield-check" size={19} color={C.gBright} />
            <Mono size={9} style={{ letterSpacing: '.13em' }}>CIVIL SERVANT PROTECT</Mono>
          </div>
          <Mono
            size={9}
            style={{
              letterSpacing: '.1em', border: '1px solid rgba(247,246,242,.4)',
              borderRadius: 5, padding: '3px 7px',
            }}
          >
            STANDARD
          </Mono>
        </div>

        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 18, letterSpacing: '-.02em' }}>{MEMBER.fullName}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.45, opacity: 0.7, marginTop: 3 }}>
          {MEMBER.role}
          <br />
          {MEMBER.ministry}
        </div>

        <div style={{ display: 'flex', gap: 26, marginTop: 18 }}>
          <div>
            <Mono size={8.5} style={{ letterSpacing: '.12em', opacity: 0.6 }}>{t.csp_id}</Mono>
            <Mono size={16} weight={500} style={{ display: 'block', marginTop: 3 }}>{MEMBER.cspId}</Mono>
          </div>
          <div>
            <Mono size={8.5} style={{ letterSpacing: '.12em', opacity: 0.6 }}>{t.in_force}</Mono>
            <Mono size={16} weight={500} style={{ display: 'block', marginTop: 3 }}>{MEMBER.inForceSince}</Mono>
          </div>
        </div>

        <div
          style={{
            marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(247,246,242,.18)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          }}
        >
          <div>
            <Mono size={8.5} style={{ letterSpacing: '.12em', opacity: 0.6 }}>COLLECTED BY</Mono>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 3 }}>{sponsor.short}</div>
          </div>
          <Mono
            size={9}
            color={C.gBright}
            style={{
              letterSpacing: '.1em', border: '1px solid rgba(95,191,140,.5)',
              borderRadius: 5, padding: '3px 7px',
            }}
          >
            {sponsor.tag}
          </Mono>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginTop: 20 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, opacity: 0.72, maxWidth: 165 }}>{t.scan_note}</div>
          <div
            style={{
              width: 78, height: 78, borderRadius: 8,
              background: 'repeating-conic-gradient(#14181B 0 25%,#F7F6F2 0 50%) 0 0/9.75px 9.75px',
              border: `4px solid ${C.surface}`,
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
        <button type="button" className="btn btn-sm btn-primary" style={{ flex: 1, gap: 8 }}>
          <Icon name="ph ph-download-simple" size={17} />
          {t.save_phone}
        </button>
        <button type="button" className="btn btn-sm btn-secondary" style={{ flex: 1, gap: 8 }}>
          <Icon name="ph ph-share-network" size={17} />
          {t.share_hr}
        </button>
      </div>

      <Kicker style={{ marginTop: 26 }}>{t.device}</Kicker>
      <div className="card" style={{ marginTop: 9, padding: 15 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{MEMBER.device}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.g, fontWeight: 600 }}>
            <Icon name="ph-fill ph-seal-check" size={15} />
            {t.trusted}
          </span>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.faint, marginTop: 5 }}>{t.device_note}</div>
      </div>
    </Screen>
  )
}

export function BenefitsScreen() {
  const { t, tier, set } = usePhone()
  return (
    <Screen scroll>
      <ScreenTitle style={{ paddingTop: 12 }}>{t.cover_title}</ScreenTitle>
      <Sub>{t.cover_sub}</Sub>

      <div style={{ marginTop: 14 }}>
        {t.sched.map((k, i) => (
          <div
            key={k}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              gap: 14, padding: '14px 0', borderBottom: `1px solid ${C.line5}`,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 500 }}>{k}</div>
            <div style={{ fontSize: 15.5, fontWeight: 700, whiteSpace: 'nowrap', color: C.g }}>
              {SCHEDULE_VALUES[i]}
            </div>
          </div>
        ))}
      </div>

      <Kicker style={{ marginTop: 26 }}>{t.change_plan}</Kicker>
      <div style={{ marginTop: 10 }}>
        <TierList selected={tier} onSelect={(i) => set({ tier: i })} />
      </div>

      <div
        style={{
          marginTop: 14, padding: 14, border: `1px solid ${C.line}`, borderRadius: 10,
          background: C.white, fontSize: 13, lineHeight: 1.55, color: C.mut,
        }}
      >
        {t.plan_note}
      </div>
      <button type="button" className="btn btn-xl btn-primary" style={{ width: '100%', marginTop: 12 }}>
        {fill(t.upgrade, { tier: TIER_NAMES[tier] })}
      </button>
      <div style={{ marginTop: 20, fontSize: 12, lineHeight: 1.6, color: C.ghost }}>{t.disclaimer}</div>
    </Screen>
  )
}

/** Unnominated or stale beneficiaries are what turn a 20-day claim into a
    12-month dispute, so this screen nags and the share validator is visible. */
export function BeneficiariesScreen() {
  const { t, benes, set, go } = usePhone()
  const shown = BENEFICIARIES.slice(0, benes)

  return (
    <Screen scroll>
      <ScreenTitle style={{ paddingTop: 12 }}>{t.benes_title}</ScreenTitle>
      <Sub>{t.benes_sub}</Sub>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
        {shown.map((b) => (
          <div key={b.name} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{b.name}</div>
                <div style={{ fontSize: 13, color: C.mut, marginTop: 2 }}>
                  {t.fam_n[b.relIndex]} · {b.phone}
                </div>
              </div>
              <div style={{ fontSize: 21, fontWeight: 700, color: C.g }}>{b.share}%</div>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: C.line8, marginTop: 12, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${b.share}%`, background: C.g }} />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-md btn-tinted" onClick={() => set({ benes: Math.min(3, benes + 1) })}>
          <Icon name="ph ph-plus" size={16} />
          {t.add_person}
        </button>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 15 }}>
        <button
          type="button"
          className="pick"
          onClick={() => go('beneconf')}
          style={{
            gap: 11, marginBottom: 14, padding: 15,
            border: `1px solid ${C.ochreBorder}`, background: C.ochreBg,
          }}
        >
          <Icon name="ph ph-calendar-check" size={19} color={C.ochre} />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.ochreInk }}>
              {EN_ONLY.beneconf_due_card}
            </span>
            <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4, color: C.ochre, marginTop: 2 }}>
              {EN_ONLY.beneconf_due_card_sub}
            </span>
          </span>
          <Icon name="ph ph-caret-right" size={15} color={C.ochre} />
        </button>

        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{t.shares_title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 3 }}>
          {benes === 3 ? EN_ONLY.benes_unshared : EN_ONLY.benes_balanced}
        </div>
      </div>

      <button type="button" className="btn btn-xl btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={() => go('home')}>
        {t.confirm_correct}
      </button>
      <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12.5, color: C.faint }}>{t.ask_again}</div>
    </Screen>
  )
}

/** Annual re-confirmation. Runs once a year against the payroll cycle. */
export function BeneConfirmScreen() {
  const { t, go } = usePhone()
  const rows = [
    { b: BENEFICIARIES[0], ok: true, note: EN_ONLY.beneconf_named_since },
    { b: BENEFICIARIES[1], ok: false, note: EN_ONLY.beneconf_unreachable },
  ]

  return (
    <Screen scroll>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 14 }}>
        <Mono
          size={9.5}
          color={C.ochre}
          style={{ letterSpacing: '.1em', border: `1px solid ${C.ochreBorder}`, borderRadius: 5, padding: '3px 7px' }}
        >
          {EN_ONLY.beneconf_badge}
        </Mono>
        <Mono size={10.5} color={C.faint}>{EN_ONLY.beneconf_due}</Mono>
      </div>

      <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.02em', marginTop: 10, textWrap: 'balance' }}>
        {EN_ONLY.beneconf_title}
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.55, color: C.mut, marginTop: 8 }}>{EN_ONLY.beneconf_sub}</div>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map(({ b, ok, note }) => (
          <div key={b.name} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{b.name}</div>
                <div style={{ fontSize: 13, color: C.mut, marginTop: 2 }}>
                  {t.fam_n[b.relIndex]} · {b.phone}
                </div>
              </div>
              <div style={{ fontSize: 21, fontWeight: 700, color: C.g }}>{b.share}%</div>
            </div>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 7, marginTop: 11,
                paddingTop: 11, borderTop: `1px solid ${C.line7}`,
              }}
            >
              <Icon
                name={ok ? 'ph-fill ph-check-circle' : 'ph ph-warning-circle'}
                size={15}
                color={ok ? C.g : C.ochre}
              />
              <span style={{ fontSize: 12.5, lineHeight: 1.4, color: ok ? C.mut : C.ochre }}>{note}</span>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{ marginTop: 16, padding: 15, border: `1px solid ${C.ochreBorder}`, borderRadius: 12, background: C.ochreBg }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="ph-fill ph-info" size={17} color={C.ochre} />
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ochreInk }}>{EN_ONLY.beneconf_ignore_title}</div>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.ochre, marginTop: 5 }}>{EN_ONLY.beneconf_ignore_body}</div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" className="btn btn-xl btn-primary" style={{ width: '100%' }} onClick={() => go('home')}>
          {EN_ONLY.beneconf_yes}
        </button>
        <button type="button" className="btn btn-lg btn-secondary" style={{ width: '100%' }} onClick={() => go('benes')}>
          {EN_ONLY.beneconf_changed}
        </button>
      </div>
      <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12.5, lineHeight: 1.5, color: C.faint }}>
        {EN_ONLY.beneconf_footnote}
      </div>
    </Screen>
  )
}

export function FamilyScreen() {
  const { t } = usePhone()
  return (
    <Screen scroll>
      <ScreenTitle style={{ paddingTop: 12 }}>{t.fam_title}</ScreenTitle>
      <Sub>{t.fam_sub}</Sub>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
        {FAMILY_COVER.map((f) => (
          <div
            key={f.name}
            style={{
              padding: 16,
              border: `1.5px solid ${f.active ? C.gBorder : C.line}`,
              borderRadius: 12,
              background: f.active ? C.gTint : C.white,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <Icon name={f.icon} size={22} color={f.active ? C.g : C.faint} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 13, color: C.mut, marginTop: 1 }}>{t.fam_n[f.relIndex]}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: f.active ? C.g : C.faint }}>{f.cover}</div>
              <div style={{ fontSize: 12.5, color: C.faint, marginTop: 1 }}>{f.price}</div>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-md btn-tinted">
          <Icon name="ph ph-plus" size={16} />
          {t.add_family}
        </button>
      </div>

      <div className="card" style={{ marginTop: 18, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, color: C.mut }}>{t.new_total}</span>
          <span style={{ fontSize: 23, fontWeight: 700 }}>₦4,300</span>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.faint, marginTop: 5 }}>{t.new_total_sub}</div>
      </div>
    </Screen>
  )
}
