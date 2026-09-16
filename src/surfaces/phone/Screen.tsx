import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { usePhone } from './state'
import type { PhoneScreen } from './nav'

/**
 * A phone screen body. Two shapes:
 *  - `scroll` — the content scrolls under the tab bar, so it carries 100px of
 *    bottom padding to clear it.
 *  - default — a flex column that fills the viewport, for wizards that pin a
 *    primary action to the bottom.
 */
export function Screen({
  children,
  pad,
  scroll = false,
  style,
}: {
  children: ReactNode
  pad?: string
  scroll?: boolean
  style?: CSSProperties
}) {
  return (
    <div
      className="rise"
      style={
        scroll
          ? { flex: 1, minHeight: 0, overflowY: 'auto', padding: pad ?? '6px 22px 100px', ...style }
          : {
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              padding: pad ?? '8px 24px 24px',
              ...style,
            }
      }
    >
      {children}
    </div>
  )
}

/** Top-left back action. Never at the bottom — see tokens.css. */
export function BackButton({ to, onClick }: { to?: PhoneScreen; onClick?: () => void }) {
  const { go, t } = usePhone()
  return (
    <button type="button" className="btn-back" onClick={onClick ?? (() => to && go(to))}>
      <Icon name="ph ph-arrow-left" size={16} />
      {t.back}
    </button>
  )
}
