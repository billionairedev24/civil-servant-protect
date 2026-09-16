import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { Lang, Strings } from '../../i18n'
import { useT } from '../../i18n'
import { sponsorById, type Sponsor, type SponsorId } from '../../data/sponsors'
import type { PhoneScreen } from './nav'

interface PhoneStateShape {
  otp: string
  otpError: boolean
  enrolStep: number
  accStep: number
  clStep: number
  tier: number
  /** Selected option index per accident-report step. */
  acc: number[]
  /** Selected option index per claim-wizard choice step. */
  cl: number[]
  offline: boolean
  /** How many beneficiaries are named (2 or 3). */
  benes: number
  /** Harness: the deduction has not arrived on time. */
  late: boolean
  /** Harness: bright-sunlight contrast simulation. */
  sun: boolean
}

const INITIAL: PhoneStateShape = {
  otp: '',
  otpError: false,
  enrolStep: 0,
  accStep: 0,
  clStep: 0,
  tier: 1,
  acc: [0, 0, 0, 0],
  cl: [0, 0],
  offline: false,
  benes: 2,
  late: false,
  sun: false,
}

export interface PhoneCtx extends PhoneStateShape {
  /** Owned by the router, not by this provider. */
  screen: PhoneScreen
  t: Strings
  lang: Lang
  setLang: (l: Lang) => void
  sponsor: Sponsor
  setSponsor: (id: SponsorId) => void
  set: (patch: Partial<PhoneStateShape>) => void
  go: (screen: PhoneScreen) => void
  pressKey: (digit: string) => void
}

const Ctx = createContext<PhoneCtx | null>(null)

export function usePhone(): PhoneCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePhone must be used inside <PhoneStateProvider>')
  return ctx
}

export function PhoneStateProvider({
  lang,
  setLang,
  sponsorId,
  setSponsor,
  screen,
  navigate,
  demo,
  children,
}: {
  lang: Lang
  setLang: (l: Lang) => void
  sponsorId: SponsorId
  setSponsor: (id: SponsorId) => void
  screen: PhoneScreen
  navigate: (screen: PhoneScreen) => void
  /** Scenario flags from `?demo=`; there is no in-product toggle for these. */
  demo?: { late: boolean; offline: boolean; sun: boolean }
  children: React.ReactNode
}) {
  const [state, setState] = useState<PhoneStateShape>({
    ...INITIAL,
    late: demo?.late ?? false,
    offline: demo?.offline ?? false,
    sun: demo?.sun ?? false,
  })
  const t = useT()

  const set = useCallback((patch: Partial<PhoneStateShape>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])

  const go = useCallback(
    (to: PhoneScreen) => {
      setState((s) => ({ ...s, otpError: false }))
      navigate(to)
    },
    [navigate],
  )

  /**
   * OTP keypad. Six digits auto-advances to the fingerprint screen after a beat,
   * which is what makes the demo feel like a real handset.
   */
  const pressKey = useCallback((digit: string) => {
    setState((s) => {
      if (digit === 'del') return { ...s, otp: s.otp.slice(0, -1), otpError: false }
      if (s.otp.length >= 6) return s
      const next = s.otp + digit
      if (next.length === 6) {
        setTimeout(() => {
          setState((cur) => ({ ...cur, otp: '' }))
          navigate('biometric')
        }, 260)
      }
      return { ...s, otp: next, otpError: false }
    })
  }, [navigate])

  const value = useMemo<PhoneCtx>(
    () => ({
      ...state,
      screen,
      t,
      lang,
      setLang,
      sponsor: sponsorById(sponsorId),
      setSponsor,
      set,
      go,
      pressKey,
    }),
    [state, screen, t, lang, setLang, sponsorId, setSponsor, set, go, pressKey],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
