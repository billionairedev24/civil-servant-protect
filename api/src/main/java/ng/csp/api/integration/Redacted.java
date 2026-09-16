package ng.csp.api.integration;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * What an adapter is allowed to write into the replay log.
 *
 * <p>The replay log is the table somebody exports to a spreadsheet at 2am to work out whether a
 * payout went through. That makes it exactly the wrong place for a NIN, a full account number or a
 * one-time code — and exactly the place they end up, because the natural thing for an adapter to
 * log is "the request I sent".
 *
 * <p>So adapters do not build that map themselves. They describe the call through these helpers,
 * which keep what makes a row useful to investigate and drop what makes it dangerous to hold. A
 * masked phone number still identifies the message; the last four digits of an account still confirm
 * which account; a NIN's presence is worth recording and its value never is.
 */
public final class Redacted {

  private Redacted() {}

  /** Builds the request payload for a replay-log row. */
  public static Builder of(String... keyValues) {
    var builder = new Builder();
    for (int i = 0; i + 1 < keyValues.length; i += 2) {
      builder.plain(keyValues[i], keyValues[i + 1]);
    }
    return builder;
  }

  public static final class Builder {
    private final Map<String, Object> fields = new LinkedHashMap<>();

    /** A value that is safe as written: a template name, a bank code, a reference. */
    public Builder plain(String key, Object value) {
      fields.put(key, value);
      return this;
    }

    /** A phone number, as "+234803••••214". Enough to know which member, not enough to call them. */
    public Builder msisdn(String key, String msisdn) {
      fields.put(key, maskMsisdn(msisdn));
      return this;
    }

    /** An account number, as its last four. Enough to confirm, not enough to pay. */
    public Builder account(String key, String accountNumber) {
      fields.put(key, lastFour(accountNumber));
      return this;
    }

    /**
     * L3 data that was part of the call and is not part of the record.
     *
     * <p>Records that it was there — an investigation needs to know a NIN was sent — without
     * recording what it was.
     */
    public Builder withheld(String key) {
      fields.put(key, "«withheld»");
      return this;
    }

    public Map<String, Object> build() {
      return Map.copyOf(fields);
    }
  }

  public static String maskMsisdn(String msisdn) {
    if (msisdn == null || msisdn.length() < 7) return "«withheld»";
    return msisdn.substring(0, 7) + "••••" + msisdn.substring(msisdn.length() - 3);
  }

  public static String lastFour(String value) {
    if (value == null || value.length() < 4) return "••••";
    return "••••" + value.substring(value.length() - 4);
  }
}
