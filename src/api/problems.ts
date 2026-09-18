/**
 * What a person is told when something fails, and what is kept for us.
 *
 * Two different audiences, and they had been getting the same string. A console
 * sign-in that was not configured said "VITE_OIDC_ISSUER is unset — see
 * SETUP.md" to an officer in a secretariat: it names a build variable and a file
 * in a repository they have never seen, tells them nothing they can act on, and
 * describes our deployment to anyone standing behind them.
 *
 * So a message reaches a screen only if it was written for one. Everything else
 * becomes a sentence the person can act on, and the real detail goes to the
 * console where somebody debugging can find it.
 */

/** A message written to be read by the person it is shown to. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

/**
 * The sentence to put on the screen.
 *
 * `ApiError` extends {@link UserFacingError} and so passes through: those
 * messages are the server's and are part of the product — "a preparer cannot
 * close a cycle, ask an approver" tells somebody what to do next, where
 * "Request failed with status 403" sends them to a phone.
 *
 * @param fallback what to say when the failure was not written for anybody —
 *     a network blip, a library's internal error, a provider's error code.
 */
export function friendly(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message

  /*
   * Kept, not shown. This is the only copy of what actually went wrong, and a
   * support call that starts "it just says try again" is one somebody has to
   * reproduce blind.
   */
  // eslint-disable-next-line no-console
  console.error('[csp] unhandled failure shown to a user as: ' + fallback, error)
  return fallback
}
