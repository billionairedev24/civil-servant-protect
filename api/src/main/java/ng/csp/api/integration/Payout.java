package ng.csp.api.integration;

/**
 * NIBSS, for paying money out.
 *
 * <p>The one adapter where a retry is dangerous. Every other external call in this system can be
 * made twice with no worse consequence than a duplicate SMS; this one moves a death benefit into a
 * bereaved family's account, and sending it twice is a recovery problem measured in months.
 *
 * <p>So the contract is built around that. Every instruction carries a reference the caller owns —
 * the claim reference — the replay log enforces its uniqueness with an index, and the resilience
 * policy for this system is one attempt and no automatic retry. When NIBSS times out, the row sits
 * in the replay log as {@code attempting} and a human decides, having first checked with the bank.
 * That is slower than a retry and it is the only correct answer.
 */
public interface Payout {

  /** An account, as the claim record holds it. */
  record Account(String bankCode, String accountNumber, String accountName) {}

  /**
   * What NIBSS said.
   *
   * <p>{@code sessionId} is the reference a bank will accept as proof that a transfer was
   * instructed, so it goes on the claim and into the replay log. A family asking "where is our
   * money" is asking for this string.
   */
  record Transferred(String sessionId, String status, long amountMinor) {}

  /**
   * Confirm an account holds the name we think it does, before sending anything to it.
   *
   * <p>A read, and cheap, and it catches the transposed digit that would otherwise pay a stranger.
   * NIBSS returns the name on the account; comparing it to the claimant's is the caller's job.
   */
  String resolveAccountName(String bankCode, String accountNumber, String subject);

  /**
   * Send the money.
   *
   * @param claimRef the caller's own reference, and the idempotency key. Two instructions carrying
   *     the same reference are the same instruction, and the second one does not go out.
   */
  Transferred transfer(Account to, long amountMinor, String narration, String claimRef);
}
