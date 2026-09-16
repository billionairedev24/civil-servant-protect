/**
 * Fixtures for the member web surface.
 *
 * Note for the build team: the design gives web a different member reference
 * (CSP-114-88214) and a different beneficiary set (50/30/20 including a minor)
 * from the phone design (4471-2098, 60/40). Both are reproduced as designed
 * rather than silently reconciled — see README, "Known inconsistencies".
 */
import type { Sponsor } from '../../data/sponsors'

export const WEB_MEMBER = {
  name: 'Adaeze Okafor',
  fullName: 'Adaeze N. Okafor',
  initials: 'AO',
  cspId: 'CSP-114-88214',
  inForce: '01.10.2025',
  grade: 'GL 12',
  dob: '04.11.1987',
  gross: '₦318,400',
  phoneMasked: '0803 •• •• 214',
  phoneEntry: '803 000 214',
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

export const WEB_BENEFICIARIES = [
  { name: 'Chinedu Okafor', rel: 'Spouse', phone: '0803 •• •• 118', id: 'NIN ••••4412', share: '50%' },
  { name: 'Ngozi Okafor', rel: 'Mother', phone: '0806 •• •• 903', id: 'NIN ••••7781', share: '30%' },
  { name: 'Amaka Okafor', rel: 'Daughter, 14', phone: '—', id: 'Birth cert. on file', share: '20%' },
] as const

export const WEB_FAMILY = [
  { name: 'Chinedu Okafor', dob: '12.03.1985', rel: 'Spouse', sum: '₦1,000,000', price: '₦900' },
  { name: 'Amaka Okafor', dob: '04.07.2012', rel: 'Daughter, 14', sum: '₦500,000', price: '₦500' },
  { name: 'Obiora Okafor', dob: '19.01.2017', rel: 'Son, 9', sum: '₦500,000', price: '₦400' },
] as const

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
