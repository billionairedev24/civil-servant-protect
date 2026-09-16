import { Icon } from '../../../components/Icon'
import { Kicker, Mono, ScreenTitle, Sub } from '../../../components/primitives'
import { EN_ONLY } from '../../../i18n'
import { CONTRIB_MONTHS, CONTRIB_RANGE, CONTRIB_TOTAL, LEDGER, WHY_CHANGED } from '../../../data/member'
import { C, MONO } from '../../../theme/tokens'
import { Screen, BackButton } from '../Screen'
import { usePhone } from '../state'

/**
 * How you pay. States the real rail, the real backup, and — because payroll
 * deduction has no retry semantics the app controls — the actual grace timeline:
 * file due → 7-day wait → card attempt → 60-day grace.
 */
export function PayScreen() {
  const { t, sponsor, setSponsor } = usePhone()
  const payroll = sponsor.payroll

  const grace = [
    { label: 'file due', flex: 2, bg: C.g, fg: C.gd },
    { label: '7-day wait', flex: 2, bg: C.gSoft, fg: C.mut },
    { label: 'card tried', flex: 1, bg: C.ochreBorder, fg: C.ochre },
    { label: '60-day grace', flex: 3, bg: C.clayBorder2, fg: C.clay },
  ]

  return (
    <Screen scroll>
      <ScreenTitle style={{ paddingTop: 12 }}>{t.pay_title}</ScreenTitle>
      <Sub>{t.pay_sub}</Sub>

      <Kicker style={{ marginTop: 20 }}>{t.pay_primary}</Kicker>
      <div style={{ marginTop: 9, padding: 17, borderRadius: 14, background: C.g, color: '#F2F7F4' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{payroll ? t.pay_p_head : t.pay_s_head}</div>
          <Mono
            size={9}
            style={{
              letterSpacing: '.1em', border: '1px solid rgba(242,247,244,.45)',
              borderRadius: 5, padding: '3px 7px', whiteSpace: 'nowrap',
            }}
          >
            {sponsor.tag}
          </Mono>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 5, opacity: 0.9 }}>
          {payroll ? t.pay_p_body : t.pay_s_body}
        </div>
        <Mono
          size={11.5}
          style={{
            display: 'block', marginTop: 11, paddingTop: 11,
            borderTop: '1px solid rgba(242,247,244,.22)', opacity: 0.92,
          }}
        >
          {sponsor.rail}
        </Mono>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 11 }}>
          <span style={{ fontSize: 12.5, opacity: 0.85 }}>{t.pay_next}</span>
          <span style={{ fontSize: 17, fontWeight: 700 }}>₦2,500 · 28.09</span>
        </div>
      </div>

      <Kicker style={{ marginTop: 22 }}>{t.pay_backup}</Kicker>
      <div style={{ marginTop: 9, padding: 16, border: `1.5px solid ${C.gBorder}`, borderRadius: 14, background: C.white }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <Icon name={payroll ? 'ph ph-credit-card' : 'ph ph-device-mobile'} size={20} color={C.g} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>{payroll ? t.pay_b_head : t.pay_b2_head}</span>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 6 }}>
          {payroll ? t.pay_b_body : t.pay_b2_body}
        </div>
      </div>

      <div className="card" style={{ marginTop: 22, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="ph ph-warning-diamond" size={19} color={C.clay} />
          <span style={{ fontSize: 15.5, fontWeight: 700 }}>{t.pay_if_title}</span>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.mut, marginTop: 6 }}>{t.pay_if_body}</div>
        <div style={{ display: 'flex', gap: 5, marginTop: 14 }}>
          {grace.map((g) => (
            <div key={g.label} style={{ flex: g.flex, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ height: 5, borderRadius: 3, background: g.bg }} />
              <Mono size={9} color={g.fg} style={{ lineHeight: 1.3 }}>{g.label}</Mono>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="ph ph-suitcase-simple" size={19} color={C.g} />
          <span style={{ fontSize: 15.5, fontWeight: 700 }}>{t.pay_move_title}</span>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.mut, marginTop: 6 }}>{t.pay_move_body}</div>
      </div>

      {/* Rolling to card is a real state change, not a settings toggle: it moves
          the member onto the self-pay rail keeping CSP-ID and start date. */}
      <button
        type="button"
        className="btn btn-lg btn-outline"
        style={{ width: '100%', marginTop: 14 }}
        onClick={() => setSponsor('self')}
      >
        <Icon name="ph ph-credit-card" size={18} />
        {t.pay_switch}
      </button>
    </Screen>
  )
}

