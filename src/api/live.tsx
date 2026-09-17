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
