package ng.csp.api.config;

import java.util.UUID;

/**
 * Who the database should think it is serving, for the life of one request.
 *
 * <p>Row-level security only works if the application says which scope it is acting in. Held in a
 * {@link ThreadLocal} set by {@link RlsScopeFilter} and applied on every connection checkout by
 * {@link ScopedDataSource}, so no query has to remember to pass it and none can forget.
 *
 * <p>The default is the empty scope, which sees nothing. That is deliberate: a bug that loses the
 * scope returns no rows rather than everyone's.
 */
public record RlsScope(UUID memberId, UUID sponsorId, boolean assessor, boolean unscoped) {

  private static final RlsScope NONE = new RlsScope(null, null, false, false);

  /** Background work and migrations, which legitimately cross every sponsor. */
  private static final RlsScope UNSCOPED = new RlsScope(null, null, false, true);

  private static final ThreadLocal<RlsScope> CURRENT = ThreadLocal.withInitial(() -> NONE);

  public static RlsScope current() {
    return CURRENT.get();
  }

  public static void set(RlsScope scope) {
    CURRENT.set(scope);
  }

  public static void clear() {
    CURRENT.remove();
  }

  public static RlsScope none() {
    return NONE;
  }

  /** Named {@code system} because {@code unscoped()} would collide with the record accessor. */
  public static RlsScope system() {
    return UNSCOPED;
  }

  public static RlsScope forMember(UUID memberId) {
    return new RlsScope(memberId, null, false, false);
  }

  public static RlsScope forSponsor(UUID sponsorId) {
    return new RlsScope(null, sponsorId, false, false);
  }

  public static RlsScope forAssessor() {
    return new RlsScope(null, null, true, false);
  }

  /** Run something outside every policy — the seeder, a batch job. Restores the previous scope. */
  public static <T> T runUnscoped(java.util.function.Supplier<T> work) {
    var previous = CURRENT.get();
    CURRENT.set(UNSCOPED);
    try {
      return work.get();
    } finally {
      CURRENT.set(previous);
    }
  }
}
