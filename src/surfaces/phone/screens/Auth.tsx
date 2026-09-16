import { useEffect, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { useAuth } from '../../../api/auth'
import { useApi } from '../../../api/provider'
import { Kicker, Mono } from '../../../components/primitives'
import { EN_ONLY, LANGS, type Lang } from '../../../i18n'
import { MEMBER } from '../../../data/member'
import { C, MONO } from '../../../theme/tokens'
import { Screen, BackButton } from '../Screen'
import { usePhone } from '../state'

export function SplashScreen() {
  const { t, lang, setLang, go } = usePhone()
  return (
    <Screen pad="0 24px 28px">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
        <div
          style={{
            width: 54, height: 54, borderRadius: 15, background: C.g,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="ph-fill ph-shield-check" size={29} color={C.surface} />
        </div>
        <div>
          <div style={{ fontSize: 32, lineHeight: 1.12, fontWeight: 700, letterSpacing: '-.03em' }}>
            Civil Servant
            <br />
            Protect Plan
          </div>
          <div style={{ fontSize: 15.5, lineHeight: 1.5, color: C.mut, marginTop: 9 }}>{t.tagline}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 2 }}>
          <Kicker style={{ letterSpacing: '.13em' }}>CHOOSE YOUR LANGUAGE</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {LANGS.map(([code, name]) => {
              const on = lang === code
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code as Lang)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '15px 13px',
                    border: `1.5px solid ${on ? C.g : C.line3}`, borderRadius: 10,
                    background: on ? C.gTint : C.white, color: on ? C.gd : C.ink,
                    fontSize: 15.5, fontWeight: on ? 600 : 500, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Icon
                    name={on ? 'ph-fill ph-check-circle' : 'ph ph-circle'}
                    size={17}
                    color={on ? C.g : C.ghost2}
                  />
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <button type="button" className="btn btn-xl btn-primary" style={{ width: '100%' }} onClick={() => go('auth')}>
        {t.continue}
      </button>
      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12.5, color: C.faint }}>{t.size_note}</div>
    </Screen>
  )
}

export function SignInScreen() {
  const { t, go } = usePhone()
  return (
    <Screen pad="8px 24px 26px">
      <div style={{ marginTop: 22, fontSize: 27, fontWeight: 700, letterSpacing: '-.025em' }}>
        {t.signin_title}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: C.mut, marginTop: 6 }}>{t.signin_sub}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
        <button type="button" className="btn btn-xl btn-secondary" onClick={() => go('otp')} style={{ gap: 11 }}>
          <Icon name="ph-bold ph-google-logo" size={19} color={C.g} />
          {t.google}
        </button>
        <button type="button" className="btn btn-xl btn-primary" onClick={() => go('phone')} style={{ gap: 11 }}>
          <Icon name="ph-fill ph-device-mobile" size={19} />
          {t.phone_btn}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0 18px' }}>
        <div style={{ flex: 1, height: 1, background: C.line2 }} />
        <Mono size={11} color={C.faint}>{t.or}</Mono>
        <div style={{ flex: 1, height: 1, background: C.line2 }} />
      </div>

      {/* The two non-member doors. A grieving relative and an HR officer must
          never be routed through a member login. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <button
          type="button"
          className="pick"
          onClick={() => go('bene')}
          style={{
            alignItems: 'flex-start', gap: 12, padding: '16px 15px',
            border: `1.5px solid ${C.line3}`, borderRadius: 10, background: C.white,
          }}
        >
          <Icon name="ph ph-hand-heart" size={21} color={C.g} style={{ marginTop: 1 }} />
          <span>
            <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600 }}>{t.bene_title}</span>
            <span style={{ display: 'block', fontSize: 13, lineHeight: 1.4, color: C.mut, marginTop: 2 }}>
              {t.bene_sub}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="pick"
          onClick={() => go('hr')}
          style={{
            alignItems: 'flex-start', gap: 12, padding: '16px 15px',
            border: `1px solid ${C.line}`, borderRadius: 10, background: 'transparent',
          }}
        >
          <Icon name="ph ph-buildings" size={21} color={C.mut} style={{ marginTop: 1 }} />
          <span>
            <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600 }}>{t.hr_title}</span>
            <span style={{ display: 'block', fontSize: 13, lineHeight: 1.4, color: C.mut, marginTop: 2 }}>
              {t.hr_sub}
            </span>
          </span>
        </button>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.faint, textAlign: 'center' }}>{t.ussd_note}</div>
    </Screen>
  )
}

export function PhoneNumberScreen() {
  const { t, go, set } = usePhone()
  const { live } = useApi()
  const { requestCode, error, clearError } = useAuth()
  // Pre-filled with the seeded member, so a demo is one tap and a real sign-in
  // is still a normal text field.
  const [msisdn, setMsisdn] = useState<string>(MEMBER.phoneEntry)
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!live) return go('otp')
    setSending(true)
    try {
      const challenge = await requestCode(toE164(msisdn))
      set({ challengeId: challenge.challengeId, otp: '' })
      go('otp')
    } catch {
      // The message is already on the auth context; staying put lets them fix
      // the number rather than landing on a code screen that cannot work.
    } finally {
      setSending(false)
    }
  }

  return (
    <Screen pad="8px 24px 24px">
      <BackButton to="auth" />
      <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-.025em', marginTop: 12 }}>{t.phone_title}</div>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: C.mut, marginTop: 6 }}>{t.phone_sub}</div>

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Kicker>{t.phone_label}</Kicker>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 11, padding: '17px 16px',
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
      </div>

      {error && <SignInError message={error} />}

      <div style={{ height: 20 }} />
      <button
        type="button"
        className="btn btn-xl btn-primary"
        style={{ width: '100%' }}
        disabled={sending}
        onClick={() => void send()}
      >
        {sending ? '…' : t.send_code}
      </button>
    </Screen>
  )
}

export function OtpScreen() {
  const { t, otp, otpError, challengeId, set, go, pressKey } = usePhone()
  const { live } = useApi()
  const { submitCode, error, clearError } = useAuth()

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

  /* The sixth digit. On fixtures it advances after a beat, which is what makes
     the demo feel like a handset. Against the API it is verified first — three
     wrong codes locks the number for fifteen minutes, so navigating optimistically
     would strand someone on a screen their session never reached. */
  useEffect(() => {
    if (otp.length !== 6) return
    let cancelled = false

    if (!live) {
      const timer = setTimeout(() => {
        set({ otp: '' })
        go('biometric')
      }, 260)
      return () => clearTimeout(timer)
    }

    void (async () => {
      const ok = await submitCode(challengeId ?? '', otp)
      if (cancelled) return
      if (ok) {
        set({ otp: '' })
        go('biometric')
      } else {
        set({ otp: '', otpError: true })
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, live, challengeId])

  return (
    <Screen pad="8px 24px 22px">
      <BackButton to="phone" />
      <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-.025em', marginTop: 10 }}>{t.otp_title}</div>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: C.mut, marginTop: 6 }}>
        {t.otp_sub} <span style={{ color: C.ink, fontWeight: 600 }}>{MEMBER.phoneMasked}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
        {Array.from({ length: 6 }, (_, i) => {
          const filled = i < otp.length
          const active = i === otp.length
          return (
            <div
              key={i}
              style={{
                flex: 1, height: 60,
                border: `1.5px solid ${otpError ? C.clay : active || filled ? C.g : C.line}`,
                borderRadius: 10, background: C.white,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 24, fontWeight: 500,
              }}
            >
              {filled ? otp[i] : ''}
            </div>
          )
        })}
      </div>

      <div style={{ minHeight: 46, marginTop: 13 }}>
        {otpError ? (
          <div
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 13px',
              border: `1.5px solid ${C.clay}`, borderRadius: 10, background: C.clayBg,
            }}
          >
            <Icon name="ph-fill ph-warning-circle" size={18} color={C.clay} />
            {/* The server counts the attempts and locks the number after three,
                so its message ("Wrong code. 2 attempt(s) left") is more use than
                the generic line — which stays for the fixture demo. */}
            <div style={{ fontSize: 13.5, lineHeight: 1.45, color: C.clayInk }}>{error ?? t.wrong_code}</div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 13.5, color: C.faint,
            }}
          >
            <span>{t.resend} 0:24</span>
            <button
              type="button"
              onClick={() => {
                clearError()
                set({ otpError: true, otp: '' })
              }}
              style={{
                background: 'transparent', border: 0, color: C.ghost, fontSize: 12,
                cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              demo: wrong code
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, textAlign: 'center', marginBottom: 12 }}>
        {t.voice_fallback}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {keys.map((k, i) =>
          // The blank cell left of the zero is spacing, so it is a spacer — not
          // a hidden, disabled, unnamed button sitting in the tab order.
          k === '' ? (
            <div key={i} aria-hidden="true" />
          ) : (
            <button
              key={i}
              type="button"
              aria-label={k === '⌫' ? EN_ONLY.otp_delete : k}
              onClick={() => pressKey(k === '⌫' ? 'del' : k)}
              style={{
                padding: '15px 0', border: `1px solid ${C.line}`, borderRadius: 10,
                background: C.white, color: C.ink,
                fontSize: 22, fontWeight: 500, cursor: 'pointer',
              }}
            >
              {k}
            </button>
          ),
        )}
      </div>
    </Screen>
  )
}

/**
 * A Nigerian mobile number, however it was typed, as E.164.
 *
 * People write their own number the way they say it — 0803 0000 214 — and a
 * field labelled "+234" invites both that and the bare 803 0000 214. Pasting
 * from a contact gives +234803.... All three are the same number, and the
 * server only recognises one of them, so the app does the conversion instead of
 * making someone guess which form it wants.
 */
function toE164(entry: string): string {
  let digits = entry.replace(/\D/g, '')
  if (digits.startsWith('234')) digits = digits.slice(3)
  // The trunk prefix used for domestic dialling. It is not part of the number.
  if (digits.startsWith('0')) digits = digits.slice(1)
  return `+234${digits}`
}

/** What the server said, rather than a generic apology. */
function SignInError({ message }: { message: string }) {
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

export function BiometricScreen() {
  const { t, go } = usePhone()
  const { live } = useApi()
  // On fixtures this is the front of the enrolment tour, so it continues into
  // it. Against the API you only reach this screen by signing in to an account
  // that already exists — sending that member back through "who pays you" would
  // be asking them to enrol twice.
  const next = () => go(live ? 'home' : 'sponsor')
  return (
    <Screen pad="8px 24px 28px">
      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
          alignItems: 'center', gap: 22, textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 106, height: 106, borderRadius: '50%', background: C.gTint2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'pulse 2.6s ease-in-out infinite',
          }}
        >
          <Icon name="ph ph-fingerprint" size={54} color={C.g} />
        </div>
        <div>
          <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-.025em' }}>{t.bio_title}</div>
          <div style={{ fontSize: 15, lineHeight: 1.5, color: C.mut, marginTop: 8 }}>{t.bio_sub}</div>
        </div>
      </div>
      <button type="button" className="btn btn-xl btn-primary" style={{ width: '100%' }} onClick={next}>
        {t.bio_on}
      </button>
      <button
        type="button"
        onClick={next}
        style={{
          width: '100%', marginTop: 9, padding: 15, border: 0, background: 'transparent',
          color: C.mut, fontSize: 15, fontWeight: 500, cursor: 'pointer',
        }}
      >
        {t.bio_later}
      </button>
    </Screen>
  )
}
