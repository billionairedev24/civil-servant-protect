/**
 * Formatting the API's values for a person to read.
 *
 * Split from `live.tsx` because the React Native app needs every one of these
 * and none of the components beside them: importing `naira` used to drag in a
 * fixed-position badge built out of `div`s. The web re-exports them from
 * `live.tsx`, so no screen had to change.
 */

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
