import { Icon } from '../../../components/Icon'
import { Mono, RecordRow, StepBars } from '../../../components/primitives'
import { CLAIM, CLAIM_STAGES, CLAIM_SUMMARY_VALUES } from '../../../data/member'
import { C, MONO } from '../../../theme/tokens'
import { Screen, BackButton } from '../Screen'
import { usePhone } from '../state'

const ACC_ICONS = [
  ['ph ph-user', 'ph ph-heart', 'ph ph-baby'],
  ['ph ph-sun', 'ph ph-moon', 'ph ph-calendar-blank'],
  ['ph ph-road-horizon', 'ph ph-briefcase', 'ph ph-house', 'ph ph-map-pin'],
  ['ph ph-ambulance', 'ph ph-bandaids', 'ph ph-house-line'],
]

const CL_ICONS = [
  ['ph ph-flower-lotus', 'ph ph-first-aid', 'ph ph-wheelchair'],
  ['ph ph-user', 'ph ph-heart', 'ph ph-flower-lotus'],
]

/** Accident report. Four taps, works offline, sends itself when network returns. */
export function AccidentScreen() {
  const { t, accStep, acc, set, go } = usePhone()

  return (
    <Screen pad="6px 22px 22px">
      <BackButton onClick={() => (accStep > 0 ? set({ accStep: accStep - 1 }) : go('home'))} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }}>
        <span style={{ fontSize: 19, fontWeight: 700 }}>{t.acc_title}</span>
        <Mono size={11} color={C.faint}>{accStep + 1}/4</Mono>
      </div>
      <StepBars total={4} current={accStep} />

      <div style={{ flex: 1, overflowY: 'auto', marginTop: 20 }}>
        <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-.025em', textWrap: 'balance' }}>
          {t.acc_q[accStep]}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
          {t.acc_o[accStep].map((label, i) => {
            const on = acc[accStep] === i
            return (
              <button
                key={label}
                type="button"
                className="pick"
                onClick={() => {
                  const next = acc.slice()
                  next[accStep] = i
                  set({ acc: next })
                }}
                style={{
                  padding: '18px 16px',
                  border: `1.5px solid ${on ? C.g : C.line}`,
                  background: on ? C.gTint : C.white,
                }}
              >
                <Icon name={ACC_ICONS[accStep]?.[i] ?? 'ph ph-circle'} size={21} color={on ? C.g : C.faint} />
                <span style={{ fontSize: 17, fontWeight: 600 }}>{label}</span>
              </button>
            )
          })}
        </div>

        <div
          style={{
            marginTop: 18, display: 'flex', gap: 10, padding: 14,
            border: `1px solid ${C.line}`, borderRadius: 10, background: C.white,
          }}
        >
          <Icon name="ph ph-floppy-disk" size={18} color={C.g} />
          <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut }}>{t.saved_note}</div>
        </div>
      </div>

      <div style={{ display: 'flex', paddingTop: 12 }}>
        <button
          type="button"
          className="btn btn-xl btn-primary"
          style={{ flex: 1 }}
          onClick={() => {
            if (accStep < 3) return set({ accStep: accStep + 1 })
            set({ accStep: 0 })
            go('track')
          }}
        >
          {accStep < 3 ? t.continue : t.acc_send}
        </button>
      </div>
      <button
        type="button"
        style={{
          marginTop: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          background: 'transparent', border: 0, color: C.mut, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}
      >
        <Icon name="ph ph-phone-call" size={16} />
        {t.call_us}
      </button>
    </Screen>
  )
}

