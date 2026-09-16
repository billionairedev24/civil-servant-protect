package ng.csp.api.integration;

/**
 * SMS and USSD, to a Nigerian aggregator.
 *
 * <p>This is the adapter the sign-in path was missing: it logged "otp issued" and nothing left the
 * building. Everything a member is told outside the app goes through here — the sign-in code, the
 * "your deduction cleared" message, the beneficiary-confirmation nudge, the claim updates a
 * bereaved family gets while they are not looking at a phone app.
 *
 * <p>Delivery is not confirmed by the return of these methods. The gateway accepts a message and
 * delivers it later, or does not; {@code accepted} means it took responsibility for it. A delivery
 * receipt arrives by webhook, minutes or hours afterwards, and updates the replay-log row.
 */
public interface Comms {

  /** The gateway's id for a message it has accepted, for matching the delivery receipt later. */
  record Accepted(String messageId, String status) {}

  /**
   * The sign-in code.
   *
   * <p>Separate from {@link #notify} because it is the one message where latency is the product: a
   * member is standing at an HR desk with the app open. It is also the one that must never be
   * retried into a different code.
   */
  Accepted sendOtp(String msisdn, String code, String subject);

  /**
   * Everything else we tell a member.
   *
   * <p>Templated at the gateway rather than composed here, because the aggregators require
   * pre-registered templates for anything sent in bulk, and because a template id survives a
   * translation change without a deploy.
   */
  Accepted notify(String msisdn, String template, java.util.Map<String, String> values, String subject);

  /**
   * The USSD twin's session reply.
   *
   * <p>The spec gives feature-phone members a USSD channel, and it is the same product read out in
   * 182 characters. A member on a Nokia gets the same balance as a member on a Tecno.
   */
  String ussdReply(String sessionId, String msisdn, String input);
}
