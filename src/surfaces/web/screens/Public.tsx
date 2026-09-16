import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { TIER_NAMES, TIER_PRICES } from '../../../data/member'
import { C, MONO } from '../../../theme/tokens'
import { WEB_MEMBER } from '../data'
import { ParityNote } from '../ui'
import { useWeb } from '../state'

/**
 * Sign in. Two stages on one page: number, then the 6-digit code.
 *
 * Deliberately weaker than the phone's options — there is no fingerprint and no
 * trusted-device shortcut here, because a browser session may well be on a
 * shared secretariat or cyber-cafe machine. Every web session is SMS + a
 * 20-minute idle timeout.
 */
export function WebSignIn() {
  const { t, otp, otpStage, set, go } = useWeb()

  return (
    <div className="rise" style={{ maxWidth: 430 }}>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.025em' }}>{t.signin_title}</div>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: C.mut, marginTop: 7 }}>
        On a browser we send a 6-digit code every time. {t.phone_sub}
      </div>

      {otpStage ? (
        <>
          <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Kicker>{t.otp_title}</Kicker>
            <div style={{ display: 'flex', gap: 8 }}>
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: 52, height: 60,
                    border: `1.5px solid ${otp.length === i ? C.g : C.line4}`,
                    borderRadius: 10, background: C.white,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: MONO, fontSize: 22, fontWeight: 500,
                  }}
                >
                  {otp[i] ?? ''}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: C.mut }}>
              {t.otp_sub} <span style={{ color: C.ink, fontWeight: 600 }}>{WEB_MEMBER.phoneMasked}</span> ·{' '}
              <button
                type="button"
                onClick={() => set({ otpStage: false, otp: '' })}
                style={{ border: 0, background: 'transparent', color: C.g, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Change number
              </button>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.faint }}>{t.voice_fallback}</div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ height: 48, padding: '0 26px', fontSize: 15.5 }}
              onClick={() => {
                set({ otpStage: false, otp: '' })
                go('home')
              }}
            >
              Verify and sign in
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: 48, padding: '0 20px', fontSize: 15.5 }}
              onClick={() => set({ otp: '418206' })}
            >
              Fill demo code
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Kicker>{t.phone_label}</Kicker>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: 16,
                border: `1.5px solid ${C.g}`, borderRadius: 10, background: C.white,
              }}
            >
              <span style={{ fontSize: 16, color: C.mut, fontWeight: 500 }}>+234</span>
              <Mono size={19} weight={500}>{WEB_MEMBER.phoneEntry}</Mono>
              <span style={{ width: 2, height: 22, background: C.g, animation: 'pulse 1.1s steps(1) infinite' }} />
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.faint }}>{t.phone_sub}</div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 22, height: 48, padding: '0 26px', fontSize: 15.5 }}
            onClick={() => set({ otpStage: true })}
          >
            {t.send_code}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0 18px' }}>
            <div style={{ flex: 1, height: 1, background: C.line2 }} />
            <Mono size={11} color={C.faint}>{t.or}</Mono>
            <div style={{ flex: 1, height: 1, background: C.line2 }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: 48, fontSize: 15.5, gap: 11 }}
              onClick={() => go('enrol')}
            >
              <Icon name="ph-fill ph-google-logo" size={18} color={C.g} />
              {t.google}
            </button>
            <button
              type="button"
              className="pick"
              onClick={() => go('beneportal')}
              style={{
                alignItems: 'flex-start', gap: 12, padding: 15,
                border: `1.5px solid ${C.line3}`, borderRadius: 10, background: C.white,
              }}
            >
              <Icon name="ph ph-hand-heart" size={20} color={C.g} style={{ marginTop: 1 }} />
              <span>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{t.bene_title}</span>
                <span style={{ display: 'block', fontSize: 13, lineHeight: 1.45, color: C.mut, marginTop: 2 }}>
                  {t.bene_sub}
                </span>
              </span>
            </button>
          </div>
        </>
      )}

      <div style={{ marginTop: 26 }}>
        <ParityNote kind="phone-only">
          Fingerprint sign-in and the trusted-device shortcut stay on the phone. On a browser, every session is
          6-digit SMS + a 20-minute idle timeout, because these machines are shared.
        </ParityNote>
      </div>
    </div>
  )
}

