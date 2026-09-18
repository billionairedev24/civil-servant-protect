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
            One other door, and it goes somewhere now.

            This page used to carry a "Continue with Google" button — a
            design-bundle control wearing Google's logo that opened a
            self-service enrolment flow no member account has ever had — and this
            one, which promised a claim with no account and reached nothing. The
            first is gone. The second is below, backed by `/v1/auth/kin/*`: the
            member cannot sign in to report their own death, so their family
            needs a way in that is not the member's.
          */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0 18px' }}>
            <div style={{ flex: 1, height: 1, background: C.line2 }} />
            <Mono size={11} color={C.faint}>{t.or}</Mono>
            <div style={{ flex: 1, height: 1, background: C.line2 }} />
          </div>

          <button
            type="button"
            className="pick"
            onClick={() => go('kin')}
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

/**
 * Claiming for somebody who has died.
 *
 * The door the sign-in page used to offer and nothing served. It is real now:
 * the member's CSP-ID and a number already named on their record, checked
 * together — see `AuthService.startKinChallenge`. Neither fact alone opens it,
 * and the server answers the same either way, so this cannot be used to ask
 * whether a given person is enrolled.
 *
 * What it leads to is deliberately narrow. A relative signs in to report the
 * death and follow the claim; they do not get the member's ledger, cover,
 * dependants or the other beneficiaries' shares, and that is enforced by the
 * row-level scope rather than by which screens this app happens to render.
 */
export function WebNextOfKin() {
  const { t, go } = useWeb()
  const { live } = useApi()
  const { requestKinCode, submitKinCode, error, clearError } = useAuth()

  const [cspId, setCspId] = useState('')
  const [msisdn, setMsisdn] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const ask = async () => {
    if (!live) return go('claim')
    setBusy(true)
    try {
      const challenge = await requestKinCode(cspId, toE164(msisdn))
      setChallengeId(challenge.challengeId)
      if (challenge.devCode) setCode(challenge.devCode)
    } catch {
      // The message is on the auth context; staying here lets them fix what
      // they typed rather than landing on a code screen that cannot work.
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (!challengeId) return
    setBusy(true)
    try {
      if (await submitKinCode(challengeId, code)) go('claim')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rise" style={{ maxWidth: 470 }}>
      <div style={{ fontSize: 28, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-.025em' }}>
        {t.bene_page_title}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: C.mut, marginTop: 8 }}>{t.bene_page_sub}</div>

      {challengeId === null ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Kicker>{t.their_id}</Kicker>
              <input
                value={cspId}
                onChange={(e) => {
                  setCspId(e.target.value.toUpperCase())
                  clearError()
                }}
                placeholder="CSP-114-88214"
                aria-label={t.their_id}
                style={{
                  padding: 15, border: `1.5px solid ${C.g}`, borderRadius: 10, background: C.white,
                  fontFamily: MONO, fontSize: 17, fontWeight: 500, color: C.ink, minWidth: 0,
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Kicker>{t.your_number}</Kicker>
              <input
                type="tel"
                inputMode="numeric"
                value={msisdn}
                onChange={(e) => {
                  setMsisdn(e.target.value)
                  clearError()
                }}
                placeholder="0803 000 0214"
                aria-label={t.your_number}
                style={{
                  padding: 15, border: `1.5px solid ${C.line4}`, borderRadius: 10, background: C.white,
                  fontFamily: MONO, fontSize: 17, fontWeight: 500, color: C.ink, minWidth: 0,
                }}
              />
            </label>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 20, height: 48, padding: '0 26px', fontSize: 15.5 }}
            disabled={busy || (live && (cspId.length < 6 || msisdn.replace(/\D/g, '').length < 10))}
            onClick={() => void ask()}
          >
            {busy ? '…' : t.start_funeral}
          </button>
        </>
      ) : (
        <>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Kicker>{t.otp_title}</Kicker>
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-label={t.otp_title}
              style={{
                padding: 15, border: `1.5px solid ${C.g}`, borderRadius: 10, background: C.white,
                fontFamily: MONO, fontSize: 24, letterSpacing: '.4em', textAlign: 'center', color: C.ink,
              }}
            />
            <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut }}>
              Sent to the number you gave, if it is one they nominated.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 18, height: 48, padding: '0 26px', fontSize: 15.5 }}
            disabled={busy || (live && code.length !== 6)}
            onClick={() => void verify()}
          >
            {busy ? '…' : 'Continue'}
          </button>
        </>
      )}

      {error && <SignInProblem message={error} />}

      <div
        style={{
          marginTop: 22, padding: '13px 15px', borderRadius: 9,
          background: C.ochreBg, border: `1px solid ${C.ochreBorder}`,
        }}
      >
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.ochre }}>{t.no_id_note}</div>
      </div>
    </div>
  )
}
