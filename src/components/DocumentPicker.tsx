import { useRef } from 'react'
import { Icon } from './Icon'
import { EN_ONLY } from '../i18n'
import { ACCEPTED, docName } from './docs'
import { C } from '../theme/tokens'
import type { DocState } from '../api/claim'

export { ACCEPTED, docName }

/**
 * Pick a file for one document, and say where it got to.
 *
 * Shared by the phone and the web wizard. The chrome around it differs — a
 * camera-first row on a handset, a drop target on a desktop — but which
 * document, what state it is in and what a retry does are the same on both, and
 * were about to be written twice.
 */
export function DocumentPicker({
  docKey,
  state,
  onPick,
  label,
  compact,
}: {
  docKey: string
  state: DocState
  onPick: (file: File) => void
  /** Overrides the button's text; defaults to Add / Replace by state. */
  label?: string
  compact?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const sending = state === 'sending'
  const done = state === 'received'

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={sending}
        onClick={() => input.current?.click()}
        style={{
          height: compact ? 34 : 38,
          padding: compact ? '0 14px' : '0 16px',
          fontSize: compact ? 12.5 : 13.5,
          opacity: sending ? 0.6 : 1,
        }}
      >
        {sending && <Icon name="ph ph-circle-notch" size={14} color={C.g} />}
        {label ?? (sending ? EN_ONLY.doc_sending : done ? EN_ONLY.doc_replace : EN_ONLY.doc_add)}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED}
        // Off-screen rather than hidden: a display:none input is not reachable
        // by a keyboard, and the button above is what carries the accessible
        // name either way.
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        aria-label={`${docName(docKey)} — choose a file`}
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Cleared so picking the same file twice after a failure still fires.
          e.target.value = ''
          if (file) onPick(file)
        }}
      />
    </>
  )
}