/**
 * Contributions. The trust artefact: taken straight from the payroll file and
 * not editable by us. A month only turns full green once the remittance file
 * returns; card recoveries are a lighter green; the current month says it is
 * waiting rather than claiming a payment nobody has seen.
 */
export function ContributionsScreen() {
  const { t, sponsor, go } = usePhone()

  const monthStyle = (m: (typeof CONTRIB_MONTHS)[number]) =>
    m === 'waiting'
      ? { background: 'transparent', border: `1.5px dashed ${C.line9}` }
      : { background: m === 'card' ? C.gSoft : C.g, border: '0' }

  return (
    <Screen scroll>
      <ScreenTitle style={{ paddingTop: 12 }}>{t.paid_title}</ScreenTitle>
      <Sub>{t.paid_sub}</Sub>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 18 }}>
        <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-.035em' }}>{CONTRIB_TOTAL}</span>
        <span style={{ fontSize: 13.5, color: C.mut }}>{t.across_months}</span>
      </div>

      <div style={{ display: 'flex', gap: 3, height: 38, marginTop: 14 }}>
        {CONTRIB_MONTHS.map((m, i) => (
          <div key={i} style={{ flex: 1, borderRadius: 3, ...monthStyle(m) }} />
        ))}
      </div>
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', fontFamily: MONO,
          fontSize: 10.5, color: C.faint, marginTop: 7,
        }}
      >
        <span>{CONTRIB_RANGE[0]}</span>
        <span>{CONTRIB_RANGE[1]}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 13 }}>
        {t.ct_legend.map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 10, height: 10, borderRadius: 3, flex: 'none',
                background: [C.g, C.gSoft, 'transparent'][i],
                border: i === 2 ? `1.5px dashed ${C.line9}` : '0',
              }}
            />
            <span style={{ fontSize: 12, color: C.mut }}>{label}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 13, padding: 14, border: `1px solid ${C.line}`, borderRadius: 10,
          background: C.white, fontSize: 13, lineHeight: 1.55, color: C.mut,
        }}
      >
        {t.ct_note}
      </div>

      <Kicker style={{ marginTop: 26 }}>{t.recent}</Kicker>
      <div style={{ marginTop: 6 }}>
        {LEDGER.map((r) => {
          const icon = r.src === 2 ? 'ph ph-clock-countdown' : r.src === 1 ? 'ph ph-credit-card' : 'ph-fill ph-check-circle'
          const ic = r.src === 2 ? C.faint : r.src === 1 ? C.gSoft : C.g
          const source = r.src === 1 ? 'CARD' : r.src === 2 ? 'NOT YET IN THE FILE' : sponsor.ledger
          return (
            <div
              key={r.month}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                padding: '14px 0', borderBottom: `1px solid ${C.line5}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Icon name={icon} size={19} color={ic} />
                <div>
                  {/* A self-paying member has no payroll deduction, so the row
                      must not call it one — the whole point of this screen is
                      that it says only what actually happened. Both labels are
                      existing translated copy. */}
                  <div style={{ fontSize: 15, fontWeight: 500 }}>
                    {r.src === 1 ? t.pay_b_head : sponsor.payroll ? t.deduction : t.pay_s_head}
                  </div>
                  <Mono size={11.5} color={C.faint} style={{ display: 'block', marginTop: 2 }}>
                    {r.month} · {source}
                  </Mono>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: ic }}>₦2,500</div>
                {/* `src` states are named for the payroll rail ("Payroll"), so a
                    cleared self-pay month borrows the rail-neutral "Confirmed"
                    from the legend rather than naming a deduction that never
                    happened. Both are already translated in all five locales. */}
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>
                  {sponsor.payroll || r.src !== 0 ? t.src[r.src] : t.ct_legend[0]}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        className="pick"
        onClick={() => go('whychanged')}
        style={{
          marginTop: 16, gap: 11, padding: 15,
          border: `1px solid ${C.ochreBorder}`, background: C.ochreBg,
        }}
      >
        <Icon name="ph-fill ph-question" size={19} color={C.ochre} />
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.ochreInk }}>
            {EN_ONLY.why_entry_title}
          </span>
          <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4, color: C.ochre, marginTop: 2 }}>
            {EN_ONLY.why_entry_sub}
          </span>
        </span>
        <Icon name="ph ph-caret-right" size={15} color={C.ochre} />
      </button>

      <button type="button" className="btn btn-lg btn-secondary" style={{ width: '100%', marginTop: 10, gap: 8 }}>
        <Icon name="ph ph-download-simple" size={17} />
        {t.download}
      </button>
    </Screen>
  )
}

/**
 * "Why your contribution changed." Built before it was needed: if experience
 * rating ever forces a price change, a million people have to be told in a way
 * that does not read as a betrayal.
 */
export function WhyChangedScreen() {
  const { sponsor } = usePhone()
  const payroll = sponsor.payroll

  const intro = payroll
    ? `Your ${sponsor.tag === 'FEDERAL' ? 'IPPIS' : 'payroll'} deduction changes from the September run. Nothing was taken early, and nothing is backdated.`
    : 'Your direct debit changes from the September collection. Nothing was taken early, and nothing is backdated.'

  const discount = payroll
    ? `There are now over 8,000 members on ${sponsor.org}, which moves the whole group into a cheaper band.`
    : 'Paying by direct debit costs us less to collect than card, and that is passed back to you.'

  const whenTitle = payroll ? 'First taken on the September payroll' : 'First taken on 28 September'
  const whenBody = payroll
    ? 'The new amount is on the schedule already with your employer. Your August contribution was the old ₦2,500 — check your payslip against the contributions screen if the two disagree.'
    : 'The new amount is on your mandate already. Your August debit was the old ₦2,500.'

  const lines = [
    { ...WHY_CHANGED.lines[0], title: EN_ONLY.why_tier_title, body: EN_ONLY.why_tier_body },
    { ...WHY_CHANGED.lines[1], title: EN_ONLY.why_family_title, body: EN_ONLY.why_family_body },
    { ...WHY_CHANGED.lines[2], title: EN_ONLY.why_discount_title, body: discount },
  ]

  return (
    <Screen scroll>
      <BackButton to="contrib" />
      <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.02em', marginTop: 6, textWrap: 'balance' }}>
        {EN_ONLY.why_title}
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.55, color: C.mut, marginTop: 8 }}>{intro}</div>

      <div className="card" style={{ marginTop: 20, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <Mono size={9.5} color={C.faint} style={{ letterSpacing: '.1em' }}>{EN_ONLY.why_was}</Mono>
            <Mono size={22} color={C.faint} style={{ display: 'block', textDecoration: 'line-through', marginTop: 3 }}>
              {WHY_CHANGED.was}
            </Mono>
          </div>
          <Icon name="ph ph-arrow-right" size={18} color={C.ghost2} />
          <div>
            <Mono size={9.5} color={C.g} style={{ letterSpacing: '.1em' }}>{EN_ONLY.why_now}</Mono>
            <Mono size={26} weight={500} color={C.ink} style={{ display: 'block', marginTop: 3 }}>
              {WHY_CHANGED.now}
            </Mono>
          </div>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 11 }}>{EN_ONLY.why_lede}</div>
      </div>

      <Kicker size={9.5} style={{ marginTop: 24 }}>{EN_ONLY.why_breakdown}</Kicker>
      <div className="card" style={{ marginTop: 9, padding: '4px 16px' }}>
        {lines.map((l) => (
          <div
            key={l.title}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 0',
              borderBottom: `1px solid ${C.line7}`,
            }}
          >
            <Icon name={l.icon} size={18} color={C.g} style={{ marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{l.title}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.45, color: C.mut, marginTop: 2 }}>{l.body}</div>
            </div>
            <Mono size={14} weight={500} color={l.credit ? C.g : undefined} style={{ flex: 'none' }}>
              {l.amount}
            </Mono>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 0' }}>
          <div style={{ flex: 1, fontSize: 14.5, fontWeight: 700 }}>{EN_ONLY.why_total}</div>
          <Mono size={18} weight={500} style={{ flex: 'none' }}>{WHY_CHANGED.total}</Mono>
        </div>
      </div>

      <div style={{ marginTop: 18, padding: 15, border: `1px solid ${C.gBorder}`, borderRadius: 12, background: C.gTint }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="ph ph-calendar-check" size={17} color={C.g} />
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.gd }}>{whenTitle}</div>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.mut, marginTop: 5 }}>{whenBody}</div>
      </div>

      <div className="card" style={{ marginTop: 14, padding: 15 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{EN_ONLY.why_dispute_title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.mut, marginTop: 5 }}>{EN_ONLY.why_dispute_body}</div>
        <button type="button" className="btn-link" style={{ marginTop: 12 }}>
          {EN_ONLY.why_dispute_cta}
        </button>
      </div>
    </Screen>
  )
}
