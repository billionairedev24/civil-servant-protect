package ng.csp.api.domain;

import java.time.LocalDate;
import java.time.Period;
import java.util.List;

/**
 * Prices and the benefit schedule.
 *
 * <p>Every figure here is illustrative and carries no actuarial, legal or underwriting sign-off —
 * see README, "Known gaps". It lives in one class so that replacing it with a rated product is one
 * file and a migration rather than a hunt through handlers.
 */
public final class Pricing {

  private Pricing() {}

  /** A benefit row. Keyed, not positional, so a locale can reorder them. */
  public record Benefit(String key, Long valueMinor, String text) {
    static Benefit of(String key, long naira) {
      return new Benefit(key, Money.naira(naira), null);
    }

    static Benefit notIncluded(String key) {
      return new Benefit(key, null, "not_included");
    }
  }

  public record Tier(String code, String name, long priceMinor, List<Benefit> benefits) {}

  public record Schedule(String wordingVersion, LocalDate effectiveFrom, List<Tier> tiers) {}

  public static final Schedule SCHEDULE =
      new Schedule(
          "2026.1",
          LocalDate.of(2026, 1, 1),
          List.of(
              new Tier(
                  "basic",
                  "Basic",
                  Money.naira(1_500),
                  List.of(
                      Benefit.of("death", 2_000_000),
                      Benefit.of("accident_extra", 2_000_000),
                      Benefit.of("disability", 2_000_000),
                      Benefit.of("weekly_income", 30_000),
                      Benefit.of("funeral_advance", 150_000),
                      Benefit.notIncluded("hospital_cash"))),
              new Tier(
                  "standard",
                  "Standard",
                  Money.naira(2_500),
                  List.of(
                      Benefit.of("death", 5_000_000),
                      Benefit.of("accident_extra", 5_000_000),
                      Benefit.of("disability", 5_000_000),
                      Benefit.of("weekly_income", 50_000),
                      Benefit.of("funeral_advance", 250_000),
                      Benefit.of("hospital_cash", 250_000))),
              new Tier(
                  "enhanced",
                  "Enhanced",
                  Money.naira(4_000),
                  List.of(
                      Benefit.of("death", 10_000_000),
                      Benefit.of("accident_extra", 10_000_000),
                      Benefit.of("disability", 10_000_000),
                      Benefit.of("weekly_income", 90_000),
                      Benefit.of("funeral_advance", 500_000),
                      Benefit.of("hospital_cash", 500_000))),
              new Tier(
                  "executive",
                  "Executive",
                  Money.naira(6_000),
                  List.of(
                      Benefit.of("death", 20_000_000),
                      Benefit.of("accident_extra", 20_000_000),
                      Benefit.of("disability", 20_000_000),
                      Benefit.of("weekly_income", 120_000),
                      Benefit.of("funeral_advance", 1_000_000),
                      Benefit.of("hospital_cash", 750_000)))));

  public static long sumAssuredFor(String tierCode) {
    return SCHEDULE.tiers().stream()
        .filter(t -> t.code().equals(tierCode))
        .findFirst()
        .flatMap(t -> t.benefits().stream().filter(b -> b.key().equals("death")).findFirst())
        .map(Benefit::valueMinor)
        .orElse(0L);
  }

  public record DependantQuote(String band, long sumAssuredMinor, long premiumMinor) {}

  /**
   * What a dependant costs.
   *
   * <p>Banded rather than continuous because a member has to be able to check the number against a
   * printed table. A rate that moves with a birthday is impossible to argue with at a service desk,
   * which makes it impossible to trust.
   */
  public static DependantQuote quoteDependant(LocalDate dob, LocalDate on) {
    var age = Period.between(dob, on).getYears();
    if (age < 18) {
      return new DependantQuote("child", Money.naira(500_000), Money.naira(600));
    }
    if (age < 60) {
      return new DependantQuote("adult", Money.naira(2_000_000), Money.naira(1_200));
    }
    return new DependantQuote("senior", Money.naira(1_000_000), Money.naira(2_400));
  }
}
