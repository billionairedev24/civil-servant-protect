import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { CLAIM, MEMBER } from '../../../data/member'
import { C } from '../../../theme/tokens'
import { Screen } from '../Screen'
import { usePhone } from '../state'

export function HomeScreen() {
  const { t, sponsor, offline, late, go } = usePhone()

  /* The pay row is the first thing a member checks when a payslip looks wrong,
     so it states the rail's status plainly rather than assuming success. */
  const payRow = late
    ? {
        head: t.home_pay_head, sub: t.home_pay_sub, icon: 'ph-fill ph-warning-circle',
        ic: C.ochre, bc: C.ochreBorder, bg: C.ochreBg, fg: C.ochreInk, subFg: C.ochre,
      }
    : {
        head: sponsor.payroll ? t.pay_p_head : t.pay_s_head, sub: t.home_pay_ok,
        icon: 'ph ph-credit-card', ic: C.g, bc: C.gBorder, bg: C.gTint, fg: C.ink, subFg: C.mut,
      }

  return (
    <Screen scroll>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: C.faint }}>{t.greeting}</div>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.02em' }}>{MEMBER.name}</div>
        </div>
        <button
          type="button"
          onClick={() => go('more')}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: `1px solid ${C.line3}`,
            background: C.white, color: C.g, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {MEMBER.initials}
        </button>
      </div>

      {offline && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '12px 13px',
            border: `1px solid ${C.ochreBorder}`, borderRadius: 10, background: C.ochreBg,
          }}
        >
          <Icon name="ph-fill ph-cloud-slash" size={18} color={C.ochre} />
          <div style={{ fontSize: 13, lineHeight: 1.45, color: C.ochreInk }}>{t.offline_note}</div>
        </div>
      )}

      <button
        type="button"
        className="pick"
        onClick={() => go('pay')}
        style={{
          gap: 11, marginTop: 14, padding: '13px 14px',
          border: `1px solid ${payRow.bc}`, borderRadius: 11, background: payRow.bg,
        }}
      >
        <Icon name={payRow.icon} size={20} color={payRow.ic} />
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: payRow.fg }}>{payRow.head}</span>
          <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4, color: payRow.subFg, marginTop: 1 }}>
            {payRow.sub}
          </span>
        </span>
        <Icon name="ph ph-caret-right" size={16} color={payRow.ic} />
      </button>

      {/* The benefit, stated as a number and a named person. The whole product
          is credibility, and this card carries most of it. */}
      <div style={{ marginTop: 18, padding: 20, borderRadius: 16, background: C.g, color: '#F2F7F4' }}>
        <Kicker size={9.5} color="inherit" style={{ opacity: 0.85 }}>{t.if_you_die}</Kicker>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-.035em', marginTop: 5 }}>₦5,500,000</div>
        <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 5, opacity: 0.9 }}>
          {t.paid_to} <span style={{ fontWeight: 600 }}>Chinedu Okafor</span>
        </div>
        <div style={{ height: 1, background: 'rgba(242,247,244,.22)', margin: '16px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12.5, opacity: 0.85 }}>{t.accident_amount}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 1 }}>₦10,500,000</div>
          </div>
          <button type="button" className="btn btn-xs btn-on-green" onClick={() => go('benefits')}>
            {t.see_cover}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <button
          type="button"
          className="pick"
          onClick={() => go('accident')}
          style={{
            gap: 14, padding: '19px 17px',
            border: `1.5px solid ${C.clay}`, borderRadius: 12, background: C.clayBg,
          }}
        >
          <Icon name="ph-fill ph-first-aid-kit" size={26} color={C.clay} />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 18, fontWeight: 700 }}>{t.report_accident}</span>
            <span style={{ display: 'block', fontSize: 13, color: C.clayInk, marginTop: 2 }}>{t.report_sub}</span>
          </span>
          <Icon name="ph ph-caret-right" size={18} color={C.clay} />
        </button>
        <button
          type="button"
          className="pick"
          onClick={() => go('claim')}
          style={{ gap: 14, padding: '19px 17px', border: `1px solid ${C.line}`, borderRadius: 12, background: C.white }}
        >
          <Icon name="ph ph-file-text" size={26} color={C.g} />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 18, fontWeight: 700 }}>{t.make_claim}</span>
            <span style={{ display: 'block', fontSize: 13, color: C.mut, marginTop: 2 }}>{t.claim_sub}</span>
          </span>
          <Icon name="ph ph-caret-right" size={18} color={C.faint} />
        </button>
      </div>

      <button
        type="button"
        className="pick"
        onClick={() => go('track')}
        style={{
          alignItems: 'flex-start', gap: 12, marginTop: 16, padding: 16,
          border: `1px solid ${C.gBorder}`, borderRadius: 12, background: C.gTint,
        }}
      >
        <span
          style={{
            width: 10, height: 10, borderRadius: '50%', background: C.g, marginTop: 5,
            flex: 'none', animation: 'pulse 1.8s ease-in-out infinite',
          }}
        />
        <span style={{ flex: 1 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15.5, fontWeight: 600 }}>{t.claim_status}</span>
            <Mono size={11} color={C.mut}>{CLAIM.homeRef}</Mono>
          </span>
          <span style={{ display: 'block', fontSize: 13, lineHeight: 1.45, color: C.gInk2, marginTop: 3 }}>
            {t.claim_status_sub}
          </span>
        </span>
      </button>

      <Kicker style={{ marginTop: 26 }}>{t.attention}</Kicker>
      <button
        type="button"
        className="pick"
        onClick={() => go('benes')}
        style={{
          gap: 12, marginTop: 9, padding: 16,
          border: `1.5px solid ${C.ochreBorder2}`, borderRadius: 12, background: C.ochreBg,
        }}
      >
        <Icon name="ph ph-users-three" size={23} color={C.ochre} />
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600 }}>{t.confirm_benes}</span>
          <span style={{ display: 'block', fontSize: 13, color: C.ochreInk, marginTop: 2 }}>{t.confirm_benes_sub}</span>
        </span>
        <Icon name="ph ph-caret-right" size={17} color={C.ochre} />
      </button>

      <div
        style={{
          marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.line}`,
          fontSize: 13, lineHeight: 1.55, color: C.faint,
        }}
      >
        {t.ussd_note}
      </div>
    </Screen>
  )
}
