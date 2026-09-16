import { createContext, useContext, type ReactNode } from 'react'
import { STRINGS, type Lang, type Strings } from './strings'

export { LANGS, type Lang, type Strings } from './strings'

const LangContext = createContext<Lang>('en')

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

/** The active language's full string table. */
export function useT(): Strings {
  return STRINGS[useContext(LangContext)] ?? STRINGS.en
}

export function useLang(): Lang {
  return useContext(LangContext)
}

/** Fills `{tier}`-style holes in a copy key. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? values[key] : whole,
  )
}

/**
 * Copy that the design bundle never routed through csp-i18n.js. The four newest
 * member screens (beneficiary re-confirmation, employer onboarding, why your
 * contribution changed, sunlight mode) plus the console shipped English-only,
 * and the spec records 34 keys as outstanding. Keeping those strings here rather
 * than scattered through JSX means the translation pass has one file to work
 * through, and `npm run build` fails loudly if a key is dropped.
 */
export const EN_ONLY = {
  // Annual beneficiary re-confirmation
  beneconf_badge: 'ONCE A YEAR',
  beneconf_due: 'DUE BY 30 SEPTEMBER',
  beneconf_title: 'Are these still the people you want paid?',
  beneconf_sub:
    'Nothing changes unless you say so. We ask every year because this is the one thing your family cannot fix later.',
  beneconf_named_since: 'Named since March 2019 · never changed',
  beneconf_unreachable: 'This number has not been reachable since June',
  beneconf_ignore_title: 'If you do not confirm',
  beneconf_ignore_body:
    'Your cover carries on as normal — this is not about payment. But if a claim is made on an unconfirmed record, the insurer has to verify the beneficiaries first, and that adds weeks at the worst possible time.',
  beneconf_yes: 'Yes, these are still correct',
  beneconf_changed: 'Something has changed',
  beneconf_footnote:
    'Confirming takes one tap and is recorded with the date. You will be asked again next September.',
  beneconf_due_card: 'Annual confirmation due',
  beneconf_due_card_sub: 'One tap before 30 September',
  benes_unshared: 'Emeka is named but holds no share — set one before you confirm.',
  benes_balanced: '60% + 40% = 100%.',

  // Why your contribution changed
  why_title: 'Why your deduction went up',
  why_was: 'WAS',
  why_now: 'NOW',
  why_lede:
    'A month, taken from your salary. Three things changed at once, which is why it looks like a big jump.',
  why_breakdown: 'WHAT MADE UP THE DIFFERENCE',
  why_tier_title: 'You moved to Enhanced',
  why_tier_body: 'You asked for this on 12 August. Cover went from ₦2m to ₦5m.',
  why_family_title: 'Ngozi was added to family cover',
  why_family_body: 'Added 20 August, active from 1 September.',
  why_discount_title: 'Group discount applied',
  why_total: 'New monthly total',
  why_dispute_title: 'This is not what I agreed to',
  why_dispute_body:
    'Say so within 30 days and the change is reversed from the next cycle, with anything overtaken refunded. We keep the record of who asked for what and when.',
  why_dispute_cta: 'Dispute this change',
  why_entry_title: 'Your deduction changes in September',
  why_entry_sub: '₦2,500 becomes ₦3,700 — see exactly why',

  // Private employer onboarding
  onboard_step: 'STEP 2 OF 3 · YOUR EMPLOYER',
  onboard_title: 'Is this where you work?',
  onboard_sub:
    'Your employer gave us this code. Check the details before you join their scheme — this decides who pays for your cover.',
  onboard_scheme_code: 'Scheme code',
  onboard_staff_no: 'Your staff number',
  onboard_started: 'Started',
  onboard_split: 'WHO PAYS WHAT',
  onboard_employer_pays: 'Nightingale pays',
  onboard_you_pay: 'You top up',
  onboard_split_note:
    "Your share comes out of salary with the employer's — one deduction, not two. Standard plan, ₦2,500 of cover a month for ₦1,000 of your own money.",
  onboard_privacy_title: 'What Nightingale can see',
  onboard_privacy_body:
    'Your name, staff number and which plan you are on — they are paying for it. They never see your NIN, your beneficiaries, your health, or anything about a claim beyond whether you were in service.',
  onboard_leave_title: 'If you leave Nightingale',
  onboard_leave_body:
    'The cover is yours, not theirs. It moves to direct debit at the full ₦2,500 with the same ID and start date, and you have 60 days to decide.',
  onboard_join: 'Yes, join this scheme',
  onboard_not_mine: 'This is not my employer',

  // Sponsor console (desktop) — English-only in the bundle
  console_needs_you: 'NEEDS YOU THIS WEEK',
  console_exceptions_head: 'EXCEPTIONS · MUST BE CLEARED BEFORE THE NEXT RUN',
  console_four_types: 'Same console, four sponsor types',
  console_switch: 'Switch',
  console_label: 'SPONSOR CONSOLE',
} as const

export type EnOnlyKey = keyof typeof EN_ONLY
