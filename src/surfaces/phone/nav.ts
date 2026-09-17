export type PhoneScreen =
  | 'splash' | 'auth' | 'phone' | 'otp' | 'biometric'
  | 'home' | 'pay' | 'contrib' | 'id' | 'benefits' | 'benes' | 'family' | 'more'
  | 'beneconf' | 'whychanged'
  | 'accident' | 'claim' | 'track'

/** Left-rail index. Order and grouping are the design's. */
export const NAV: readonly { id: PhoneScreen; label: string; group: string }[] = [
  { id: 'splash', label: 'Splash + language', group: 'AUTH' },
  { id: 'auth', label: 'Sign in', group: 'AUTH' },
  { id: 'phone', label: 'Phone number', group: 'AUTH' },
  { id: 'otp', label: 'SMS code', group: 'AUTH' },
  { id: 'biometric', label: 'Fingerprint', group: 'AUTH' },
  { id: 'home', label: 'Home', group: 'APP' },
  { id: 'pay', label: 'How you pay', group: 'APP' },
  { id: 'contrib', label: 'Contributions', group: 'APP' },
  { id: 'id', label: 'Protection card', group: 'APP' },
  { id: 'benefits', label: 'Cover + tiers', group: 'APP' },
  { id: 'benes', label: 'Who gets paid', group: 'APP' },
  { id: 'accident', label: 'Report accident', group: 'CLAIM' },
  { id: 'claim', label: 'Make a claim', group: 'CLAIM' },
  { id: 'track', label: 'Track claim', group: 'CLAIM' },
  { id: 'family', label: 'Family cover', group: 'APP' },
  { id: 'more', label: 'Profile', group: 'APP' },
  { id: 'beneconf', label: 'Confirm beneficiaries', group: 'APP' },
  { id: 'whychanged', label: 'Why it changed', group: 'APP' },
]

/**
 * Screens reachable without a session: signing in, and nothing else.
 *
 * The enrolment run that used to be here is gone. A member is enrolled from the
 * console by whoever employs them and invited by SMS — so there is no screen in
 * a member's app that creates a member, and no screen that asks one for their
 * NIN. Everything else needs a member behind it, and on a live build asking for
 * one of those while signed out sends you here rather than to a screen whose
 * every request would 401.
 */
export const PUBLIC_SCREENS: readonly PhoneScreen[] = ['splash', 'auth', 'phone', 'otp']

/** Screens that keep the bottom tab bar. Wizards and auth deliberately do not. */
export const TABBED: readonly PhoneScreen[] = [
  'home', 'id', 'benefits', 'benes', 'track', 'contrib', 'family', 'more', 'pay',
  'beneconf', 'whychanged',
]

export const TAB_TARGETS: readonly PhoneScreen[] = ['home', 'track', 'id', 'family', 'more']
export const TAB_ICONS = ['house', 'file-text', 'identification-card', 'users-three', 'dots-three-circle'] as const

/** Profile list. `more_i` from i18n, with `more_pay` spliced in at index 1. */
/*
 * `more_i[4]` is "Switch to HR officer view" and is not offered. It was a
 * control for reviewing the design — a preview of the sponsor console inside
 * the member app — and it is the reason somebody looking at this could not tell
 * the two apps apart. The console is its own application at /console, behind
 * its own sign-in.
 */
export const MORE_ICONS = [
  'ph ph-receipt', 'ph ph-credit-card', 'ph ph-users-three',
  'ph ph-identification-card', 'ph ph-house-line', 'ph ph-sign-out',
] as const
export const MORE_TARGETS: readonly PhoneScreen[] = [
  'contrib', 'pay', 'benes', 'id', 'family', 'auth',
]


