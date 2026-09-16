export type WebScreen =
  | 'signin' | 'enrol'
  | 'home' | 'benefits' | 'card' | 'family'
  | 'contrib' | 'benes'
  | 'claim' | 'track'
  | 'profile' | 'beneportal'

export interface WebNavItem {
  id: WebScreen
  label: string
  group: string
  icon: string
}

export const WNAV: readonly WebNavItem[] = [
  { id: 'signin', label: 'Sign in', group: 'ACCESS', icon: 'ph ph-sign-in' },
  { id: 'enrol', label: 'Choose cover', group: 'ACCESS', icon: 'ph ph-list-checks' },
  { id: 'home', label: 'Dashboard', group: 'COVER', icon: 'ph ph-squares-four' },
  { id: 'benefits', label: 'Cover detail', group: 'COVER', icon: 'ph ph-shield-check' },
  { id: 'card', label: 'Protection card', group: 'COVER', icon: 'ph ph-identification-card' },
  { id: 'family', label: 'Family cover', group: 'COVER', icon: 'ph ph-house-line' },
  { id: 'contrib', label: 'Contributions', group: 'MONEY', icon: 'ph ph-receipt' },
  { id: 'benes', label: 'Beneficiaries', group: 'PEOPLE', icon: 'ph ph-users-three' },
  { id: 'claim', label: 'Make a claim', group: 'CLAIMS', icon: 'ph ph-first-aid-kit' },
  { id: 'track', label: 'Track claim', group: 'CLAIMS', icon: 'ph ph-git-commit' },
  { id: 'profile', label: 'Profile + settings', group: 'ADMIN', icon: 'ph ph-user-gear' },
  { id: 'beneportal', label: 'Next-of-kin portal', group: 'PUBLIC', icon: 'ph ph-hand-heart' },
]

/** Screens that render inside the signed-in app shell. The rest are public
    pages with their own split-panel chrome and no session. */
export const APP_SCREENS: readonly WebScreen[] = [
  'home', 'benefits', 'card', 'family', 'contrib', 'benes', 'claim', 'track', 'profile',
]

export const SIDE_GROUPS = ['ACCESS', 'COVER', 'MONEY', 'PEOPLE', 'CLAIMS', 'ADMIN', 'PUBLIC'] as const
export const APP_GROUPS = ['COVER', 'MONEY', 'PEOPLE', 'CLAIMS', 'ADMIN'] as const

/** Shown in the fake address bar — the route each screen would really own. */
export const URLS: Record<WebScreen, string> = {
  signin: '/sign-in',
  enrol: '/enrol/cover',
  home: '/dashboard',
  benefits: '/cover',
  card: '/card',
  family: '/family',
  contrib: '/contributions',
  benes: '/beneficiaries',
  claim: '/claims/new',
  track: '/claims/CLM-2026-0091',
  profile: '/settings',
  beneportal: '/next-of-kin',
}

export const WEB_FRAME = { w: 1180, h: 830, breakpoint: '≥1024' } as const
