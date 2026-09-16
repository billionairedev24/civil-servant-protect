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

export const CONSOLE_FRAME = {
  desktop: { w: 1084, h: 812, border: '1px solid #DAD8CE', radius: 14, pad: '26px 30px 40px' },
  mobile: { w: 390, h: 844, border: '10px solid #22262A', radius: 44, pad: '16px 18px 30px' },
} as const

/**
 * The right-rail explainer. This is the whole thesis of the console: money
 * arrives as a batch you do not control, and the exceptions queue is the
 * product.
 */
export const MONEY_NOTES: readonly { n: string; t: string; b: string }[] = [
  {
    n: '01',
    t: 'Schedule out',
    b: 'One row per member goes to the payroll office before the cut-off. Federal to the IPPIS unit, state to the Accountant-General, employer to their own finance team.',
  },
  {
    n: '02',
    t: 'Deducted at source',
    b: 'Payroll applies it when salaries run. No money has moved to us yet — the employer is holding it.',
  },
  {
    n: '03',
    t: 'One lump sum arrives',
    b: 'A single transfer covers every member for the month. Hundreds of people, one credit, days or weeks after the salary run.',
  },
  {
    n: '04',
    t: 'The return file decides cover',
    b: "Only the reconciled schedule says who was actually deducted. The bank credit cannot tell you that, which is why the app says 'waiting for file' rather than 'paid'.",
  },
  {
    n: '05',
    t: 'Exceptions are the product',
    b: 'Unmatched, missing, wrong amount, left service. Clearing them is what turns money into cover — and what unblocks the next run.',
  },
]
