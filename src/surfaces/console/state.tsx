import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { sponsorById, type Sponsor, type SponsorId } from '../../data/sponsors'
import { CONSOLE_PROFILE, type ConsoleProfile } from './data'
import type { ConsoleScreen } from './nav'

interface ConsoleStateShape {
  /** Harness: the payroll return file has not arrived (or debits failed). */
  late: boolean
  format: number
  addMode: 0 | 1
  tier: number
  /** Reconciliation filter chip. */
  filter: number
  /** Roster filter chip. */
  rfilter: number
  period: number
}

const INITIAL: ConsoleStateShape = {
  late: false,
  format: 0,
  addMode: 0,
  tier: 1,
  filter: 0,
  rfilter: 0,
  period: 1,
}

export interface ConsoleCtx extends ConsoleStateShape {
  /** Owned by the router. */
  screen: ConsoleScreen
  sponsor: Sponsor
  setSponsor: (id: SponsorId) => void
  profile: ConsoleProfile
  /** True for every rail except self-pay. */
  payroll: boolean
  set: (patch: Partial<ConsoleStateShape>) => void
  go: (screen: ConsoleScreen) => void
}

const Ctx = createContext<ConsoleCtx | null>(null)

export function useConsole(): ConsoleCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useConsole must be used inside <ConsoleStateProvider>')
  return ctx
}

export function ConsoleStateProvider({
  sponsorId,
  setSponsor,
  screen,
  navigate,
  demo,
  children,
}: {
  sponsorId: SponsorId
  setSponsor: (id: SponsorId) => void
  screen: ConsoleScreen
  navigate: (screen: ConsoleScreen) => void
  /** Scenario flags from `?demo=`; there is no in-product toggle for these. */
  demo?: { late: boolean; offline: boolean; sun: boolean }
  children: React.ReactNode
}) {
  const [state, setState] = useState<ConsoleStateShape>({ ...INITIAL, late: demo?.late ?? false })

  const set = useCallback((patch: Partial<ConsoleStateShape>) => setState((s) => ({ ...s, ...patch })), [])
  const go = navigate

  const value = useMemo<ConsoleCtx>(() => {
    const sponsor = sponsorById(sponsorId)
    return {
      ...state,
      screen,
      sponsor,
      setSponsor,
      profile: CONSOLE_PROFILE[sponsor.id],
      payroll: sponsor.payroll,
      set,
      go,
    }
  }, [state, screen, sponsorId, setSponsor, set, go])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
