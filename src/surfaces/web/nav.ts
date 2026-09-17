export type WebScreen =
  | 'signin'
  | 'home' | 'benefits' | 'card' | 'family'
  | 'contrib' | 'benes'
  | 'claim' | 'track'
  | 'profile'

export interface WebNavItem {
  id: WebScreen
  label: string
  group: string
  icon: string
}

export const WNAV: readonly WebNavItem[] = [
  { id: 'signin', label: 'Sign in', group: 'ACCESS', icon: 'ph ph-sign-in' },
  { id: 'home', label: 'Dashboard', group: 'COVER', icon: 'ph ph-squares-four' },
  { id: 'benefits', label: 'Cover detail', group: 'COVER', icon: 'ph ph-shield-check' },
  { id: 'card', label: 'Protection card', group: 'COVER', icon: 'ph ph-identification-card' },
  { id: 'family', label: 'Family cover', group: 'COVER', icon: 'ph ph-house-line' },
  { id: 'contrib', label: 'Contributions', group: 'MONEY', icon: 'ph ph-receipt' },
  { id: 'benes', label: 'Beneficiaries', group: 'PEOPLE', icon: 'ph ph-users-three' },
  { id: 'claim', label: 'Make a claim', group: 'CLAIMS', icon: 'ph ph-first-aid-kit' },
  { id: 'track', label: 'Track claim', group: 'CLAIMS', icon: 'ph ph-git-commit' },
  { id: 'profile', label: 'Profile + settings', group: 'ADMIN', icon: 'ph ph-user-gear' },
]

/** Screens that render inside the signed-in app shell. The rest are public
    pages with their own split-panel chrome and no session. */
export const APP_SCREENS: readonly WebScreen[] = [
  'home', 'benefits', 'card', 'family', 'contrib', 'benes', 'claim', 'track', 'profile',
]

export const APP_GROUPS = ['COVER', 'MONEY', 'PEOPLE', 'CLAIMS', 'ADMIN'] as const

/** The route each screen owns. */
export const URLS: Record<WebScreen, string> = {
  signin: '/sign-in',
  home: '/dashboard',
  benefits: '/cover',
  card: '/card',
  family: '/family',
  contrib: '/contributions',
  benes: '/beneficiaries',
  claim: '/claims/new',
  track: '/claims/CLM-2026-0091',
  profile: '/settings',
}

/**
 * Pages reachable without a session — which is signing in, and nothing else.
 *
 * There is no enrolment here. A member is enrolled by whoever employs them,
 * from the console, against a staff record that already exists; the app then
 * invites them to sign in. A self-service "choose your cover" page would be
 * asking somebody to create an insurance policy for themselves against a
 * payroll they cannot prove they are on.
 */
export const PUBLIC_WEB_SCREENS: readonly WebScreen[] = ['signin']

/**
 * Which screen a URL resolves to. Exact first, then the two paths that carry a
 * record id — a claim reference is part of the address, so `/claims/<anything>`
 * has to land on the tracker rather than 404 onto the dashboard.
 */
export function webScreenForPath(pathname: string): WebScreen {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const exact = (Object.keys(URLS) as WebScreen[]).find((id) => URLS[id] === path)
  if (exact) return exact
  if (path.startsWith('/claims/')) return 'track'
  return 'home'
}

