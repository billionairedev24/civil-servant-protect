package ng.csp.api.schedule;

import java.time.LocalDate;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.batch.core.job.Job;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.batch.core.step.Step;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.batch.infrastructure.repeat.RepeatStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Turning a payroll schedule into money owed, at the size these files actually are.
 *
 * <p>The old loader did a SELECT and an INSERT per row inside one transaction — about seventeen
 * thousand round trips for a federal schedule of 8,412, and flatly impossible at the million rows
 * the build spec asks for. It also rolled back everything on any failure, so one bad row cost the
 * whole load.
 *
 * <p>This is the same work as three set-based statements. Matching a million service numbers is one
 * UPDATE with a join, not a million SELECTs; creating a million contributions is one INSERT ...
 * SELECT. Postgres is very good at this and a JDBC loop is very bad at it, and the difference is
 * minutes against hours.
 *
 * <p>Each step still runs in bounded chunks rather than one enormous statement. One statement over a
 * million rows holds locks for its whole duration, bloats the table with dead tuples, cannot report
 * progress to anyone watching, and if it dies at row 900,000 it has done nothing. Batch's job
 * repository remembers which step finished, so a restart resumes at the one that did not.
 *
 * <p><b>Row-level scope.</b> Every statement here reads or writes across sponsors, and the scope is
 * set on the job's thread before the job starts — see ScheduleLoader#launch. It cannot be set inside
 * a tasklet: the tasklet's transaction opens its connection first, and ScopedDataSource applies the
 * scope at checkout. Getting that wrong fails quietly rather than loudly, because the staging table
 * has no policy — the job ran to completion and rejected every row for having no matching member,
 * having been unable to see the members table at all.
 *
 * <p>What this is not: the spec's pipeline has Kafka between the stages, so matching and loading
 * scale independently across workers. Here they are steps in one job in one process. The boundaries
 * are in the same places, which is what would make moving them onto a topic a deployment change
 * rather than a rewrite — but it has not been done.
 */
@Configuration
public class ScheduleLoadJob {

  private static final Logger log = LoggerFactory.getLogger(ScheduleLoadJob.class);

  /**
   * Rows per chunk.
   *
   * <p>Large enough that per-statement overhead disappears, small enough that a chunk's transaction
   * is short and a crash loses a second of work rather than an hour.
   *
   * <p>Configurable because the interesting behaviour is at the chunk boundary, and a test that has
   * to write ten thousand rows to reach one is a test nobody runs. The bug this guards against — a
   * window that decided some rows and rejected others it had never looked at — is invisible on any
   * file smaller than a chunk.
   */
  private final int chunk;

  private final JdbcClient db;
  private final ng.csp.api.rollfile.RollFileService rollFiles;

  public ScheduleLoadJob(
      JdbcClient db,
      ng.csp.api.rollfile.RollFileService rollFiles,
      @Value("${csp.schedule.chunk-size:10000}") int chunk) {
    this.db = db;
    this.rollFiles = rollFiles;
    this.chunk = chunk;
  }

  @Bean
  Job scheduleLoad(JobRepository jobs, PlatformTransactionManager tx) {
    return new JobBuilder("scheduleLoad", jobs)
        .start(matchStep(jobs, tx))
        .next(loadStep(jobs, tx))
        .next(finaliseStep(jobs, tx))
        .next(rollFileStep(jobs, tx))
        .build();
  }

  /**
   * Write down what arrived and what we did with it, and sign it.
   *
   * <p>A step of its own, after finalise, for two reasons. The rows must be in their final states —
   * a roll file rendered mid-load is a snapshot of work in progress, which is a different and much
   * less useful document. And rendering a million rows to a file and pushing it to a bucket is slow
   * and touches the network, which is not work to do inside the transaction that is finishing the
   * batch.
   *
   * <p>It cannot fail the job. {@link RollFileService#produce} catches everything and records the
   * reason on the batch — see the comment there and on {@code roll_file_error} in V14. A load that
   * posted a million contributions correctly and then could not reach object storage has a missing
   * document, not bad money, and the two need different responses.
   */
  private Step rollFileStep(JobRepository jobs, PlatformTransactionManager tx) {
    return new StepBuilder("rollFile", jobs)
        .tasklet(
            (contribution, context) -> {
              var params = context.getStepContext().getJobParameters();
              rollFiles.produce(UUID.fromString((String) params.get("batchId")));
              return RepeatStatus.FINISHED;
            },
            tx)
        .build();
  }

