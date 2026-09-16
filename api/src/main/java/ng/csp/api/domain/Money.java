package ng.csp.api.domain;

/**
 * Money crosses the wire in minor units (kobo) as a whole number, never a formatted string and
 * never a decimal. ₦2,500 is 250000. Formatting is the client's job, because only the client knows
 * the member's language.
 */
public final class Money {

  private Money() {}

  public static final long KOBO = 100L;

  public static long naira(long amount) {
    return amount * KOBO;
  }

  public static final long PREMIUM_STANDARD = naira(2_500);
}
