import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { CspApi } from './client'
import { useApi } from './provider'
import type {
  AuditEntry, BeneficiarySet, Claim, ClaimQueueItem, ConsoleUser, DebitRun, Dependant, Leaver,
  Ledger, MemberSummary, MyClaim, NewMember, ProtectionCard, Reconciliation, Roster, ScheduleBatch,
  ScheduleRow, SponsorClaims, SponsorDashboard,
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
  claims: () => [...keys.member(), 'claims'] as const,
  dependants: () => [...keys.member(), 'dependants'] as const,
  claim: (ref: string) => ['claim', ref] as const,
  sponsor: () => ['sponsor'] as const,
  dashboard: () => [...keys.sponsor(), 'dashboard'] as const,
  roster: (sponsorId: string, search: string) => [...keys.sponsor(), 'roster', sponsorId, search] as const,
  claimQueue: () => ['claims', 'queue'] as const,
  sponsorClaims: (sponsorId: string) => [...keys.sponsor(), 'claims', sponsorId] as const,
  leavers: (sponsorId: string) => [...keys.sponsor(), 'leavers', sponsorId] as const,
  debitRun: (sponsorId: string) => [...keys.sponsor(), 'debit', sponsorId] as const,
  consoleUsers: (sponsorId: string) => [...keys.sponsor(), 'users', sponsorId] as const,
  audit: (sponsorId: string) => [...keys.sponsor(), 'audit', sponsorId] as const,
  scheduleBatch: (batchId: string) => [...keys.sponsor(), 'schedule', batchId] as const,
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The same, for a read addressed to one sponsor.
 *
 * Screens take the sponsor's id from the dashboard, and the dashboard stands in
 * the fixture until the real one lands — so for that moment the id in hand is
 * `fixture-federal`, and a request fired with it asks the API about a sponsor
 * that does not exist. Waiting for an id the server could have issued costs a
 * fraction of a second and removes a 500 nobody caused.
 */
function sharedForSponsor<T>(api: CspApi | null, fixture: T, sponsorId: string) {
  return { enabled: api !== null && UUID.test(sponsorId), placeholderData: fixture }
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

/**
 * The member's claim list.
 *
 * Read before the detail, because the detail needs a reference and the app has
 * no other way to learn one. A member with no claims gets an empty list, which
 * the tracking screen renders as "nothing open" rather than as an error.
 */
export function useMyClaims(fixture: { claims: MyClaim[] }): UseQueryResult<{ claims: MyClaim[] }> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.claims(),
    queryFn: () => api!.myClaims(),
    ...shared(api, fixture),
  })
}

export function useClaim(ref: string, fixture: Claim): UseQueryResult<Claim> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.claim(ref),
    queryFn: () => api!.claim(ref),
    ...shared(api, fixture),
    // The reference comes from a list that has to load first. Asking for
    // `/v1/claims/` in the meantime is a guaranteed 404 and, worse, one that
    // would put the screen into its failed state for a second.
    enabled: api !== null && ref !== '',
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

/** The family cover: who is on it, and who was taken off. */
export function useDependants(fixture: { dependants: Dependant[] }) {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.dependants(),
    queryFn: () => api!.dependants(),
    ...shared(api, fixture),
  })
}

/**
 * Add somebody to the cover.
 *
 * <p>No optimistic row. The price is the server's to quote — showing a member a
 * premium this client worked out, on the screen where they are deciding what to
 * pay, is being confidently wrong about money.
 */
export function useAddDependant() {
  const { api } = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; relation: string; dob: string }) => api!.addDependant(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.member() }),
  })
}

export function useRemoveDependant() {
  const { api } = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dependantId: string) => api!.removeDependant(dependantId),
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
    ...sharedForSponsor(api, fixture, sponsorId),
  })
}

/**
 * The member roster.
 *
 * Keyed on the search term, so typing does not throw away the unfiltered list —
 * clearing the box paints the full roster instantly from cache while the
 * request for it runs.
 */
export function useRoster(
  sponsorId: string,
  search: string,
  fixture: Roster,
): UseQueryResult<Roster> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.roster(sponsorId, search),
    queryFn: () => api!.roster(sponsorId, search || undefined),
    // A roster of eight thousand does not change while somebody reads it, and
    // re-fetching on every keystroke's debounce would be the expensive part.
    staleTime: 60_000,
    ...sharedForSponsor(api, fixture, sponsorId),
  })
}

/** The assessor's queue. A different role, reading every sponsor's claims. */
export function useClaimQueue(
  fixture: { claims: ClaimQueueItem[] },
): UseQueryResult<{ claims: ClaimQueueItem[] }> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.claimQueue(),
    queryFn: () => api!.claimQueue(),
    staleTime: 30_000,
    ...shared(api, fixture),
  })
}