  /**
   * Attach each staged row to a member, by service number within the sponsor.
   *
   * <p>Rows that match nothing are marked rejected rather than dropped, because "line 4,412: no
   * member with service number 8812441" is what an officer needs — and a loader that silently skips
   * is how somebody stops being deducted for a month without anyone noticing.
   */
  private Step matchStep(JobRepository jobs, PlatformTransactionManager tx) {
    return new StepBuilder("match", jobs)
        .tasklet(
            (contribution, context) -> {
              var params = context.getStepContext().getJobParameters();
              var batchId = UUID.fromString((String) params.get("batchId"));
              var sponsorId = UUID.fromString((String) params.get("sponsorId"));

              /*
               * Match and reject in one statement, over one window.
               *
               * These were two statements, and it was wrong in a way that
               * looked right: the match took the first ten thousand staged
               * rows, and the rejection then took *its own* next ten thousand
               * staged rows — which were the rows the match had not reached
               * yet. On a 50,000-row file with 40,000 good rows it matched
               * 20,000 and rejected 30,000 perfectly valid members, reporting
               * success throughout. A LEFT JOIN over a single window cannot
               * make that mistake: every row in the window is decided, and
               * decided once.
               */
              var counts =
                  db.sql(
                          """
                          WITH win AS (
                            SELECT id, service_no FROM schedule_rows
                             WHERE batch_id = :batch AND state = 'staged'
                             ORDER BY id LIMIT :chunk
                             FOR UPDATE SKIP LOCKED
                          ), resolved AS (
                            SELECT w.id, w.service_no, m.id AS member_id
                              FROM win w
                              LEFT JOIN members m
                                ON m.sponsor_id = :sponsor AND m.service_no = w.service_no
                          ), done AS (
                            UPDATE schedule_rows r
                               SET member_id = x.member_id,
                                   state = CASE WHEN x.member_id IS NULL
                                                THEN 'rejected'::schedule_row_state
                                                ELSE 'matched'::schedule_row_state END,
                                   reason = CASE WHEN x.member_id IS NULL
                                                 THEN 'No member with service number ' || x.service_no
                                                 END
                              FROM resolved x
                             WHERE r.id = x.id
                            RETURNING r.state
                          )
                          SELECT count(*) FILTER (WHERE state = 'matched')::int AS matched,
                                 count(*)::int AS decided
                            FROM done
                          """)
                      .param("sponsor", sponsorId)
                      .param("batch", batchId)
                      .param("chunk", chunk)
                      .query((rs, n) -> new int[] {rs.getInt("matched"), rs.getInt("decided")})
                      .single();

              var matched = counts[0];
              var decided = counts[1];

              bump(batchId, "matched_count", matched);
              log.debug("match chunk: {} of {} decided rows matched", matched, decided);

              // Done when a pass decides nothing. CONTINUABLE runs the tasklet
              // again in a fresh transaction, which is the chunk boundary.
              return decided == 0 ? RepeatStatus.FINISHED : RepeatStatus.CONTINUABLE;
            },
            tx)
        .build();
  }

