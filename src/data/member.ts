/**
 * Member-side fixtures. Everything a screen renders comes from here rather than
 * from the component, so swapping in a real API later is a change to this file
 * and its callers' await, not to the JSX.
 *
 * Relationship words ("Spouse", "Daughter, 14") are deliberately NOT here —
 * they come from the translation table so they follow the language, and are
 * joined to these records at render time.
 */

export const MEMBER = {
  name: 'Adaeze Okafor',
  fullName: 'Adaeze N. Okafor',
  initials: 'AO',
  /**
   * The CSP-ID is the product's identity artefact, so it has exactly one value
   * and all three applications read it from here. The design bundle gave the
   * phone `4471-2098` and the web `CSP-114-88214` for the same person, and the
   * console used both — including inside one screen, where the exception route
   * said one and its detail panel said the other.
   *
   * `serviceNo` is what we hold. The August file says 4471209 — one digit out —
   * which is the console's unmatched-deduction story: real money, deducted from
   * a real person, that cannot be tied to a CSP-ID until someone decides.
   */
  cspId: 'CSP-114-88214',
  serviceNo: '4471208',
  grade: 'GL 12',
  ministry: 'Fed. Min. of Education',
  role: 'Principal Education Officer',
  dob: '04.11.1987',
  gross: '₦318,400',
  inForceSince: '16.07.2025',
  device: 'Tecno Spark 10',
  phoneMasked: '0803 •• •• 214',
  // The national number without the leading 0, grouped as it is keyed in. Must
  // stay consistent with phoneMasked above and with the seeded +2348030000214
  // on the API — a digit out here is a sign-in that fails for no visible reason.
  phoneEntry: '803 0000 214',
  bank: 'GTBank ••4471',
} as const

/** Values for the payroll record shown at enrolment step 1 (keys are i18n rec_k). */
export const RECORD_VALUES = [
  MEMBER.fullName,
  MEMBER.grade,
  MEMBER.ministry,
  MEMBER.dob,
  MEMBER.gross,
] as const

export const TIER_NAMES = ['Basic', 'Standard', 'Enhanced', 'Executive'] as const
export const TIER_PRICES = ['₦1,500', '₦2,500', '₦4,000', '₦6,000'] as const

/**
 * What the API calls the same four tiers, in the same order.
 *
 * Kept beside the display names so the two cannot drift: the console picks a
 * tier by position in TIER_NAMES and has to send a code, and a screen sending
 * "Standard" where the server validates `basic|standard|enhanced|executive`
 * fails at the far end for a reason nobody can see from here.
 */
export const TIER_CODES = ['basic', 'standard', 'enhanced', 'executive'] as const

/** Benefit schedule amounts; the labels are i18n `sched`. */
export const SCHEDULE_VALUES = [
  '₦5,000,000',
  '+₦5,000,000',
  'up to ₦5,000,000',
  '₦50,000 / week',
  '₦250,000',
  '₦250,000',
  '₦250,000',
] as const

export interface Beneficiary {
  name: string
  /** Index into the i18n `fam_n` list, so the relationship word follows language. */
  relIndex: number
  phone: string
  share: number
}

export const BENEFICIARIES: readonly Beneficiary[] = [
  // Chinedu's number was the member's own in the bundle's phone fixture.
  { name: 'Chinedu Okafor', relIndex: 0, phone: '0803 •• •• 118', share: 60 },
  { name: 'Ngozi Okafor', relIndex: 1, phone: '0806 •• •• 903', share: 40 },
  { name: 'Emeka Okafor', relIndex: 2, phone: '—', share: 0 },
]

/**
 * Who a death claim actually pays. A beneficiary holding no share is named on
 * the record but is not a payee — that gap is the entire reason the annual
 * re-confirmation screen exists, so the two must never be conflated.
 */
export const PAYEES = BENEFICIARIES.filter((b) => b.share > 0)

/**
 * "Chinedu and Ngozi Okafor". Derived rather than written out, because the
 * phone and the web each hard-coded their own version of this sentence and
 * they had drifted to naming different people.
 *
 * The shared surname collapses only when every payee actually shares it.
 */