/** Claims on this sponsor's members. Thin, by design — see SponsorClaim. */
export function useSponsorClaims(sponsorId: string, fixture: SponsorClaims): UseQueryResult<SponsorClaims> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.sponsorClaims(sponsorId),
    queryFn: () => api!.sponsorClaims(sponsorId),
    staleTime: 60_000,
    ...sharedForSponsor(api, fixture, sponsorId),
  })
}

/**
 * Send a month's schedule.
 *
 * <p>No optimistic anything. This is the instruction that decides what a
 * payroll office deducts from eight thousand salaries, and the server answers
 * with a batch to watch rather than a result.
 */
export function useUploadSchedule(sponsorId: string) {
  const { api } = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { period: string; filename: string; rows: ScheduleRow[] }) =>
      api!.uploadSchedule(sponsorId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.sponsor() }),
  })
}

/**
 * Watch a load.
 *
 * Polled every second while it runs and not at all once it is done — an officer
 * who uploaded a million rows is watching this number, and one who uploaded
 * eight thousand has already looked away.
 */
export function useScheduleBatch(
  sponsorId: string,
  batchId: string | null,
): UseQueryResult<ScheduleBatch> {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.scheduleBatch(batchId ?? ''),
    queryFn: () => api!.scheduleBatch(sponsorId, batchId!),
    enabled: api !== null && batchId !== null,
    refetchInterval: (query) =>
      query.state.data?.state === 'staged' ? 1_000 : false,
  })
}

/**
 * Enrol one person.
 *
 * <p>Invalidates the whole sponsor rather than the roster alone: a new member
 * changes the headline count on the dashboard and adds one to "no beneficiary
 * named", and an officer who has just enrolled somebody is about to look at
 * both.
 */
export function useEnrol(sponsorId: string) {
  const { api } = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: NewMember) => api!.enrol(sponsorId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.sponsor() }),
  })
}

/**
 * Enrol a list.
 *
 * <p>Succeeds with rejections inside it — a file of two hundred with three bad
 * NINs is a success that enrolled a hundred and ninety-seven, not an error. So
 * the screen reads `rejected` on the happy path, and `onError` is for the
 * request never landing.
 */
export function useEnrolAll(sponsorId: string) {
  const { api } = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (members: NewMember[]) => api!.enrolAll(sponsorId, members),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.sponsor() }),
  })
}

/**
 * Who has come off the schedule.
 *
 * <p>Its own read rather than a filter over the roster: the roster is one page
 * of eight thousand people ordered by name, and the leavers an officer is
 * chasing are the handful whose grace runs out next.
 */
export function useLeavers(sponsorId: string, fixture: { leavers: Leaver[] }) {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.leavers(sponsorId),
    queryFn: () => api!.leavers(sponsorId),
    staleTime: 60_000,
    ...sharedForSponsor(api, fixture, sponsorId),
  })
}

/**
 * Take somebody off the schedule.
 *
 * <p>Invalidates the sponsor rather than the leaver list alone — the roster's
 * "not deducted" count drops by one, because a leaver is no longer a collection
 * that failed.
 */
export function useLeave(sponsorId: string) {
  const { api } = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { memberId: string; reason: Leaver['reason']; lastDay: string }) =>
      api!.leave(sponsorId, input.memberId, { reason: input.reason, lastDay: input.lastDay }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.sponsor() }),
  })
}

/**
 * The direct-debit run.
 *
 * <p>Polled while an officer watches it, like the dashboard: a debit rail
 * answers the same day, so these numbers move during the morning somebody is
 * looking at them.
 */
export function useDebitRun(sponsorId: string, fixture: DebitRun) {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.debitRun(sponsorId),
    queryFn: () => api!.debitRun(sponsorId),
    staleTime: 30_000,
    refetchInterval: 120_000,
    ...sharedForSponsor(api, fixture, sponsorId),
  })
}

/**
 * Who can act for this sponsor.
 *
 * <p>Admin only, and the server enforces it — a viewer opening the settings
 * screen sees the fixture standing in and a notice, not somebody else's list of
 * who holds authority.
 */
export function useConsoleUsers(sponsorId: string, fixture: { users: ConsoleUser[] }) {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.consoleUsers(sponsorId),
    queryFn: () => api!.consoleUsers(sponsorId),
    staleTime: 60_000,
    ...sharedForSponsor(api, fixture, sponsorId),
  })
}

/** The sponsor's own audit trail. */
export function useAuditTrail(sponsorId: string, fixture: { entries: AuditEntry[] }) {
  const { api } = useApi()
  return useQuery({
    queryKey: keys.audit(sponsorId),
    queryFn: () => api!.auditTrail(sponsorId),
    staleTime: 30_000,
    ...sharedForSponsor(api, fixture, sponsorId),
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
