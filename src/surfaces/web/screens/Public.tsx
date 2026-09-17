import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { Kicker, Mono } from '../../../components/primitives'
import { MEMBER, toE164 } from '../../../data/member'
import { useApi } from '../../../api/provider'
import { useAuth } from '../../../api/auth'
import { C, MONO } from '../../../theme/tokens'
import { useWeb } from '../state'

/** What the server said, rather than a generic apology. See api/auth. */
function SignInProblem({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 14, padding: '12px 13px',
        border: `1px solid ${C.clayBorder2}`, borderRadius: 10, background: C.clayBg,
      }}
    >
      <Icon name="ph-fill ph-warning-circle" size={17} color={C.clay} />
      <span style={{ fontSize: 13, lineHeight: 1.45, color: C.clayInk }}>{message}</span>
    </div>
  )
}

/**
 * Sign in. Two stages on one page: number, then the 6-digit code.
 *
 * Deliberately weaker than the phone's options — there is no fingerprint and no
 * trusted-device shortcut here, because a browser session may well be on a
 * shared secretariat or cyber-cafe machine. Every web session is SMS + a
 * 20-minute idle timeout.
 */
export function WebSignIn() {
  const { t, otp, otpStage, challengeId, set, go } = useWeb()
  const { live } = useApi()
  const { requestCode, submitCode, error, clearError } = useAuth()
  const [msisdn, setMsisdn] = useState<string>(MEMBER.phoneEntry)
  const [busy, setBusy] = useState(false)

  /* On a browser the code is sent every time — there is no device to bind to,
     which is why this differs from the phone app rather than reusing its flow. */
  const sendCode = async () => {
    if (!live) return set({ otpStage: true })
    setBusy(true)
    try {
      const challenge = await requestCode(toE164(msisdn))
      set({ otpStage: true, otp: '', challengeId: challenge.challengeId })
    } catch {
      // The message is on the auth context; staying put lets them fix the
      // number rather than landing on a code screen that cannot work.
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (!live) {
      set({ otpStage: false, otp: '' })
      return go('home')
    }
    setBusy(true)
    try {
      if (await submitCode(challengeId ?? '', otp)) {
        set({ otpStage: false, otp: '' })
        go('home')
      }
    } finally {
      setBusy(false)
    }
  }

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
              {t.otp_sub} <span style={{ color: C.ink, fontWeight: 600 }}>{MEMBER.phoneMasked}</span> ·{' '}
              <button
                type="button"
                onClick={() => set({ otpStage: false, otp: '' })}
                className="btn-inline"
                  style={{ fontSize: 13.5 }}
              >
                Change number
              </button>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.faint }}>{t.voice_fallback}</div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ height: 48, padding: '0 26px', fontSize: 15.5 }}
              disabled={busy || (live && otp.length !== 6)}
              onClick={() => void verify()}
            >
              {busy ? '…' : 'Verify and sign in'}
            </button>
            {/* Only on fixtures. Against a real API it filled 000000, which
                works solely on a build with csp.otp.echo on — and that build is
                refused in production. */}
            {!live && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ height: 48, padding: '0 20px', fontSize: 15.5 }}
                onClick={() => set({ otp: '418206' })}
              >
                Fill demo code
              </button>
            )}
          </div>
          {error && <SignInProblem message={error} />}
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
              {live ? (
                <input
                  type="tel"
                  inputMode="numeric"
                  aria-label={t.phone_label}
                  value={msisdn}
                  onChange={(e) => {
                    setMsisdn(e.target.value)
                    clearError()
                  }}
                  style={{
                    flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none',
                    fontFamily: MONO, fontSize: 19, fontWeight: 500, color: C.ink,
                  }}
                />
              ) : (
                <>
                  <Mono size={19} weight={500}>{MEMBER.phoneEntry}</Mono>
                  <span style={{ width: 2, height: 22, background: C.g, animation: 'pulse 1.1s steps(1) infinite' }} />
                </>
              )}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.faint }}>{t.phone_sub}</div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 22, height: 48, padding: '0 26px', fontSize: 15.5 }}
            disabled={busy}
            onClick={() => void sendCode()}
          >
            {busy ? '…' : t.send_code}
          </button>
          {error && <SignInProblem message={error} />}

          {/*
            Nothing else on this page.

            It used to carry a "Continue with Google" button, which no member
            account has ever had — it was a design-bundle control that opened a
            self-service enrolment flow — and a "claim for someone who has died,
            no account needed" door, which promised something no endpoint
            serves. A sign-in page that offers a bereaved relative a route that
            cannot work is worse than one that offers nothing.
          */}
        </>
      )}

      {/*
        Where an officer goes instead.
        
        The two applications are separate deployments on separate addresses, and
        an HR or finance officer arriving here has arrived at the wrong one.
        Saying so is cheaper than a support call, and their sign-in is a
        different thing entirely — a ministry account with an authenticator
        code, not an SMS to a payroll number.
      */}
      <div
        style={{
          marginTop: 30, paddingTop: 18, borderTop: `1px solid ${C.line2}`,
          fontSize: 13, lineHeight: 1.55, color: C.mut,
        }}
      >
        Work in an HR, finance or audit office?{' '}
        <a href="/console" style={{ color: C.g, fontWeight: 600 }}>
          The sponsor console is at /console
        </a>{' '}
        — sign in there with your ministry account.
      </div>
    </div>
  )
}
