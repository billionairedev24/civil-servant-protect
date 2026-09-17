import type { UseQueryResult } from '@tanstack/react-query'
import { Icon } from '../components/Icon'
import { C } from '../theme/tokens'
import { useApi } from './provider'

/**
 * Reading a screen's data, and being honest about where it came from.
 *
 * Every read hook stands the fixture in as `placeholderData`, which is what lets
 * one set of screens serve both the fixture demo and the live product. That is a
 * good default while a request is in flight — a member opening the app to check
 * whether their deduction arrived should see last month's figures immediately
 * rather than a spinner.
 *
 * It is a bad default when the request *failed*. TanStack keeps returning the
 * placeholder, so a screen that does nothing about it shows invented money with
 * no indication that it is invented. On a product whose entire claim is that the
 * numbers can be trusted, that is the worst possible failure mode: quiet and
 * plausible.
 *
 * So live screens read through here and render {@link NotLive} when `failed` is
 * set. On fixtures `failed` is never true, and the demo is unchanged.
 */
export function useLive<T>(
  query: UseQueryResult<T>,
  fixture: T,
): { data: T; failed: boolean; live: boolean; provisional: boolean } {
  const { live } = useApi()
  return {
    /*
     * The fixture again, explicitly.
     *
     * `placeholderData` only stands in while a query is *pending* — the moment
     * it errors, TanStack drops it and `data` is undefined. A screen reading
     * `data.ref` then throws, which is how a 404 on one claim took down the
     * whole tracking screen rather than showing the notice below it. The
     * fallback belongs here and not at each call site.
     */
    data: query.data ?? fixture,
    failed: live && query.isError,
    /*
     * For the few places where the demo and the product legitimately differ.
     *
     * The rail switcher (`?rail=state`) is a demo control: it re-renders every
     * screen as a different sponsor, which is how four collection rails get
     * reviewed without four backends. A live screen must ignore it and show the
     * member's actual sponsor. Screens that read a sponsor field need to know
     * which of the two they are in.
     */
    live,
    /*
     * True while what is on screen is still the fixture standing in.
     *
     * Almost every screen can ignore this — showing last month's figures for a
     * moment is the point. It matters when one read feeds another: the claim
     * tracker takes a reference out of the claim *list*, and a reference taken
     * from the fixture is a reference to a claim this member does not have. The
     * request 404s, and for a moment the screen says the claim could not be
     * loaded when nothing was ever wrong.
     */
    provisional: live && query.isPlaceholderData,
  }
}

/**
 * A standing mark, whenever the apps are running on fixtures.
 *
 * Small, fixed, and on every screen of all three surfaces, because the
 * alternative was somebody reading the product for an hour and concluding the
 * backend was not connected. They were right about what they were looking at —
 * with `VITE_API_URL` unset, not one screen calls the API — and nothing on the
 * page said so.
 *
 * Absent entirely when an API is configured, so it costs the real product
 * nothing. It is not a warning: fixtures are how the design is reviewed and how
 * the rail tests run. It is a label.
 */
export function DataSourceBadge() {
  const { live } = useApi()
  if (live) return null
  return (
    <div
      // Not a live region: it never changes, and announcing it on every route
      // change would be noise in a screen reader.
      style={{
        position: 'fixed', left: 12, bottom: 12, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '6px 11px', borderRadius: 999,
        border: `1px solid ${C.ochreBorder}`, background: C.ochreBg, color: C.ochreInk,
        fontSize: 11.5, fontWeight: 600, pointerEvents: 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: '50%', background: C.ochre }}
      />
      Demo data · no API configured
    </div>
  )
}

/**
 * Shown above figures that could not be refreshed.
 *
 * Says what is wrong and what it means for what is on screen, because "Error"
 * tells a member nothing they can act on. It does not blank the screen: the
 * layout, the labels and the structure are all still useful, and a member on a
 * flapping connection who loses the whole page has lost more than they gained.
 */
export function NotLive({ what = 'These figures' }: { what?: string }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, margin: '12px 0',
        padding: '11px 12px', border: `1px solid ${C.ochreBorder}`, borderRadius: 10,
        background: C.ochreBg, color: C.ochreInk, fontSize: 13, lineHeight: 1.45,
      }}
    >
      <Icon name="ph-fill ph-cloud-slash" size={16} color={C.ochre} />
      <span>
        {what} could not be loaded, so what is shown is not live. Check your
        connection — nothing here has changed.
      </span>
    </div>
  )
}

