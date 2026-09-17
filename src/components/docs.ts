/**
 * What a claim's documents are called, and what may be sent.
 *
 * Plain data and one function, in a module with no React in it, because the
 * phone app needs both and can take neither a `<button>` nor a file input. The
 * web's `DocumentPicker` re-exports them so no screen had to change.
 */
import { EN_ONLY } from '../i18n'

/** What the API accepts. Stated here too, so the file dialogue offers only those. */
export const ACCEPTED = 'application/pdf,image/jpeg,image/png'

/**
 * The name of one required document.
 *
 * Falls back to the key with the underscores taken out. That is deliberate: the
 * server's list changes with the underwriter's wording version, and a document
 * this build has never heard of should read "coroner report" rather than vanish
 * from a list somebody has to complete.
 */
export function docName(key: string): string {
  const named = (EN_ONLY as Record<string, string>)[`doc_${key}`]
  return named ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