  /** Create the contribution each matched row owes. */
  private Step loadStep(JobRepository jobs, PlatformTransactionManager tx) {
    return new StepBuilder("load", jobs)
        .tasklet(
            (contribution, context) -> {
              var params = context.getStepContext().getJobParameters();
              var batchId = UUID.fromString((String) params.get("batchId"));
              var cycleId = UUID.fromString((String) params.get("cycleId"));
              var period = LocalDate.parse((String) params.get("period"));
              var railRef = (String) params.get("railRef");

              var loaded =
                  db.sql(
                          """
                          WITH taken AS (
                            SELECT id, member_id, amount_minor
                              FROM schedule_rows
                             WHERE batch_id = :batch AND state = 'matched'
                             ORDER BY id LIMIT :chunk
                             FOR UPDATE SKIP LOCKED
                          ), inserted AS (
                            INSERT INTO contributions
                              (member_id, cycle_id, period, amount_minor, source, status, rail_ref)
                            SELECT member_id, :cycle, :period, amount_minor,
                                   'payroll', 'expected', :ref
                              FROM taken
                            RETURNING member_id
                          )
                          UPDATE schedule_rows SET state = 'loaded'
                           WHERE id IN (SELECT id FROM taken)
                          """)
                      .param("batch", batchId)
                      .param("cycle", cycleId)
                      .param("period", period)
                      .param("ref", railRef)
                      .param("chunk", chunk)
                      .update();

              bump(batchId, "loaded_count", loaded);
              return loaded == 0 ? RepeatStatus.FINISHED : RepeatStatus.CONTINUABLE;
            },
            tx)
        .build();
  }

  /** Close the batch and the cycle, once. */
  private Step finaliseStep(JobRepository jobs, PlatformTransactionManager tx) {
    return new StepBuilder("finalise", jobs)
        .tasklet(
            (contribution, context) -> {
              var params = context.getStepContext().getJobParameters();
              var batchId = UUID.fromString((String) params.get("batchId"));
              var cycleId = UUID.fromString((String) params.get("cycleId"));

              /*
               * The cycle's totals come from what was loaded, not from what the
               * file claimed. A file saying it holds a million rows and a load
               * that made 900,000 contributions disagree, and the number worth
               * having is the one backed by rows.
               */
              db.sql(
                      """
                      UPDATE collection_cycles c
                         SET scheduled_count = t.n, scheduled_minor = t.total, state = 'sent',
                             sent_at = now()
                        FROM (SELECT count(*)::int AS n, COALESCE(sum(amount_minor), 0) AS total
                                FROM schedule_rows
                               WHERE batch_id = :batch AND state = 'loaded') t
                       WHERE c.id = :cycle
                      """)
                  .param("batch", batchId)
                  .param("cycle", cycleId)
                  .update();

              /*
               * At most five hundred rejections are kept on the batch. A file
               * where every row failed is one mistake — a wrong sponsor, a
               * stale export — and storing a million identical reasons as JSON
               * to say so helps nobody. The full list stays in schedule_rows,
               * which is where a full list belongs.
               */
              db.sql(
                      """
                      UPDATE schedule_batches b
                         SET state = 'complete',
                             finished_at = now(),
                             parsed_count = (SELECT count(*)::int FROM schedule_rows
                                              WHERE batch_id = b.id AND state = 'loaded'),
                             rejected = COALESCE((
                               SELECT jsonb_agg(jsonb_build_object('row', line_no, 'reason', reason)
                                                ORDER BY line_no)
                                 FROM (SELECT line_no, reason FROM schedule_rows
                                        WHERE batch_id = b.id AND state = 'rejected'
                                        ORDER BY line_no LIMIT 500) r), '[]'::jsonb)
                       WHERE b.id = :batch
                      """)
                  .param("batch", batchId)
                  .update();

              log.info("schedule batch {} loaded", batchId);
              return RepeatStatus.FINISHED;
            },
            tx)
        .build();
  }

  /*
   * Progress counters, so the console can say "412,000 of 1,000,000".
   *
   * Incremented rather than recomputed: counting a million-row table on every
   * chunk would cost more than the work the chunk did.
   */
  private void bump(UUID batchId, String column, int by) {
    if (by == 0) {
      return;
    }
    db.sql("UPDATE schedule_batches SET %s = %s + :by WHERE id = :id".formatted(column, column))
        .param("by", by)
        .param("id", batchId)
        .update();
  }
}
