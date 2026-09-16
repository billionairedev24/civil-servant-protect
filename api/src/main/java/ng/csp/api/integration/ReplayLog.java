package ng.csp.api.integration;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import ng.csp.api.config.RlsScope;
import ng.csp.api.web.Rows;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/**
 * Writes down every call to an external system, before it is made.
 *
 * <p>The order matters and is the whole design. The row goes in first, in its own transaction, and
 * is completed afterwards. If the process dies mid-call the row survives as {@code attempting},
 * which is the honest state: we asked, and we do not know what happened.
 *
 * <p>That is the state nobody wants and everybody needs. NIBSS may or may not have moved the money.
 * The SMS gateway may or may not have sent the code. A log line saying "calling NIBSS" that is only
 * written on success answers neither question — and answering them is the entire reason the build
 * spec asks for a replay log rather than metrics.
 *
 * <p>Runs unscoped: this table is visible to operations and not to a sponsor, and the call is often
 * made from a request whose row-level scope is one MDA.
 */
@Component
public class ReplayLog {

  private static final Logger log = LoggerFactory.getLogger(ReplayLog.class);

  private final JdbcClient db;
  private final ObjectMapper json;
  private final Resilient resilient;

  /*
   * Its own transaction, opened by hand.
   *
   * @Transactional(REQUIRES_NEW) on these methods did nothing, because they are
   * called from `around` on `this` and never go through the proxy. Worse, it
   * looked right: the log worked for every caller who happened to be unscoped
   * and failed only for a request already scoped to a sponsor, with a row-level
   * security violation from a table nobody thought they were writing to.
   *
   * A template makes the boundary explicit, and — this is the part that matters
   * — lets the scope be set *outside* it. ScopedDataSource applies the scope
   * when a connection is checked out, so setting it inside the transaction is
   * always too late.
   */
  private final TransactionTemplate ownTransaction;