/** Five-step claim wizard: what happened → who for → papers → review → done. */
export function ClaimScreen() {
  const { t, clStep, cl, set, go } = usePhone()
  const docIcons = ['ph-fill ph-check-circle', 'ph-fill ph-check-circle', 'ph ph-bank', 'ph ph-plus-circle']

  return (
    <Screen pad="6px 22px 22px">
      <BackButton onClick={() => (clStep > 0 ? set({ clStep: clStep - 1 }) : go('home'))} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }}>
        <span style={{ fontSize: 19, fontWeight: 700 }}>{t.make_claim}</span>
        <Mono size={11} color={C.faint}>{clStep + 1}/5</Mono>
      </div>
      <StepBars total={5} current={clStep} />

      <div style={{ flex: 1, overflowY: 'auto', marginTop: 20 }}>
        <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-.025em', textWrap: 'balance' }}>
          {t.cl_q[clStep]}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: C.mut, marginTop: 6 }}>{t.cl_h[clStep]}</div>

        {clStep < 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
            {t.cl_o[clStep].map((label, i) => {
              const on = cl[clStep] === i
              return (
                <button
                  key={label}
                  type="button"
                  className="pick"
                  onClick={() => {
                    const next = cl.slice()
                    next[clStep] = i
                    set({ cl: next })
                  }}
                  style={{
                    padding: '17px 16px',
                    border: `1.5px solid ${on ? C.g : C.line}`,
                    background: on ? C.gTint : C.white,
                  }}
                >
                  <Icon name={CL_ICONS[clStep]?.[i] ?? 'ph ph-circle'} size={21} color={on ? C.g : C.faint} />
                  <span style={{ fontSize: 16.5, fontWeight: 600 }}>{label}</span>
                </button>
              )
            })}
          </div>
        )}

        {clStep === 2 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
              {t.docs_n.map((name, i) => {
                const done = i < 2
                return (
                  <div
                    key={name}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                      padding: 15, border: `1px solid ${done ? C.gBorder : C.line}`,
                      borderRadius: 12, background: C.white,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <Icon name={docIcons[i]} size={20} color={done ? C.g : C.faint} />
                      <div>
                        <div style={{ fontSize: 15.5, fontWeight: 600 }}>{name}</div>
                        <div style={{ fontSize: 12.5, color: C.faint, marginTop: 1 }}>{t.docs_s[i]}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: done ? C.g : C.faint }}>{t.docs_a[i]}</span>
                  </div>
                )
              })}
            </div>
            <div
              style={{
                marginTop: 14, padding: 14, border: `1px solid ${C.line}`, borderRadius: 10,
                background: C.white, fontSize: 13, lineHeight: 1.5, color: C.mut,
              }}
            >
              {t.docs_note}
            </div>
          </>
        )}

        {clStep === 3 && (
          <>
            <div className="card" style={{ marginTop: 16, overflow: 'hidden' }}>
              {t.sum_k.map((k, i) => (
                <RecordRow key={k} k={k} v={CLAIM_SUMMARY_VALUES[i]} last={i === t.sum_k.length - 1} />
              ))}
            </div>
            {/* The funeral payment is a separate, faster rail from the ₦5m death
                claim — the family needs money in days, not weeks. */}
            <div style={{ marginTop: 14, padding: 15, borderRadius: 12, background: C.gTint2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="ph-fill ph-lightning" size={18} color={C.g} />
                <span style={{ fontSize: 15, fontWeight: 700, color: C.gd }}>{t.funeral_first}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: C.gInk, marginTop: 5 }}>{t.funeral_first_sub}</div>
            </div>
          </>
        )}

        {clStep === 4 && (
          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                width: 52, height: 52, borderRadius: '50%', background: C.gTint2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon name="ph-fill ph-check-circle" size={32} color={C.g} />
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.6, color: C.gInk3 }}>
              {t.claim_ref}{' '}
              <span style={{ fontFamily: MONO, fontWeight: 500, color: C.ink }}>{CLAIM.newRef}</span>
            </div>
            <div
              style={{
                padding: 15, border: `1px solid ${C.line}`, borderRadius: 12, background: C.white,
                fontSize: 13.5, lineHeight: 1.55, color: C.mut,
              }}
            >
              {t.assessor_note}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', paddingTop: 12 }}>
        <button
          type="button"
          className="btn btn-xl btn-primary"
          style={{ flex: 1 }}
          onClick={() => {
            if (clStep < 4) return set({ clStep: clStep + 1 })
            set({ clStep: 0 })
            go('track')
          }}
        >
          {t.cl_cta[clStep]}
        </button>
      </div>
    </Screen>
  )
}

/** Track my claim. Every stage time-stamped and not editable afterwards —
    this is the differentiator the whole product is sold on. */
export function TrackScreen() {
  const { t } = usePhone()

  return (
    <Screen scroll>
      <Mono size={10.5} color={C.faint} style={{ display: 'block', letterSpacing: '.1em', paddingTop: 14 }}>
        {CLAIM.openRef}
      </Mono>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.mut, marginTop: 3 }}>{t.funeral_benefit}</div>
      <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-.035em', marginTop: 2 }}>{CLAIM.funeralAmount}</div>

      <div style={{ marginTop: 18, padding: 16, borderRadius: 14, background: C.gTint2 }}>
        <Mono size={9.5} color={C.gInk} style={{ display: 'block', letterSpacing: '.12em' }}>{t.now_title}</Mono>
        <div style={{ fontSize: 18.5, fontWeight: 700, marginTop: 5 }}>{t.now_head}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: C.gInk, marginTop: 5 }}>{t.now_body}</div>
        <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
          <button type="button" className="btn btn-sm btn-primary" style={{ flex: 1, gap: 7 }}>
            <Icon name="ph ph-chat-circle-text" size={16} />
            {t.msg_assessor}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{ padding: '0 18px', border: `1.5px solid ${C.gBorder2}`, background: 'transparent', color: C.gd }}
            aria-label="Call the claims office"
          >
            <Icon name="ph ph-phone" size={16} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {t.stages.map((title, i) => {
          const st = CLAIM_STAGES[i]
          return (
            <div key={title} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 13 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Icon
                  name={
                    st === 'done'
                      ? 'ph-fill ph-check-circle'
                      : st === 'now'
                        ? 'ph-fill ph-circle-notch'
                        : 'ph ph-circle-dashed'
                  }
                  size={st === 'now' ? 22 : 20}
                  color={st === 'todo' ? C.ghost2 : C.g}
                  style={{ animation: st === 'now' ? 'pulse 1.8s ease-in-out infinite' : 'none' }}
                />
                <div
                  style={{
                    width: 2, flex: 1, borderRadius: 1,
                    background: st === 'todo' ? C.line5 : C.gBorder,
                  }}
                />
              </div>
              <div style={{ paddingBottom: 22 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: st === 'todo' ? C.faint : C.ink }}>{title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.45, color: C.faint, marginTop: 2 }}>{t.stage_when[i]}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ padding: 15 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{t.separate_title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 3 }}>{t.separate_sub}</div>
      </div>
      <div style={{ marginTop: 16, fontSize: 13, lineHeight: 1.55, color: C.faint }}>{t.audit_note}</div>
    </Screen>
  )
}
