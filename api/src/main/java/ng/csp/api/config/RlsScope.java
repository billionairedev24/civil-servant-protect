package ng.csp.api.config;

import java.util.UUID;
import java.util.function.Supplier;

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
    var hook = reapplier;
    if (hook != null) {
      // Reaches the connection already bound to an open transaction. Without
      // this, changing the scope mid-transaction changes nothing at all.
      hook.apply(scope);
    }
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

  /**
   * Re-applies a scope to a connection that has already been checked out.
   *
   * <p>Registered by {@link DataSourceConfig}. Null in a context with no database, which is the only
   * reason it is nullable rather than required.
   */
  @FunctionalInterface
  public interface Reapplier {
    void apply(RlsScope scope);
  }

  private static volatile Reapplier reapplier;

  static void onScopeChange(Reapplier hook) {
    reapplier = hook;
  }

  /**
   * Run something outside every policy — the seeder, a batch job, a write to the replay log.
   *
   * <p><b>This has to work inside an open transaction, and making it do so took five bugs.</b>
   *
   * <p>{@link ScopedDataSource} applies the scope when a connection is checked out. A transaction
   * checks out its connection when it begins — so setting this ThreadLocal inside a
   * {@code @Transactional} method changed nothing about the connection already in use, and the
   * enclosing scope stayed in force. Every time, the failure was silent or nearly so: a subquery
   * that returned no rows rather than erroring, a migration that backfilled nothing, a batch job that
   * rejected every row for having no matching member, an insert refused by a policy on a table
   * nobody thought they were writing to.
   *
   * <p>So it now also re-applies the setting to the connection bound to the current transaction, if
   * there is one, and puts the previous scope back afterwards. The settings are session-level, which
   * is what makes that possible — see ScopedDataSource for why they are.
   */
  public static <T> T runUnscoped(Supplier<T> work) {
    var previous = CURRENT.get();
    set(UNSCOPED);

    /*
     * Not try/finally, because a finally block that throws replaces the
     * exception on its way out.
     *
     * When the work fails, its transaction is aborted, and putting the scope
     * back means a statement on a connection that will refuse every statement
     * until somebody rolls it back. That failure is not the interesting one: it
     * buried a duplicate-key violation under "could not apply the row-level
     * scope", which says nothing about what actually went wrong. So on the
     * failure path the original is rethrown and the restore is attached to it,
     * and on the happy path a failed restore is still loud.
     */
    T result;
    try {
      result = work.get();
    } catch (RuntimeException failure) {
      try {
        set(previous);
      } catch (RuntimeException restoring) {
        failure.addSuppressed(restoring);
      }
      throw failure;
    }
    set(previous);
    return result;
  }
}
