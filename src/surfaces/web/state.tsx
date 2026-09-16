import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { Lang, Strings } from '../../i18n'
import { useT } from '../../i18n'
import { sponsorById, type Sponsor, type SponsorId } from '../../data/sponsors'
import type { WebScreen } from './nav'

interface WebStateShape {
  tier: number
  otp: string
  /** Sign-in has two stages on one screen: number, then the 6-digit code. */
  otpStage: boolean
  clStep: number
  cl: number[]
  /** Contributions ledger filter chip. */
  filter: number
  late: boolean
}

const INITIAL: WebStateShape = {
  tier: 1,
  otp: '',
  otpStage: false,
  clStep: 0,
  cl: [0, 0],
  filter: 0,
  late: false,
}

export interface WebCtx extends WebStateShape {
  /** Owned by the router. */
  screen: WebScreen
  t: Strings
  lang: Lang
  setLang: (l: Lang) => void
  sponsor: Sponsor
  setSponsor: (id: SponsorId) => void
  set: (patch: Partial<WebStateShape>) => void
  go: (screen: WebScreen) => void
}

const Ctx = createContext<WebCtx | null>(null)

export function useWeb(): WebCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWeb must be used inside <WebStateProvider>')
  return ctx
}

export function WebStateProvider({
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
  screen: WebScreen
  navigate: (screen: WebScreen) => void
  /** Scenario flags from `?demo=`; there is no in-product toggle for these. */
  demo?: { late: boolean; offline: boolean; sun: boolean }
  children: React.ReactNode
}) {
  const [state, setState] = useState<WebStateShape>({ ...INITIAL, late: demo?.late ?? false })
  const t = useT()

  const set = useCallback((patch: Partial<WebStateShape>) => setState((s) => ({ ...s, ...patch })), [])
  const go = navigate

  const value = useMemo<WebCtx>(
    () => ({ ...state, screen, t, lang, setLang, sponsor: sponsorById(sponsorId), setSponsor, set, go }),
    [state, screen, t, lang, setLang, sponsorId, setSponsor, set, go],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
