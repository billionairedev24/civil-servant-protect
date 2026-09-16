import type { CSSProperties } from 'react'

/**
 * Phosphor glyph. The design specifies icons by their full class string
 * ("ph ph-bank", "ph-fill ph-check-circle"), and weight carries meaning —
 * filled marks the active tab and a completed stage, regular everything else —
 * so the class is passed through rather than reconstructed from a name.
 */
export function Icon({
  name,
  size = 16,
  color,
  style,
}: {
  name: string
  size?: number | string
  color?: string
  style?: CSSProperties
}) {
  return (
    <i
      className={name}
      aria-hidden="true"
      style={{ fontSize: typeof size === 'number' ? `${size}px` : size, color, lineHeight: 1, flex: 'none', ...style }}
    />
  )
}
