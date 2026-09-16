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
  cspId: '4471-2098',
  grade: 'GL 12',
  ministry: 'Fed. Min. of Education',
  role: 'Principal Education Officer',
  dob: '04.11.1987',
  gross: '₦318,400',
  inForceSince: '16.07.2025',
  device: 'Tecno Spark 10',
  phoneMasked: '0803 •• •• 214',
  phoneEntry: '803 000 214',
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
  { name: 'Chinedu Okafor', relIndex: 0, phone: '0803 •• •• 214', share: 60 },
  { name: 'Ngozi Okafor', relIndex: 1, phone: '0803 •• •• 991', share: 40 },
  { name: 'Emeka Okafor', relIndex: 2, phone: '—', share: 0 },
]

export const FAMILY_COVER = [
  { name: 'Chinedu Okafor', relIndex: 0, cover: '₦2,000,000', price: '₦1,200/mo', icon: 'ph ph-heart', active: true },
  { name: 'Ngozi Okafor', relIndex: 1, cover: '₦500,000', price: '₦600/mo', icon: 'ph ph-baby', active: true },
  { name: 'Emeka Okafor', relIndex: 2, cover: '—', price: 'from ₦600/mo', icon: 'ph ph-baby', active: false },
] as const

/** Claim wizard review rows; keys are i18n `sum_k`. */
export const CLAIM_SUMMARY_VALUES = [
  'Death of the member',
  'Adaeze Okafor · 4471-2098',
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
