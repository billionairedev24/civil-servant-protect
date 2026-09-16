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
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
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

  public ReplayLog(JdbcClient db, ObjectMapper json, Resilient resilient) {
    this.db = db;
    this.json = json;
    this.resilient = resilient;
  }

  /** One call: what it is, what it is about, and how to know it is the same call twice. */
  public record Call(String system, String operation, String subject, String idempotencyKey) {}

  /**
   * Records the attempt, runs it through the breaker, records the outcome.
   *
   * <p>A repeat of a call that already succeeded returns without calling again — which is what makes
   * a retried claim payout safe. The uniqueness is enforced by an index rather than by a read, so
   * two workers racing on the same claim cannot both decide they are first.
   */
  public <T> T around(Call call, Map<String, Object> request, Supplier<T> work) {
    var existing = alreadySucceeded(call);
    if (existing) {
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
    return RlsScope.runUnscoped(
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

  /*
   * Its own transaction, deliberately.
   *
   * If this joined the caller's, a rollback would erase the record of a call
   * that had already gone out — the one row that must survive whatever happens
   * to the request that made it.
   */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  UUID begin(Call call, Map<String, Object> request) {
    return RlsScope.runUnscoped(
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

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  void finish(UUID id, String state, Object response, String error, Instant started) {
    var ms = (int) Math.min(Duration.between(started, Instant.now()).toMillis(), Integer.MAX_VALUE);
    RlsScope.runUnscoped(
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
    return RlsScope.runUnscoped(
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