/** Tier choice at enrolment — step 2 of 3. */
export function WebEnrol() {
  const { t, tier, sponsor, set, go } = useWeb()
  const payroll = sponsor.payroll

  return (
    <div className="rise" style={{ maxWidth: 560 }}>
      <Kicker>{t.step} 2 / 3</Kicker>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.025em', marginTop: 7 }}>{t.e1_title}</div>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: C.mut, marginTop: 6 }}>
        {t.e1_sub}{' '}
        {payroll
          ? 'Your sponsor deducts it before your salary reaches you.'
          : 'Debited from the account on your mandate.'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 22 }}>
        {TIER_NAMES.map((name, i) => {
          const on = tier === i
          return (
            <button
              key={name}
              type="button"
              className="pick"
              onClick={() => set({ tier: i })}
              style={{
                alignItems: 'flex-start', gap: 13, padding: 16, borderRadius: 11,
                border: `1.5px solid ${on ? C.g : C.line3}`,
                background: on ? C.gTint : C.white,
              }}
            >
              <span
                style={{
                  flex: 'none', width: 19, height: 19, borderRadius: '50%',
                  border: `2px solid ${on ? C.g : C.line9}`,
                  background: on ? C.g : 'transparent', marginTop: 2,
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 16.5, fontWeight: 600 }}>{name}</span>
                  <Mono size={14} weight={500} color={C.g}>{TIER_PRICES[i]}</Mono>
                </span>
                <span style={{ display: 'block', fontSize: 13.5, lineHeight: 1.5, color: C.mut, marginTop: 4 }}>
                  {t.tier_d[i]}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 16, padding: '14px 15px', borderRadius: 10, background: C.white, border: `1px solid ${C.line}` }}>
        {[
          ['Deducted monthly', <Mono key="p" size={14.5} weight={500}>{TIER_PRICES[tier]}</Mono>],
          ['Collected by', <span key="c" style={{ fontWeight: 600 }}>{sponsor.short}</span>],
          ['First deduction', <span key="f" style={{ fontWeight: 600 }}>{payroll ? 'September payslip' : '28 September, by direct debit'}</span>],
        ].map(([label, value], i) => (
          <div
            key={String(label)}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14.5, marginTop: i ? 7 : 0 }}
          >
            <span style={{ color: C.mut }}>{label}</span>
            {value}
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ marginTop: 20, height: 48, padding: '0 26px', fontSize: 15.5 }}
        onClick={() => go('home')}
      >
        {t.continue}
      </button>
      <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5, color: C.faint }}>{t.disclaimer}</div>
    </div>
  )
}

/**
 * Next-of-kin portal. No account, no session — a relative with a CSP-ID and a
 * phone number. Often they are being helped by someone with a laptop at a
 * business centre, which is exactly why this page takes scans.
 */
export function WebBenePortal() {
  const { t, go } = useWeb()

  return (
    <div className="rise" style={{ maxWidth: 470 }}>
      <div style={{ fontSize: 28, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-.025em' }}>
        {t.bene_page_title}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: C.mut, marginTop: 8 }}>{t.bene_page_sub}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Kicker>{t.their_id}</Kicker>
          <div style={{ padding: 15, border: `1.5px solid ${C.g}`, borderRadius: 10, background: C.white }}>
            <Mono size={17} weight={500}>{WEB_MEMBER.cspId}</Mono>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Kicker>{t.your_number}</Kicker>
          <div style={{ padding: 15, border: `1.5px solid ${C.line4}`, borderRadius: 10, background: C.white }}>
            <Mono size={17} weight={500} color={C.mut}>{WEB_MEMBER.kinPhone}</Mono>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ marginTop: 20, height: 48, padding: '0 26px', fontSize: 15.5 }}
        onClick={() => go('track')}
      >
        {t.start_funeral}
      </button>
      <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5, color: C.mut }}>{t.funeral_target}</div>

      <div
        style={{
          marginTop: 22, padding: '13px 15px', borderRadius: 9,
          background: C.ochreBg, border: `1px solid ${C.ochreBorder}`,
        }}
      >
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.ochre }}>{t.no_id_note}</div>
      </div>

      <div style={{ marginTop: 16 }}>
        <ParityNote kind="web-only">
          A next-of-kin is often helped by a relative with a laptop at a business centre. This page accepts scanned
          documents up to 10 MB each — the phone flow caps at camera photos.
        </ParityNote>
      </div>
    </div>
  )
}
