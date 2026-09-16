export type PhoneScreen =
  | 'splash' | 'auth' | 'phone' | 'otp' | 'biometric'
  | 'sponsor' | 'verify' | 'enrol' | 'enroldone' | 'onboard'
  | 'home' | 'pay' | 'contrib' | 'id' | 'benefits' | 'benes' | 'family' | 'more'
  | 'beneconf' | 'whychanged'
  | 'accident' | 'claim' | 'track'
  | 'hr' | 'bene'

/** Left-rail index. Order and grouping are the design's. */
export const NAV: readonly { id: PhoneScreen; label: string; group: string }[] = [
  { id: 'splash', label: 'Splash + language', group: 'AUTH' },
  { id: 'auth', label: 'Sign in', group: 'AUTH' },
  { id: 'phone', label: 'Phone number', group: 'AUTH' },
  { id: 'otp', label: 'SMS code', group: 'AUTH' },
  { id: 'biometric', label: 'Fingerprint', group: 'AUTH' },
  { id: 'sponsor', label: 'Who pays you', group: 'SETUP' },
  { id: 'verify', label: 'NIN + BVN check', group: 'SETUP' },
  { id: 'enrol', label: 'Enrolment', group: 'SETUP' },
  { id: 'enroldone', label: 'Cover starts', group: 'SETUP' },
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
  { id: 'onboard', label: 'Employer onboarding', group: 'SETUP' },
  { id: 'hr', label: 'Sponsor console', group: 'ROLE' },
  { id: 'bene', label: 'Beneficiary', group: 'ROLE' },
]

/** Screens that keep the bottom tab bar. Wizards and auth deliberately do not. */
export const TABBED: readonly PhoneScreen[] = [
  'home', 'id', 'benefits', 'benes', 'track', 'contrib', 'family', 'more', 'pay',
  'beneconf', 'whychanged',
]

export const TAB_TARGETS: readonly PhoneScreen[] = ['home', 'track', 'id', 'family', 'more']
export const TAB_ICONS = ['house', 'file-text', 'identification-card', 'users-three', 'dots-three-circle'] as const

/** Profile list. `more_i` from i18n, with `more_pay` spliced in at index 1. */
export const MORE_ICONS = [
  'ph ph-receipt', 'ph ph-credit-card', 'ph ph-users-three',
  'ph ph-identification-card', 'ph ph-house-line', 'ph ph-buildings', 'ph ph-sign-out',
] as const
export const MORE_TARGETS: readonly PhoneScreen[] = [
  'contrib', 'pay', 'benes', 'id', 'family', 'hr', 'auth',
]


