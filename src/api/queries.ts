import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { CspApi } from './client'
import { useApi } from './provider'
import type {
  BeneficiarySet, Claim, Ledger, MemberSummary, ProtectionCard, Reconciliation, SponsorDashboard,
} from './types'

/**
 * Query keys in one place, so an invalidation cannot miss a screen.
 *
 * Hierarchical on purpose: invalidating `keys.member()` after a beneficiary
 * change refreshes the dashboard's attention list too, because that list is
 * server-ranked and a confirmed set removes one of its entries.
 */
export const keys = {
  session: () => ['session'] as const,
  member: () => ['member'] as const,
  summary: () => [...keys.member(), 'summary'] as const,
  contributions: (params: object = {}) => [...keys.member(), 'contributions', params] as const,
  card: () => [...keys.member(), 'card'] as const,
  beneficiaries: () => [...keys.member(), 'beneficiaries'] as const,
  claim: (ref: string) => ['claim', ref] as const,
  sponsor: () => ['sponsor'] as const,
  dashboard: () => [...keys.sponsor(), 'dashboard'] as const,
  reconciliation: (sponsorId: string, cycleId: string) =>
    [...keys.sponsor(), 'reconciliation', sponsorId, cycleId] as const,
}

/**
 * Options shared by every read.
 *
 * `placeholderData` rather than `initialData`: the fixture shows immediately and
 * the query still runs, so the cache never treats hard-coded data as fresh. When
 * `VITE_API_URL` is unset the query is disabled and the placeholder is simply
 * what the screen renders — which is how the whole fixture demo keeps working
 * without a single conditional at any call site.
 *
 * Each hook calls `useQuery` directly rather than going through a wrapper: the
 * options differ per resource in ways that matter (a protection card is good for
 * ninety days, an exception queue is not), and a concrete type here keeps
 * `placeholderData` honest about the shape it is standing in for.
 */
function shared<T>(api: CspApi | null, fixture: T) {
  return { enabled: api !== null, placeholderData: fixture }
}

// ── Member ───────────────────────────────────────────────────────────────────

export function useSummary(fixture: MemberSummary): UseQueryResult<MemberSummary> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.summary(),
    queryFn: () => api!.summary(),
    ...shared(api, fixture),
  })
}

export function useContributions(
  fixture: Ledger,
  params: { from?: string; to?: string; limit?: number } = {},
): UseQueryResult<Ledger> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.contributions(params),
    queryFn: () => api!.contributions(params),
    ...shared(api, fixture),
  })
}

/**
 * The protection card.
 *
 * Long stale time: the QR is a signed token valid for ninety days, so re-fetching
 * it on a glance is pure waste — and this is the one screen most likely to be
 * opened at a hospital gate on a bad connection.
 */
export function useCard(fixture: ProtectionCard): UseQueryResult<ProtectionCard> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.card(),
    queryFn: () => api!.card(),
    staleTime: 60 * 60_000,
    ...shared(api, fixture),
  })
}

export function useBeneficiaries(fixture: BeneficiarySet): UseQueryResult<BeneficiarySet> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.beneficiaries(),
    queryFn: () => api!.beneficiaries(),
    ...shared(api, fixture),
  })
}

export function useClaim(ref: string, fixture: Claim): UseQueryResult<Claim> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.claim(ref),
    queryFn: () => api!.claim(ref),
    ...shared(api, fixture),
  })
}

/**
 * Replace the beneficiary set.
 *
 * No optimistic update. Everywhere else optimism is a kindness; here the server
 * may refuse the whole set for not totalling 100, and showing a member a split
 * that was not saved — on the one record their family depends on — is the worst
 * possible place to be briefly wrong.
 */
export function useReplaceBeneficiaries() {
  const { api } = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (people: { name: string; relation: string; msisdn?: string; sharePct: number }[]) =>
      api!.replaceBeneficiaries(people),
    // The dashboard's attention list is server-ranked and mentions this set, so
    // the whole member branch goes rather than just the one key.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.member() }),
  })
}

export function useConfirmBeneficiaries() {
  const { api } = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api!.confirmBeneficiaries(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.member() }),
  })
}

// ── Sponsor console ──────────────────────────────────────────────────────────

/**
 * The console's home screen.
 *
 * Polled, unlike anything member-side: an officer leaves this open while a
 * colleague works the same queue, and a count that is five minutes stale is how
 * two people resolve the same exception twice.
 */
export function useSponsorDashboard(fixture: SponsorDashboard): UseQueryResult<SponsorDashboard> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.dashboard(),
    queryFn: () => api!.sponsorDashboard(),
    staleTime: 15_000,
    refetchInterval: 60_000,
    ...shared(api, fixture),
  })
}

export function useReconciliation(
  sponsorId: string,
  cycleId: string,
  fixture: Reconciliation,
): UseQueryResult<Reconciliation> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.reconciliation(sponsorId, cycleId),
    queryFn: () => api!.reconciliation(sponsorId, cycleId),
    staleTime: 15_000,
    ...shared(api, fixture),
  })
}

/** The maker's half. */
export function useProposeResolution() {
  const { api } = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { exceptionId: string; action: string; note: string }) =>
      api!.proposeResolution(input.exceptionId, input.action, input.note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.sponsor() }),
  })
}

/** The checker's half. Refused if you are the one who proposed it. */
export function useResolveException() {
  const { api } = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { exceptionId: string; note: string; matchTo?: string }) =>
      api!.resolveException(input.exceptionId, input.note, input.matchTo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.sponsor() }),
  })
}

export function useCloseCycle() {
  const { api } = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { sponsorId: string; cycleId: string }) =>
      api!.closeCycle(input.sponsorId, input.cycleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.sponsor() }),
  })
}
