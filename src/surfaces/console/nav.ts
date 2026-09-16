export type ConsoleScreen =
  | 'dash' | 'upload' | 'recon' | 'exception' | 'debit' | 'remit'
  | 'roster' | 'members' | 'claims'
  | 'settings' | 'reports'

export interface ConsoleNavItem {
  id: ConsoleScreen
  label: string
  group: 'COLLECT' | 'PEOPLE' | 'ADMIN'
  icon: string
  /** Which live count, if any, rides on this item. */
  badge?: 'recon' | 'claims'
}

export const CONSOLE_NAV: readonly ConsoleNavItem[] = [
  { id: 'dash', label: 'Dashboard', group: 'COLLECT', icon: 'ph ph-squares-four' },
  { id: 'upload', label: 'Monthly schedule', group: 'COLLECT', icon: 'ph ph-upload-simple' },
  { id: 'recon', label: 'Reconciliation', group: 'COLLECT', icon: 'ph ph-git-diff', badge: 'recon' },
  { id: 'exception', label: 'Exception detail', group: 'COLLECT', icon: 'ph ph-warning-diamond' },
  { id: 'debit', label: 'Direct-debit run', group: 'COLLECT', icon: 'ph ph-arrows-clockwise' },
  { id: 'remit', label: 'Remittances', group: 'COLLECT', icon: 'ph ph-receipt' },
  { id: 'roster', label: 'Members', group: 'PEOPLE', icon: 'ph ph-users-three' },
  { id: 'members', label: 'Add / remove', group: 'PEOPLE', icon: 'ph ph-user-plus' },
  { id: 'claims', label: 'Claims', group: 'PEOPLE', icon: 'ph ph-first-aid-kit', badge: 'claims' },
  { id: 'settings', label: 'Settings and roles', group: 'ADMIN', icon: 'ph ph-sliders-horizontal' },
  { id: 'reports', label: 'Reports', group: 'ADMIN', icon: 'ph ph-chart-bar' },
]

export const CONSOLE_GROUPS = ['COLLECT', 'PEOPLE', 'ADMIN'] as const

/** An HR officer in a state secretariat is often on a handset, so the same
    screens reflow into a phone frame rather than getting a cut-down app. */
export const CONSOLE_TABS: readonly { label: string; to: ConsoleScreen; icon: string }[] = [
  { label: 'Home', to: 'dash', icon: 'squares-four' },
  { label: 'Collect', to: 'recon', icon: 'git-diff' },
  { label: 'Members', to: 'roster', icon: 'users-three' },
  { label: 'More', to: 'settings', icon: 'dots-three-circle' },
]

/** The route each console screen owns. The console lives under /console so it
    can be deployed beside the member app on one origin. */
export const CONSOLE_URLS: Record<ConsoleScreen, string> = {
  dash: '/console',
  upload: '/console/schedule',
  recon: '/console/reconciliation',
  exception: '/console/reconciliation/exceptions/CSP-114-88214',
  debit: '/console/direct-debit',
  remit: '/console/remittances',
  roster: '/console/members',
  members: '/console/members/add',
  claims: '/console/claims',
  settings: '/console/settings',
  reports: '/console/reports',
}

/** Longest match wins, so /console/members/add does not resolve to the roster. */
export function consoleScreenForPath(pathname: string): ConsoleScreen {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const ids = (Object.keys(CONSOLE_URLS) as ConsoleScreen[])
    .sort((a, b) => CONSOLE_URLS[b].length - CONSOLE_URLS[a].length)
  const hit = ids.find((id) => path === CONSOLE_URLS[id] || path.startsWith(`${CONSOLE_URLS[id]}/`))
  return hit ?? 'dash'
}

