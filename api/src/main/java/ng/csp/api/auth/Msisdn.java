package ng.csp.api.auth;

/**
 * Nigerian mobile numbers, normalised to E.164.
 *
 * <p>So that 08030000214, +2348030000214 and 234 803 000 0214 are one person rather than three —
 * which matters because the phone number is the account.
 */
public final class Msisdn {

  private Msisdn() {}

  public static String normalise(String raw) {
    var digits = raw.replaceAll("\\D", "");
    if (digits.startsWith("234")) {
      return "+" + digits;
    }
    if (digits.startsWith("0")) {
      return "+234" + digits.substring(1);
    }
    if (digits.length() == 10) {
      return "+234" + digits;
    }
    return "+" + digits;
  }
}