/**
 * Money, from minor units.
 *
 * The API speaks kobo as integers and the screens have always shown "₦2,500", so
 * the conversion lives in one place rather than in each screen's JSX. Naira are
 * whole here because every figure in this product is: contributions, sums
 * assured and payouts are all set in whole naira, and a trailing ".00" on a
 * payslip-adjacent number reads as an error.
 */
export function naira(minor: number | null | undefined): string {
  if (minor == null) return '—'
  return `₦${Math.round(minor / 100).toLocaleString('en-NG')}`
}

/**
 * A wire enum as a person reads it: `standard` → "Standard".
 *
 * The API speaks lower-case identifiers because they are values, not prose. A
 * screen that prints one straight into a sentence gets "standard plan · in
 * force since…", which reads like a typo rather than a tier name.
 */
export function titleCase(value: string | null | undefined): string {
  if (!value) return ''
  return value[0].toUpperCase() + value.slice(1).replace(/_/g, ' ')
}

/** "16.07.2025" — the form Nigerian forms and payslips use. */
export function dayFirst(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`
}

/*
 * Month names, written out rather than taken from `toLocaleDateString`.
 *
 * Intl's "short" month for en-NG is "Sept" — four letters for one month out of
 * twelve — which put "AUG 2025" and "SEPT 2026" at either end of the same axis.
 * It is also an ICU-version detail, so the same build could render differently
 * on a different machine, and these strings are asserted in the rail tests.
 */
const SHORT_MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const

export const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/**
 * Where each benefit the API sells sits in the translated label list.
 *
 * The API is the source of truth for the figures and for which benefits exist —
 * six of them — and `t.sched` is a positional list of seven written when the
 * design sold a slightly different product. Rather than invent a Hausa, Yorùbá,
 * Igbo and Pidgin label for a benefit whose name changed, each key points at the
 * label that already says the same thing in every language:
 *
 *   hospital_cash → index 4, which reads "accident hospital money" in four of
 *   the five languages. The English string says "Accident medical bills"; the
 *   translations agree with the key, and the English is the one to revisit with
 *   whoever owns the wording.
 *
 * Index 6, "Children's education", has no key: the API does not sell it. It
 * stays in the table rather than being deleted, because removing a string from
 * five languages to add it back later is how a translation gets lost.
 */
export const BENEFIT_LABEL_INDEX: Record<string, number> = {
  death: 0,
  accident_extra: 1,
  disability: 2,
  weekly_income: 3,
  hospital_cash: 4,
  funeral_advance: 5,
}

/**
 * ₦5m, ₦250k, ₦50,000 — a figure at a glance.
 *
 * For the one-line summary under a plan, where four full amounts do not fit on
 * a 390px screen and a member is comparing rather than checking. The detail
 * table below it carries them in full.
 */
export function shortNaira(minor: number): string {
  const naira = Math.round(minor / 100)
  if (naira >= 1_000_000) {
    const millions = naira / 1_000_000
    return `₦${Number.isInteger(millions) ? millions : millions.toFixed(1)}m`
  }
  if (naira >= 100_000) return `₦${Math.round(naira / 1_000)}k`
  return `₦${naira.toLocaleString('en-NG')}`
}

/**
 * What a benefit is worth on a tier, as a member reads it.
 *
 * A benefit a tier does not include is "—", never "₦0". Zero is a promise to
 * pay nothing; absent is no promise at all, and the two are different at a
 * claim.
 */
export function benefitValue(
  value: number | null | undefined,
  notIncluded = '—',
): string {
  return value == null ? notIncluded : naira(value)
}

/** "SEP 2026" from an ISO date or a period like "2026-09-01". */
export function periodLabel(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return `${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/** "September", for a sentence. `periodLabel` gives "SEP 2026", for a label. */
export function monthName(iso: string | null | undefined): string {
  if (!iso) return 'This'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'This'
  return LONG_MONTHS[date.getUTCMonth()]
}
