package ng.csp.api.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;

/**
 * Rail branching, server-side.
 *
 * <p>The UI already branches on the rail; this is the same idea one layer down, and it is the layer
 * that matters. A client can be wrong about which exception kinds exist, but if the server accepts
 * {@code no_funds} on a payroll cycle the ledger ends up describing something that never happened.
 */
public final class Rails {

  private Rails() {}

  public enum Method {
    PAYROLL,
    DIRECT_DEBIT;

    public String wire() {
      return name().toLowerCase();
    }
  }

  public enum SponsorType {
    FEDERAL,
    STATE,
    EMPLOYER,
    SELF;

    public static SponsorType fromWire(String value) {
      return valueOf(value.toUpperCase());
    }
  }

  public static Method methodFor(SponsorType type) {
    return type == SponsorType.SELF ? Method.DIRECT_DEBIT : Method.PAYROLL;
  }

  /**
   * A payroll file mismatches; a bank refuses. The two vocabularies never mix, so an exception kind
   * is only valid on the rail that can produce it.
   */
  public static final Set<String> PAYROLL_KINDS =
      Set.of("unmatched", "no_deduction", "wrong_amount", "left_service");

  public static final Set<String> DEBIT_KINDS = Set.of("no_funds", "mandate_revoked", "card_expired");

  public static List<String> kindsFor(Method method) {
    return List.copyOf(method == Method.PAYROLL ? PAYROLL_KINDS : DEBIT_KINDS);
  }

  public static boolean kindAllowed(Method method, String kind) {
    return (method == Method.PAYROLL ? PAYROLL_KINDS : DEBIT_KINDS).contains(kind);
  }

  /**
   * How long after the period a collection is expected to be answered.
   *
   * <p>This is the whole difference between the rails, in one number. A payroll schedule goes out and
   * sits on someone's desk for most of a month; a direct debit is answered the same day. Cover
   * state, the card-fallback timer and every "is this late?" question downstream read from here.
   */
  public static int answerWindowDays(Method method) {
    return method == Method.PAYROLL ? 26 : 1;
  }

  /** Days after the answer window before the member's card is tried instead. */
  public static final int CARD_FALLBACK_DAYS = 7;

  /** Days of nothing at all before cover lapses. Warned three times first. */
  public static final int GRACE_DAYS = 60;

  public record Timeline(Method method, Instant answerDueAt, Instant cardFallbackAt, Instant graceEndsAt) {}

  /**
   * {@code period} is the first day of the month being collected for.
   *
   * <p>Computed in UTC from a calendar day. Lagos is UTC+1 with no DST so this is stable either way
   * — the reason it is written like this is that a period must never shift because a server moved
   * region.
   */
  public static Timeline timelineFor(LocalDate period, Method method) {
    var answerDue = period.plusDays(answerWindowDays(method)).atStartOfDay(ZoneOffset.UTC).toInstant();
    return new Timeline(
        method,
        answerDue,
        answerDue.plus(java.time.Duration.ofDays(CARD_FALLBACK_DAYS)),
        answerDue.plus(java.time.Duration.ofDays(GRACE_DAYS)));
  }

  /**
   * What a member should be told about a period.
   *
   * <p>{@code AWAITING_FILE} and {@code AWAITING_BANK} are separate states rather than one
   * "pending". They read differently to a member — one means an office has not sent something, the
   * other means a bank has not answered — and only one of them is anyone's fault.
   */
  public enum CollectionState {
    CONFIRMED,
    AWAITING_FILE,
    AWAITING_BANK,
    LATE,
    LAPSED;

    public String wire() {
      return name().toLowerCase();
    }
  }

  public static CollectionState collectionState(
      LocalDate period, Method method, boolean confirmed, Instant now) {
    if (confirmed) {
      return CollectionState.CONFIRMED;
    }
    var t = timelineFor(period, method);
    if (!now.isBefore(t.graceEndsAt())) {
      return CollectionState.LAPSED;
    }
    if (!now.isBefore(t.answerDueAt())) {
      return CollectionState.LATE;
    }
    return method == Method.PAYROLL ? CollectionState.AWAITING_FILE : CollectionState.AWAITING_BANK;
  }
}
