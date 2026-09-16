import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'
import { Kicker } from './primitives'
import { C, MONO } from '../theme/tokens'

/** White panel — the web surface's default container. */
export function Panel({
  children,
  pad = 19,
  dashed = false,
  style,
}: {
  children: ReactNode
  pad?: number
  dashed?: boolean
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        padding: pad,
        borderRadius: 12,
        background: C.white,
        border: dashed ? `1px dashed ${C.line9}` : `1px solid ${C.line}`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>{children}</div>
}

export function PageSub({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 14, color: C.mut, marginTop: 4, ...style }}>{children}</div>
}

/** Green table head used by every data table on this surface. */
export function TableHead({
  columns,
  template,
}: {
  columns: readonly { label: string; align?: 'left' | 'right' }[]
  template: string
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: template,
        background: C.gTint,
        borderBottom: '1px solid #DDE9E2',
      }}
    >
      {columns.map((c, i) => (
        <div
          key={i}
          style={{
            padding: '11px 16px',
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: '.1em',
            color: C.g,
            textAlign: c.align ?? 'left',
          }}
        >
          {c.label}
        </div>
      ))}
    </div>
  )
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div style={{ borderRadius: 12, background: C.white, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
      {children}
    </div>
  )
}

/**
 * Parity callout. Every screen names what it can do that the phone cannot, and
 * what stays on the phone — so nobody ships web assuming it replaces the app.
 */
export function ParityNote({
  kind,
  children,
  title,
}: {
  kind: 'web-only' | 'phone-only'
  children: ReactNode
  title?: string
}) {
  const phone = kind === 'phone-only'
  return (
    <div
      style={{
        padding: '13px 15px',
        border: phone ? `1px dashed ${C.line9}` : `1px solid ${C.line}`,
        borderRadius: 9,
        background: C.white,
      }}
    >
      <Kicker size={9.5} color={phone ? C.faint : C.g}>
        {title ?? (phone ? 'PHONE-ONLY, NOT ON WEB' : 'WEB-ONLY ADVANTAGE')}
      </Kicker>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: C.mut, marginTop: 5 }}>{children}</div>
    </div>
  )
}

/** Icon + title + body, the repeated "what this surface can do" row. */
export function FeatureRow({
  icon,
  title,
  body,
  muted = false,
}: {
  icon: string
  title: string
  body: string
  muted?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Icon name={icon} size={17} color={muted ? C.faint : C.g} style={{ marginTop: 1 }} />
      <span>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: muted ? C.mut : C.ink }}>
          {title}
        </span>
        <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45, color: muted ? C.faint : C.mut, marginTop: 1 }}>
          {body}
        </span>
      </span>
    </div>
  )
}

/** Status pill on a ledger row. */
export function StatusPill({ status }: { status: 'Received' | 'Pending' | 'Retried' }) {
  const skin =
    status === 'Received'
      ? { bg: C.gTint, fg: C.gd }
      : status === 'Pending'
        ? { bg: C.ochreBg, fg: C.ochre }
        : { bg: '#FBF0EB', fg: C.clay }
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px',
        borderRadius: 99, background: skin.bg, color: skin.fg,
        fontFamily: MONO, fontSize: 10, fontWeight: 600,
      }}
    >
      {status}
    </span>
  )
}