  public ReplayLog(
      JdbcClient db, ObjectMapper json, Resilient resilient, PlatformTransactionManager transactions) {
    this.db = db;
    this.json = json;
    this.resilient = resilient;
    this.ownTransaction = new TransactionTemplate(transactions);
    this.ownTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  /**
   * Runs something unscoped, in a transaction of its own.
   *
   * <p>In that order. The scope is a ThreadLocal read at connection checkout, and the transaction is
   * what checks out the connection — so unscoped has to be set before the transaction begins, not
   * inside it.
   *
   * <p>The transaction is separate so that a caller's rollback cannot erase the record of a call
   * that has already gone out. That is the one row which must survive whatever happens to the
   * request that made it.
   */
  private <T> T recordSeparately(Supplier<T> work) {
    return RlsScope.runUnscoped(() -> ownTransaction.execute(status -> work.get()));
  }

  /**
   * One call: what it is, what it is about, and whether doing it twice would be a mistake.
   *
   * <p>That last part is the distinction that matters, and it is stated rather than inferred.
   * Sending a payout twice pays a family twice; verifying a NIN twice costs a fraction of a naira.
   * Treating every call as once-only looks safe and is not — it made a second enrolment attempt for
   * the same person fail with "already done", so an officer who mistyped a date of birth could never
   * correct it.
   */
  public record Call(String system, String operation, String subject, String idempotencyKey,
      boolean onceOnly) {

    /**
     * A call that must happen at most once, ever.
     *
     * <p>Money, and anything else with a consequence in the world that cannot be taken back. The key
     * is the caller's own reference — a claim reference, a challenge id — and a second call carrying
     * it does not go out.
     */
    public static Call once(String system, String operation, String subject, String key) {
      return new Call(system, operation, subject, key, true);
    }

    /**
     * A call that may be made again: a read, a lookup, a verification.
     *
     * <p>Still recorded, because "did we ask NIMC about this person, and what did they say" is worth
     * knowing. Each attempt gets its own row rather than colliding with the last one.
     */
    public static Call repeatable(String system, String operation, String subject) {
      return new Call(system, operation, subject, subject + ":" + UUID.randomUUID(), false);
    }
  }

  /**
   * Records the attempt, runs it through the breaker, records the outcome.
   *
   * <p>A repeat of a call that already succeeded returns without calling again — which is what makes
   * a retried claim payout safe. The uniqueness is enforced by an index rather than by a read, so
   * two workers racing on the same claim cannot both decide they are first.
   */
  public <T> T around(Call call, Map<String, Object> request, Supplier<T> work) {
    if (call.onceOnly() && alreadySucceeded(call)) {
      log.info("{} {} already done for {} — not calling again", call.system(), call.operation(), call.subject());
      throw new AlreadyDone(call);
    }

    var id = begin(call, request);
    var started = Instant.now();
    try {
      var result = resilient.call(call.system(), work);
      finish(id, "succeeded", result, null, started);
      return result;
    } catch (IntegrationException.Refused e) {
      // The other side said no. That is an answer, and a final one.
      finish(id, "refused", null, "%s: %s".formatted(e.code(), e.getMessage()), started);
      throw e;
    } catch (RuntimeException e) {
      finish(id, "failed", null, e.getMessage(), started);
      throw e;
    }
  }

  /** Thrown when the idempotency key says this exact call has already gone through. */
  public static final class AlreadyDone extends RuntimeException {
    public AlreadyDone(Call call) {
      super("%s %s was already done for %s".formatted(call.system(), call.operation(), call.subject()));
    }
  }

  private boolean alreadySucceeded(Call call) {
    return recordSeparately(
        () ->
            db.sql(
                    """
                    SELECT count(*)::int FROM integration_calls
                     WHERE system = CAST(:s AS integration_system)
                       AND idempotency_key = :k
                       AND state = 'succeeded'
                    """)
                .param("s", call.system())
                .param("k", call.idempotencyKey())
                .query(Integer.class)
                .single()
            > 0);
  }

  UUID begin(Call call, Map<String, Object> request) {
    return recordSeparately(
        () ->
            db.sql(
                    """
                    INSERT INTO integration_calls
                      (system, operation, subject, idempotency_key, request, breaker_state)
                    VALUES (CAST(:s AS integration_system), :op, :subj, :k,
                            CAST(:req AS jsonb), :breaker)
                    ON CONFLICT (system, idempotency_key) DO UPDATE
                      SET attempt = integration_calls.attempt + 1,
                          state = 'attempting',
                          error = NULL,
                          finished_at = NULL
                    RETURNING id
                    """)
                .param("s", call.system())
                .param("op", call.operation())
                .param("subj", call.subject())
                .param("k", call.idempotencyKey())
                .param("req", write(request))
                .param("breaker", resilient.stateOf(call.system()))
                .query(UUID.class)
                .single());
  }

  void finish(UUID id, String state, Object response, String error, Instant started) {
    var ms = (int) Math.min(Duration.between(started, Instant.now()).toMillis(), Integer.MAX_VALUE);
    recordSeparately(
        () ->
            db.sql(
                    """
                    UPDATE integration_calls
                       SET state = CAST(:state AS integration_state),
                           response = CAST(:resp AS jsonb),
                           error = :err,
                           finished_at = now(),
                           duration_ms = :ms
                     WHERE id = :id
                    """)
                .param("state", state)
                .param("resp", response == null ? null : write(response))
                .param("err", error)
                .param("ms", ms)
                .param("id", id)
                .update());
  }

  /** What is stuck: calls that never finished, or finished badly. For operations to work through. */
  public record Stuck(
      UUID id, String system, String operation, String subject, String state, int attempt,
      String error, Instant startedAt) {}

  public List<Stuck> stuck(int limit) {
    return recordSeparately(
        () ->
            db.sql(
                    """
                    SELECT id, system::text AS system, operation, subject, state::text AS state,
                           attempt, error, started_at
                      FROM integration_calls
                     WHERE state IN ('attempting', 'failed')
                     ORDER BY started_at
                     LIMIT :limit
                    """)
                .param("limit", limit)
                .query(
                    (rs, n) ->
                        new Stuck(
                            rs.getObject("id", UUID.class),
                            rs.getString("system"),
                            rs.getString("operation"),
                            rs.getString("subject"),
                            rs.getString("state"),
                            rs.getInt("attempt"),
                            rs.getString("error"),
                            Rows.instant(rs, "started_at")))
                .list());
  }

  private String write(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (RuntimeException e) {
      // A replay log that refuses to record a call because the payload would
      // not serialise is worse than one that records it as unreadable.
      log.warn("could not serialise an integration payload", e);
      return "{\"unserialisable\":true}";
    }
  }
}
