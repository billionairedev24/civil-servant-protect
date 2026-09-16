import type { CSSProperties, ReactNode } from 'react'
import { C, MONO } from '../theme/tokens'

/** All-caps mono eyebrow. Used above nearly every section in the design. */
export function Kicker({
  children,
  color = C.faint,
  size = 10,
  style,
}: {
  children: ReactNode
  color?: string
  size?: number
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: size,
        letterSpacing: '.12em',
        color,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Mono run of text — reference numbers, CSP-IDs, rail codes, dates. */
export function Mono({
  children,
  size = 12,
  color,
  weight,
  style,
}: {
  children: ReactNode
  size?: number
  color?: string
  weight?: number
  style?: CSSProperties
}) {
  return (
    <span style={{ fontFamily: MONO, fontSize: size, color, fontWeight: weight, ...style }}>
      {children}
    </span>
  )
}

export function ScreenTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.02em', ...style }}>{children}</div>
  )
}

export function Sub({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.5, color: C.mut, marginTop: 4, ...style }}>
      {children}
    </div>
  )
}

/** Boxed note. `tone` picks the semantic: neutral, ochre (attention) or green. */
export function Note({
  children,
  tone = 'neutral',
  icon,
  style,
}: {
  children: ReactNode
  tone?: 'neutral' | 'ochre' | 'green' | 'clay'
  icon?: ReactNode
  style?: CSSProperties
}) {
  const skin = {
    neutral: { border: C.line, bg: C.white, fg: C.mut },
    ochre: { border: C.ochreBorder, bg: C.ochreBg, fg: C.ochreInk },
    green: { border: C.gBorder, bg: C.gTint, fg: C.mut },
    clay: { border: C.clay, bg: C.clayBg, fg: C.clayInk },
  }[tone]

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: icon ? '14px' : '14px',
        border: `1px solid ${skin.border}`,
        borderRadius: 10,
        background: skin.bg,
        ...style,
      }}
    >
      {icon}
      <div style={{ fontSize: 13, lineHeight: 1.5, color: skin.fg }}>{children}</div>
    </div>
  )
}

/** Progress bars above a wizard step. */
export function StepBars({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: 'flex', gap: total > 3 ? 4 : 5, marginTop: 11 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            background: i <= current ? C.g : C.line,
          }}
        />
      ))}
    </div>
  )
}

/** Key/value row inside a bordered record card. */
export function RecordRow({ k, v, last }: { k: ReactNode; v: ReactNode; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 14,
        padding: '14px 15px',
        borderBottom: last ? undefined : `1px solid ${C.line6}`,
      }}
    >
      <span style={{ fontSize: 13, color: C.faint }}>{k}</span>
      <span style={{ fontSize: 14.5, fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  )
}
