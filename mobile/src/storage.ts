import { createMMKV } from 'react-native-mmkv'
import type { TokenStore } from '../../src/api/client'
import type { MemberSummary } from '../../src/api/types'

/**
 * What survives the app being closed.
 *
 * MMKV rather than AsyncStorage, which the build spec asks for and which is the
 * right call for the reason it usually is not: this is read synchronously
 * during the first render. The protection card has to be on screen before the
 * network has been touched, because the moment it is most needed is at a
 * hospital gate with no signal, and an async read means a blank card and a
 * spinner in exactly that moment.
 */
const store = createMMKV({ id: 'csp' })

const REFRESH_KEY = 'session.refresh'
const CARD_KEY = 'card.summary'
const QR_KEY = 'card.qr'

/**
 * The session, as the spec describes it: device-bound refresh token kept, access
 * token not.
 *
 * The access token lives in memory and dies with the process. The refresh token
 * is what saves a member an SMS every time they open the app, and is bound to
 * this device server-side — stolen off a handset it is worth nothing on another
 * one.
 *
 * Not encrypted here. MMKV can encrypt with a key, but a key held beside the
 * data protects against nothing; the right answer is the Android keystore, and
 * that is written down in the README rather than pretended at.
 */
export function deviceTokenStore(): TokenStore {
  let access = ''
  return {
    read: () => {
      const refresh = store.getString(REFRESH_KEY) ?? ''
      return access || refresh ? { accessToken: access, refreshToken: refresh } : null
    },
    write: (tokens) => {
      access = tokens.accessToken
      store.set(REFRESH_KEY, tokens.refreshToken)
    },
    clear: () => {
      access = ''
      store.remove(REFRESH_KEY)
    },
  }
}

/**
 * The card, kept for when there is no network.
 *
 * Only what the card shows: the name, the CSP-ID, the cover and who it pays.
 * Not the ledger, not the claim — a stale contribution figure is a wrong
 * figure, and this is a cache rather than a copy of the record.
 */
export function rememberCard(summary: MemberSummary): void {
  try {
    store.set(CARD_KEY, JSON.stringify(summary))
  } catch {
    // A full disk is not a reason to fail the screen that just loaded fine.
  }
}

export function rememberedCard(): MemberSummary | null {
  try {
    const held = store.getString(CARD_KEY)
    return held ? (JSON.parse(held) as MemberSummary) : null
  } catch {
    return null
  }
}

/**
 * The card's QR, kept for the same reason and more urgently.
 *
 * The summary above is what the card *says*; this is what a gate *scans*, and
 * it is the half that cannot be reconstructed from memory or read off the
 * screen by a person. Stored separately from the summary because it comes from
 * a different endpoint and expires on its own ninety-day clock.
 *
 * A data URI, so nothing has to be fetched or decoded to show it — which is the
 * whole point at a gate with no signal.
 */
export function rememberQr(dataUri: string): void {
  try {
    store.set(QR_KEY, dataUri)
  } catch {
    // As above: a full disk should not break the screen that just worked.
  }
}

export function rememberedQr(): string | null {
  try {
    return store.getString(QR_KEY) ?? null
  } catch {
    return null
  }
}

/** Signing out takes the card with it. The next person on this handset is not them. */
export function forgetEverything(): void {
  store.remove(REFRESH_KEY)
  store.remove(CARD_KEY)
  store.remove(QR_KEY)
}
