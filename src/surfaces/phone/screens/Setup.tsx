import { Icon } from '../../../components/Icon'
import { Kicker, Mono, RecordRow, StepBars } from '../../../components/primitives'
import { EN_ONLY } from '../../../i18n'
import { SPONSORS } from '../../../data/sponsors'
import {
  EMPLOYER_ONBOARDING, MEMBER, RECORD_VALUES, TIER_CODES, TIER_NAMES, TIER_PRICES, BENEFICIARIES,
} from '../../../data/member'
import { BENEFIT_SCHEDULE } from '../../../api/fixtures'
import { useSchedule } from '../../../api/queries'
import { BENEFIT_LABEL_INDEX, naira, useLive } from '../../../api/live'
import { C, MONO } from '../../../theme/tokens'
import { Screen, BackButton } from '../Screen'
import { usePhone } from '../state'

/** "Who pays your salary?" — the four-door enrolment router. */
export function SponsorScreen() {
  const { t, sponsor, setSponsor, go } = usePhone()
  return (
    <Screen pad="8px 24px 24px">
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.025em', marginTop: 20, textWrap: 'balance' }}>
        {t.sp_title}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: C.mut, marginTop: 7 }}>{t.sp_sub}</div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9, marginTop: 20 }}>
        {t.sp_o.map((label, i) => {
          const on = sponsor.id === SPONSORS[i].id
          return (
            <button
              key={label}
              type="button"
              className="pick"
              // The private-employer door needs a confirmation step of its own:
              // the member is joining someone else's scheme and has to see the
              // split and the privacy boundary before agreeing.
              onClick={() => {
                setSponsor(SPONSORS[i].id)
                if (SPONSORS[i].id === 'employer') go('onboard')
              }}
              style={{
                padding: 16,
                border: `1.5px solid ${on ? C.g : C.line}`,
                background: on ? C.gTint : C.white,
              }}
            >
              <Icon name={SPONSORS[i].icon} size={22} color={on ? C.g : C.faint} />
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 16.5, fontWeight: 600 }}>{label}</span>
                <span style={{ display: 'block', fontSize: 13, lineHeight: 1.4, color: C.mut, marginTop: 2 }}>
                  {t.sp_d[i]}
                </span>
              </span>
            </button>
          )
        })}
        <div
          style={{
            display: 'flex', gap: 10, padding: 14, border: `1px solid ${C.line}`,
            borderRadius: 10, background: C.white, marginTop: 2,
          }}
        >
          <Icon name="ph ph-arrows-left-right" size={18} color={C.g} />
          <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut }}>{t.sp_note}</div>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-xl btn-primary"
        style={{ width: '100%', marginTop: 14 }}
        onClick={() => go('verify')}
      >
        {t.continue}
      </button>
    </Screen>
  )
}

/**
 * NIN + BVN check. The honest version: identity resolves through a licensed
 * verification agent and NIBSS, but employment cannot be confirmed by an API —
 * it waits on the monthly payroll file, so it sits pending rather than green.
 */
export function VerifyScreen() {
  const { t, sponsor, go } = usePhone()
  const via = ['NIMC · licensed verification agent', 'NIBSS · name and account match', sponsor.ledger]

  return (
    <Screen pad="8px 24px 24px">
      <BackButton to="sponsor" />
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.025em', marginTop: 8 }}>{t.vf_title}</div>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: C.mut, marginTop: 6 }}>{t.vf_sub}</div>

      <div style={{ flex: 1, overflowY: 'auto', marginTop: 20, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {t.vf_k.map((k, i) => {
          const pending = i === 2 && sponsor.payroll
          const ic = pending ? C.ochre : C.g
          return (
            <div
              key={k}
              style={{
                padding: 15,
                border: `1.5px solid ${pending ? C.ochreBorder : C.gBorder}`,
                borderRadius: 12,
                background: pending ? C.ochreBg : C.gTint,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name={pending ? 'ph ph-clock-countdown' : 'ph-fill ph-seal-check'} size={19} color={ic} />
                  <Mono size={11} color={C.mut} style={{ letterSpacing: '.08em' }}>{k}</Mono>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: ic }}>
                  {pending ? t.vf_s[2] : t.vf_s[Math.min(i, 1)]}
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 7 }}>
                {i === 2 ? sponsor.org : t.vf_v[i]}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.45, color: C.faint, marginTop: 3 }}>{via[i]}</div>
            </div>
          )
        })}
        <div
          style={{
            display: 'flex', gap: 10, padding: 14, border: `1px solid ${C.ochreBorder}`,
            borderRadius: 10, background: C.ochreBg,
          }}
        >
          <Icon name="ph ph-clock-countdown" size={18} color={C.ochre} />
          <div style={{ fontSize: 13, lineHeight: 1.5, color: C.ochreInk }}>{t.vf_note}</div>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-xl btn-primary"
        style={{ width: '100%', marginTop: 14 }}
        onClick={() => go('enrol')}
      >
        {t.vf_cta}
      </button>
    </Screen>
  )
}