export function payeeNames(and: string): string {
  const parts = PAYEES.map((b) => b.name)
  const surnames = parts.map((n) => n.slice(n.lastIndexOf(' ') + 1))
  const names = surnames.every((s) => s === surnames[0])
    ? parts.map((n, i) => (i === parts.length - 1 ? n : n.slice(0, n.lastIndexOf(' '))))
    : parts
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`
}

export const FAMILY_COVER = [
  { name: 'Chinedu Okafor', relIndex: 0, cover: '₦2,000,000', price: '₦1,200/mo', icon: 'ph ph-heart', active: true },
  { name: 'Ngozi Okafor', relIndex: 1, cover: '₦500,000', price: '₦600/mo', icon: 'ph ph-baby', active: true },
  { name: 'Emeka Okafor', relIndex: 2, cover: '—', price: 'from ₦600/mo', icon: 'ph ph-baby', active: false },
] as const

/** Claim wizard review rows; keys are i18n `sum_k`. */
export const CLAIM_SUMMARY_VALUES = [
  'Death of the member',
  `${MEMBER.name} · ${MEMBER.cspId}`,
  'Chinedu Okafor',
  '3 / 4',
  'GTBank ••4471',
] as const

export const CLAIM = {
  openRef: 'CLM-2026-0084',
  newRef: 'CLM-2026-0091',
  homeRef: 'CLM-0084',
  deathRef: 'CLM-2026-0085',
  funeralAmount: '₦250,000',
} as const

/**
 * Contribution history. A month is only `file` (full green) once the remittance
 * file has come back; `card` months were recovered by the fallback and are
 * marked separately; the current month is `waiting` and must never claim a
 * payment nobody has seen.
 */
export type MonthState = 'file' | 'card' | 'waiting'

export const CONTRIB_MONTHS: readonly MonthState[] = [
  'file', 'file', 'file', 'file', 'file', 'file', 'file', 'file', 'file',
  'card', 'card', 'file', 'file', 'file',
  'waiting',
]

export const CONTRIB_TOTAL = '₦35,000'
export const CONTRIB_RANGE = ['JUL 2025', 'SEP 2026'] as const

/** Recent ledger rows. `src` indexes the i18n `src` state labels. */
export const LEDGER: readonly { month: string; src: 0 | 1 | 2 }[] = [
  { month: 'SEP 2026', src: 2 },
  { month: 'AUG 2026', src: 0 },
  { month: 'JUL 2026', src: 1 },
  { month: 'JUN 2026', src: 0 },
]

/** Claim timeline state, one per i18n `stages` entry. */
export const CLAIM_STAGES = ['done', 'done', 'now', 'todo', 'todo'] as const

export const EMPLOYER_ONBOARDING = {
  name: 'Nightingale Hospital',
  where: 'Ikeja, Lagos · 412 staff enrolled',
  schemeCode: 'CSP-EM-2214',
  staffNo: 'NH-0884',
  started: '04.03.2024',
  employerPays: '₦1,500',
  memberPays: '₦1,000',
  employerShare: 15,
  memberShare: 10,
} as const

export const WHY_CHANGED = {
  was: '₦2,500',
  now: '₦3,700',
  lines: [
    { icon: 'ph ph-arrow-fat-up', amount: '+₦1,500', credit: false },
    { icon: 'ph ph-baby', amount: '+₦600', credit: false },
    { icon: 'ph ph-arrow-fat-down', amount: '−₦900', credit: true },
  ],
  total: '₦3,700',
} as const

/**
 * Initials from whatever name we have.
 *
 * A live session carries the name on the record — "Adaeze Nkiru Okafor" — so
 * taking the first and last word gives AO rather than the ANO a naive split
 * would produce. A single-word name gives one letter, not a crash.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
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
export function toE164(entry: string): string {
  let digits = entry.replace(/\D/g, '')
  if (digits.startsWith('234')) digits = digits.slice(3)
  // The trunk prefix used for domestic dialling. It is not part of the number.
  if (digits.startsWith('0')) digits = digits.slice(1)
  return `+234${digits}`
}
