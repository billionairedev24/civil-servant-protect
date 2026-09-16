/**
 * Fixtures for the member web application.
 *
 * The identity and the family are NOT re-declared here — they come from
 * `src/data/member.ts`, because they belong to the member rather than to a
 * surface. The design bundle gave the phone and the web different values for
 * both (a different CSP-ID, a different set of beneficiaries with different
 * relationships and shares), which made "the same member on a desk browser"
 * untrue the moment anyone put the two screens side by side.
 *
 * What stays here is genuinely web-only: the full benefit matrix the phone
 * truncates, the session list, and the ledger's extra columns.
 */
import { BENEFICIARIES, FAMILY_COVER, MEMBER } from '../../data/member'
import type { Sponsor } from '../../data/sponsors'

/** One member record, spread so the web can add the fields only it shows. */
export const WEB_MEMBER = {
  ...MEMBER,
  inForce: MEMBER.inForceSince,
  kinPhone: '+234 806 •• •• 903',
} as const

/** Every tier's benefit, one row per i18n `sched` entry. The phone shows one
    tier at a time; the point of web is all four side by side. */
export const SCHEDULE_MATRIX: readonly (readonly string[])[] = [
  ['₦3,000,000', '₦5,000,000', '₦10,000,000', '₦15,000,000'],
  ['₦3,000,000', '₦5,000,000', '₦10,000,000', '₦15,000,000'],
  ['up to ₦3m', 'up to ₦5m', 'up to ₦10m', 'up to ₦15m'],
  ['₦30,000 / wk', '₦50,000 / wk', '₦90,000 / wk', '₦120,000 / wk'],
  ['₦150,000', '₦250,000', '₦500,000', '₦1,000,000'],
  ['—', '₦250,000', '₦400,000', '₦600,000'],
  ['—', '₦250,000', '₦500,000', '₦750,000'],
]

/** The relationship word is in the i18n `fam_n` list, indexed the same way the
    phone indexes it; web renders English, so it is spelled out for the table. */
const REL = ['Spouse', 'Daughter, 14', 'Son, 9'] as const

/** The one identity document each beneficiary is on file with. A minor has a
    birth certificate rather than a NIN — BENE_RULES below turns on that. */
const BENE_ID = ['NIN ••••4412', 'Birth cert. on file', 'Birth cert. on file'] as const

export const WEB_BENEFICIARIES = BENEFICIARIES.map((b, i) => ({
  name: b.name,
  rel: REL[b.relIndex],
  phone: b.phone,
  id: BENE_ID[i],
  share: `${b.share}%`,
}))

const DOB = ['12.03.1985', '04.07.2012', '19.01.2017'] as const

export const WEB_FAMILY = FAMILY_COVER.map((f, i) => ({
  name: f.name,
  dob: DOB[i],
  rel: REL[f.relIndex],
  sum: f.cover,
  price: f.price.replace('/mo', ''),
}))

export type LedgerStatus = 'Received' | 'Pending' | 'Retried'

/** Whole ledger, as a desk browser can afford to show it. */
export function ledgerFor(payroll: boolean, late: boolean): { month: string; amount: string; status: LedgerStatus }[] {
  return [
    { month: 'Aug 2026', amount: '₦2,500', status: late && payroll ? 'Pending' : 'Received' },
    { month: 'Jul 2026', amount: '₦2,500', status: 'Received' },
    { month: 'Jun 2026', amount: '₦2,500', status: 'Received' },
    { month: 'May 2026', amount: '₦2,500', status: 'Received' },
    { month: 'Apr 2026', amount: '₦2,500', status: payroll ? 'Received' : 'Retried' },
    { month: 'Mar 2026', amount: '₦2,500', status: 'Received' },
    { month: 'Feb 2026', amount: '₦2,500', status: 'Received' },
    { month: 'Jan 2026', amount: '₦2,500', status: 'Received' },
  ]
}

/** Payment reference per rail, as it appears on a ledger row. */
export function railRef(sponsor: Sponsor): string {
  return {
    federal: 'IPPIS-AUG-2026',
    state: 'CSP-LA-07/08',
    employer: 'CSP-EM-2214',
    self: 'MND-88214',
  }[sponsor.id]
}

export const BENE_RULES = [
  { ok: true, text: 'Shares must total exactly 100%. The form cannot be saved at 99% or 101%.' },
  { ok: true, text: 'At least two named people, so one unreachable name never stalls a claim.' },
  { ok: true, text: 'A minor needs a birth certificate and a named adult trustee.' },
  { ok: false, text: 'NIN is optional but moves a claim from weeks to days at payout.' },
] as const

export const WEB_ONLY_COVER = [
  { icon: 'ph ph-table', title: 'Full benefit schedule', body: 'All four tiers in one table, with the actuarial notes the phone truncates.' },
  { icon: 'ph ph-file-pdf', title: 'Download the policy wording', body: 'The 14-page document, versioned, with the date it applied to you.' },
  { icon: 'ph ph-calculator', title: 'Compare take-home effect', body: 'What each tier does to your net pay at your grade level.' },
] as const

export const WEB_ONLY = [
  { icon: 'ph ph-printer', title: 'Print and PDF', body: 'Protection card at A4, contribution statements, claim summaries.' },
  { icon: 'ph ph-upload-simple', title: 'Scanned uploads to 10 MB', body: 'Real documents from a scanner, not only camera photos.' },
  { icon: 'ph ph-table', title: 'Full tables', body: 'Whole ledger and benefit schedule in one view, sortable.' },
  { icon: 'ph ph-download-simple', title: 'Export my data', body: 'Everything we hold on you, as CSV and PDF.' },
] as const

export const PHONE_ONLY = [
  { icon: 'ph ph-fingerprint', title: 'Fingerprint sign-in', body: 'Device-bound, never on a shared machine.' },
  { icon: 'ph ph-wifi-slash', title: 'Offline protection card', body: 'Cached on the phone and valid with no network.' },
  { icon: 'ph ph-camera', title: 'Photograph papers at the scene', body: 'Accident reports queue and send themselves when signal returns.' },
  { icon: 'ph ph-phone', title: 'USSD and WhatsApp fallback', body: '*347*55# works with no data at all.' },
] as const

export const SESSIONS = [
  { name: 'Infinix Hot 12 · phone app', meta: 'Lagos · last used 2 hours ago', state: 'trusted', icon: 'ph ph-device-mobile' },
  { name: 'This browser · Chrome on Windows', meta: 'Secretariat, Alausa · signed in 09:41', state: 'THIS SESSION', icon: 'ph ph-monitor' },
  { name: 'Shared PC · business centre', meta: 'Ikeja · 22 June 2025', state: 'REVOKED', icon: 'ph ph-desktop' },
] as const

export const WEB_CLAIM_SUMMARY = [
  'Funeral assistance + death claim',
  'Adaeze N. Okafor · CSP-114-88214',
  'Chinedu Okafor (spouse)',
  '4 of 4 uploaded',
  'GTBank ••4471',
] as const