export function EnrolScreen() {
  const { t, enrolStep, tier, benes, set, go } = usePhone()
  const titles = [t.e0_title, t.e1_title, t.e2_title]
  const subs = [t.e0_sub, t.e1_sub, t.e2_sub]

  return (
    <Screen pad="8px 24px 24px">
      <BackButton onClick={() => (enrolStep > 0 ? set({ enrolStep: enrolStep - 1 }) : go('verify'))} />
      <StepBars total={3} current={enrolStep} />
      <Kicker style={{ marginTop: 14 }}>
        {t.step} {enrolStep + 1} / 3
      </Kicker>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.025em', marginTop: 10 }}>{titles[enrolStep]}</div>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: C.mut, marginTop: 6 }}>{subs[enrolStep]}</div>

      <div style={{ flex: 1, overflowY: 'auto', marginTop: 16 }}>
        {enrolStep === 0 && (
          <>
            <div className="card" style={{ overflow: 'hidden' }}>
              {t.rec_k.map((k, i) => (
                <RecordRow key={k} k={k} v={RECORD_VALUES[i]} last={i === t.rec_k.length - 1} />
              ))}
            </div>
            {/* A quiet text link, not a tinted pill — it was reading as an input. */}
            <button type="button" className="btn-link" style={{ marginTop: 13 }}>
              {t.e0_wrong}
            </button>
          </>
        )}

        {enrolStep === 1 && <TierList selected={tier} onSelect={(i) => set({ tier: i })} />}

        {enrolStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {BENEFICIARIES.slice(0, benes).map((b) => (
              <div
                key={b.name}
                className="card"
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 12, padding: 15,
                }}
              >
                <div>
                  <div style={{ fontSize: 15.5, fontWeight: 600 }}>{b.name}</div>
                  <div style={{ fontSize: 13, color: C.mut, marginTop: 1 }}>{t.fam_n[b.relIndex]}</div>
                </div>
                <div style={{ fontSize: 19, fontWeight: 700, color: C.g }}>{b.share}%</div>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-md btn-tinted"
              onClick={() => set({ benes: Math.min(3, benes + 1) })}
            >
              <Icon name="ph ph-plus" size={16} />
              {t.add_person}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', paddingTop: 14 }}>
        <button
          type="button"
          className="btn btn-xl btn-primary"
          style={{ flex: 1 }}
          onClick={() => (enrolStep < 2 ? set({ enrolStep: enrolStep + 1 }) : go('enroldone'))}
        >
          {t.continue}
        </button>
      </div>
    </Screen>
  )
}

/** Shared by enrolment step 2 and the benefits screen's plan switcher. */
export function TierList({ selected, onSelect }: { selected: number; onSelect: (i: number) => void }) {
  const { t } = usePhone()
  const { data: schedule } = useLive(useSchedule(BENEFIT_SCHEDULE), BENEFIT_SCHEDULE)

  /*
   * The line under each plan: the headline benefit, from that plan's own
   * figures.
   *
   * It used to be a translated sentence per tier — "₦3m life · ₦3m accident ·
   * ₦150k medical" — which went on saying ₦3m after the schedule said ₦2m, two
   * inches under a table that said ₦2m. Those strings are gone; a summary of
   * figures has to be made of the figures.
   *
   * One benefit, not three. Death, accident and disability carry the same
   * amount on every tier, so listing all three was one number said three times
   * — and the labels are sentences, written to stand on their own line in five
   * languages rather than to be strung together with a dot between them.
   */
  const headline = (code: string) => {
    const plan = schedule.tiers.find((p) => p.code === code)
    const death = plan?.benefits.find((b) => b.key === 'death')
    if (!death?.valueMinor) return ''
    return `${naira(death.valueMinor)} · ${t.sched[BENEFIT_LABEL_INDEX.death]}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {TIER_NAMES.map((name, i) => {
        const on = selected === i
        const plan = schedule.tiers[i]
        return (
          <button
            key={name}
            type="button"
            className="pick"
            onClick={() => onSelect(i)}
            style={{
              display: 'block', padding: 16,
              border: `1.5px solid ${on ? C.g : C.line}`,
              background: on ? C.gTint : C.white,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{name}</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: on ? C.gd : C.ink }}>
                {plan ? naira(plan.priceMinor) : TIER_PRICES[i]}
              </span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.45, color: C.mut, marginTop: 5 }}>
              {headline(TIER_CODES[i])}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function EnrolDoneScreen() {
  const { t, go } = usePhone()
  return (
    <Screen pad="8px 24px 28px">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: '50%', background: C.gTint2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="ph-fill ph-check-circle" size={34} color={C.g} />
        </div>
        <div>
          <div style={{ fontSize: 29, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-.03em' }}>
            {t.done_title}
          </div>
          <div style={{ fontSize: 15.5, lineHeight: 1.55, color: C.mut, marginTop: 10 }}>{t.done_sub}</div>
        </div>
        <div className="card" style={{ padding: 17 }}>
          <Kicker>{t.your_id}</Kicker>
          <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 500, letterSpacing: '.04em', marginTop: 5 }}>
            {MEMBER.cspId}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: C.mut, marginTop: 7 }}>{t.id_note}</div>
        </div>
      </div>
      <button type="button" className="btn btn-xl btn-primary" style={{ width: '100%' }} onClick={() => go('home')}>
        {t.go_home}
      </button>
    </Screen>
  )
}

/** Private-employer onboarding: confirm the scheme before joining it. */
export function EmployerOnboardScreen() {
  const { go } = usePhone()
  const e = EMPLOYER_ONBOARDING

  return (
    <Screen scroll pad="8px 24px 26px">
      <BackButton to="sponsor" />
      <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.g }} />
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.g }} />
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.line }} />
      </div>
      <Kicker style={{ marginTop: 12 }}>{EN_ONLY.onboard_step}</Kicker>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.025em', marginTop: 8, textWrap: 'balance' }}>
        {EN_ONLY.onboard_title}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: C.mut, marginTop: 8 }}>{EN_ONLY.onboard_sub}</div>

      <div style={{ marginTop: 20, padding: 18, border: `1.5px solid ${C.g}`, borderRadius: 12, background: C.white }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              flex: 'none', width: 42, height: 42, borderRadius: 11, background: C.gTint,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="ph ph-buildings" size={22} color={C.g} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em' }}>{e.name}</div>
            <div style={{ fontSize: 13, color: C.mut, marginTop: 2 }}>{e.where}</div>
          </div>
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line7}` }}>
          {[
            [EN_ONLY.onboard_scheme_code, e.schemeCode],
            [EN_ONLY.onboard_staff_no, e.staffNo],
            [EN_ONLY.onboard_started, e.started],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0' }}>
              <span style={{ fontSize: 13, color: C.mut }}>{k}</span>
              <Mono size={13.5} weight={500}>{v}</Mono>
            </div>
          ))}
        </div>
      </div>

      <Kicker size={9.5} style={{ marginTop: 22 }}>{EN_ONLY.onboard_split}</Kicker>
      <div className="card" style={{ marginTop: 9, padding: 16 }}>
        <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: C.line7 }}>
          <div style={{ flex: e.employerShare, background: C.g }} />
          <div style={{ flex: e.memberShare, background: C.gSoft }} />
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {[
            { dot: C.g, label: EN_ONLY.onboard_employer_pays, value: e.employerPays },
            { dot: C.gSoft, label: EN_ONLY.onboard_you_pay, value: e.memberPays },
          ].map((x) => (
            <div key={x.label} style={{ flex: 1, minWidth: 112, display: 'flex', gap: 7 }}>
              <span style={{ flex: 'none', width: 9, height: 9, borderRadius: 3, background: x.dot, marginTop: 4 }} />
              <span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{x.label}</span>
                <Mono size={15} style={{ display: 'block', marginTop: 2 }}>{x.value}</Mono>
              </span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.mut, marginTop: 12 }}>{EN_ONLY.onboard_split_note}</div>
      </div>

      <div style={{ marginTop: 16, padding: 15, border: `1px solid ${C.gBorder}`, borderRadius: 12, background: C.gTint }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="ph-fill ph-eye-slash" size={17} color={C.g} />
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.gd }}>{EN_ONLY.onboard_privacy_title}</div>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.mut, marginTop: 5 }}>{EN_ONLY.onboard_privacy_body}</div>
      </div>

      <div
        style={{ marginTop: 16, padding: 15, border: `1px solid ${C.ochreBorder}`, borderRadius: 12, background: C.ochreBg }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="ph ph-arrows-left-right" size={17} color={C.ochre} />
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ochreInk }}>{EN_ONLY.onboard_leave_title}</div>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.ochre, marginTop: 5 }}>{EN_ONLY.onboard_leave_body}</div>
      </div>

      <button
        type="button"
        className="btn btn-xl btn-primary"
        style={{ width: '100%', marginTop: 20 }}
        onClick={() => go('verify')}
      >
        {EN_ONLY.onboard_join}
      </button>
      <button
        type="button"
        className="btn-link"
        style={{ display: 'block', margin: '13px auto 0' }}
        onClick={() => go('sponsor')}
      >
        {EN_ONLY.onboard_not_mine}
      </button>
    </Screen>
  )
}
