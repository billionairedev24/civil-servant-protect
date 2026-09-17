import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, type UploadFile } from './client'
import { keys } from './queries'
import { useApi } from './provider'

/**
 * Filing a claim, shared by both member surfaces.
 *
 * The phone photographs the papers and the web takes a dragged-in scan, but the
 * steps underneath are identical — open the claim, send each document, finish —
 * and they were about to be written twice. They will be written a third time in
 * React Native, which is the real reason this is a hook with no JSX in it.
 *
 * It holds the claim reference for the length of the wizard and nothing else.
 * Everything a member sees afterwards comes back from the server.
 */

/** Wizard choice 0 → what the API calls it. Order matches `t.cl_o[0]`. */
const TYPES = ['death', 'accident', 'disability'] as const

/** Wizard choice 1 → who is claiming. Order matches `t.cl_o[1]`. */
const RELATIONS = ['self', 'spouse', 'next_of_kin'] as const

export type ClaimType = (typeof TYPES)[number]

/** Per-document progress. `failed` is a document to try again, not a dead claim. */
export type DocState = 'waiting' | 'sending' | 'received' | 'failed'

export interface ClaimWizard {
  /** Set once the claim exists on the server. Null until then. */
  ref: string | null
  /** What this claim type actually needs — the server's list, never a fixed one. */
  requiredDocs: string[]
  docState: Record<string, DocState>
  /** The faster funeral-advance claim the server opened alongside a death claim. */
  funeralAdvanceRef: string | null
  outstanding: number
  opening: boolean
  /** A message fit to read on the worst day of somebody's life, or null. */
  error: string | null
  open: (typeIndex: number, relationIndex: number) => Promise<string | null>
  send: (docKey: string, file: UploadFile) => Promise<void>
  reset: () => void
}

export function useClaimWizard(): ClaimWizard {
  const { api, live } = useApi()
  const queryClient = useQueryClient()

  const [ref, setRef] = useState<string | null>(null)
  const [requiredDocs, setRequiredDocs] = useState<string[]>([])
  const [funeralAdvanceRef, setFuneralAdvanceRef] = useState<string | null>(null)
  const [docState, setDocState] = useState<Record<string, DocState>>({})
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setRef(null)
    setRequiredDocs([])
    setFuneralAdvanceRef(null)
    setDocState({})
    setError(null)
  }, [])

  const open = useCallback(
    async (typeIndex: number, relationIndex: number) => {
      // On fixtures there is nothing to open, and the wizard walks through as
      // the demo always has. That is not a fallback: it is how the design gets
      // reviewed and how the route tests run.
      if (!live || !api) return null
      if (ref) return ref

      setOpening(true)
      setError(null)
      try {
        const opened = await api.openClaim({
          type: TYPES[typeIndex] ?? 'death',
          claimantRelation: RELATIONS[relationIndex] ?? 'next_of_kin',
        })
        setRef(opened.claimRef)
        setRequiredDocs(opened.requiredDocs)
        setFuneralAdvanceRef(opened.funeralAdvanceRef)
        setDocState(Object.fromEntries(opened.requiredDocs.map((k) => [k, 'waiting' as DocState])))
        // The claim list is how the tracking screen finds this claim at all.
        queryClient.invalidateQueries({ queryKey: keys.member() })
        return opened.claimRef
      } catch (e) {
        setError(e instanceof ApiError ? e.message : null)
        return null
      } finally {
        setOpening(false)
      }
    },
    [api, live, ref, queryClient],
  )

  const send = useCallback(
    async (docKey: string, file: UploadFile) => {
      if (!live || !api || !ref) return

      setDocState((s) => ({ ...s, [docKey]: 'sending' }))
      setError(null)
      try {
        await api.uploadClaimDocument(ref, docKey, file)
        setDocState((s) => ({ ...s, [docKey]: 'received' }))
        // The last document moves the claim to assessing, so both the list and
        // the claim's own record are now out of date.
        queryClient.invalidateQueries({ queryKey: keys.member() })
        queryClient.invalidateQueries({ queryKey: keys.claim(ref) })
      } catch (e) {
        /*
         * The document goes back to being one that needs sending, and the claim
         * is untouched. Half a certificate is not a state this wizard can be
         * in: the server only counts a document once the bytes are in the
         * store, so a failure here costs one retry and nothing else.
         */
        setDocState((s) => ({ ...s, [docKey]: 'failed' }))
        setError(e instanceof ApiError ? e.message : null)
      }
    },
    [api, live, ref, queryClient],
  )

  const outstanding = requiredDocs.filter((k) => docState[k] !== 'received').length

  return {
    ref,
    requiredDocs,
    docState,
    funeralAdvanceRef,
    outstanding,
    opening,
    error,
    open,
    send,
    reset,
  }
}
