package ng.csp.api.schedule;

import java.sql.PreparedStatement;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import ng.csp.api.config.RlsScope;
import ng.csp.api.web.ApiException;
import ng.csp.api.web.Rows;
import org.springframework.batch.core.job.Job;
import org.springframework.batch.core.job.parameters.JobParametersBuilder;
import org.springframework.batch.core.launch.JobOperator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Staging a schedule, then handing it to the job.
 *
 * <p>Two steps with a clear line between them, and the line is the point. Staging is synchronous
 * because the officer who pressed upload is entitled to know the file was received and is
 * well-formed. Loading is asynchronous because a million rows is minutes, and an HTTP request that
 * takes minutes is one that a proxy will cut, a browser will abandon, and an officer will retry —
 * producing a second million rows.
 *
 * <p>So the upload returns a batch reference immediately and the console watches it. That is a
 * change to the endpoint's contract, and a deliberate one.
 */
@Component
public class ScheduleLoader {

  private static final Logger log = LoggerFactory.getLogger(ScheduleLoader.class);

  /*
   * One virtual thread per load.
   *
   * A load is almost entirely waiting on Postgres, which is what virtual
   * threads are for, and an unbounded pool is safe here because the work that
   * can queue is bounded by how many schedules a sponsor uploads in a month.
   */
  private final java.util.concurrent.ExecutorService loads =
      java.util.concurrent.Executors.newThreadPerTaskExecutor(
          Thread.ofVirtual().name("schedule-load-", 0).factory());

  private final JdbcClient db;
  private final JdbcTemplate jdbc;
  private final JobOperator jobOperator;
  private final Job scheduleLoad;

  public ScheduleLoader(JdbcClient db, JdbcTemplate jdbc, JobOperator jobOperator, Job scheduleLoad) {
    this.db = db;
    this.jdbc = jdbc;
    this.jobOperator = jobOperator;
    this.scheduleLoad = scheduleLoad;
  }

  /** One row of a payroll schedule, as it arrives. */
  public record Row(String serviceNo, String fullName, long amountMinor) {}

  public record Batch(
      UUID batchId, String state, int stagedCount, int matchedCount, int loadedCount,
      Instant startedAt, Instant finishedAt, String failure) {}

  /**
   * Write the rows down, fast, and say so.
   *
   * <p>A single JDBC batch insert with no lookups: the matching happens later, in SQL, against the
   * whole set at once. This is the part that has to be quick, because it is the part somebody is
   * waiting on.
   */
  @Transactional
  public UUID stage(UUID cycleId, String filename, UUID uploadedBy, List<Row> rows) {
    if (rows.isEmpty()) {
      throw ApiException.badRequest("That schedule has no rows.");
    }

    var batchId =
        db.sql(
                """
                INSERT INTO schedule_batches
                  (cycle_id, direction, filename, row_count, parsed_count, rejected, uploaded_by,
                   state, staged_count, started_at)
                VALUES (:c, 'outbound', :f, :rc, 0, '[]'::jsonb, :u, 'staged', :rc, now())
                RETURNING id
                """)
            .param("c", cycleId)
            .param("f", filename)
            .param("rc", rows.size())
            .param("u", uploadedBy)
            .query(UUID.class)
            .single();

    var line = new java.util.concurrent.atomic.AtomicInteger(0);
    jdbc.batchUpdate(
        """
        INSERT INTO schedule_rows (batch_id, line_no, service_no, full_name, amount_minor)
        VALUES (?, ?, ?, ?, ?)
        """,
        rows,
        // Rows per JDBC round trip. Not the same as the job's chunk size: this
        // one is about network round trips, that one is about transaction
        // length, and tying them together would mean tuning one by breaking the
        // other.
        2_000,
        // The line number is counted, not looked up. `rows.indexOf(row)` reads
        // naturally and is a linear scan per row — quadratic over the batch,
        // which at a million rows is not slow, it is a hang.
        (PreparedStatement ps, Row row) -> {
          ps.setObject(1, batchId);
          ps.setInt(2, line.incrementAndGet());
          ps.setString(3, row.serviceNo());
          ps.setString(4, row.fullName());
          ps.setLong(5, row.amountMinor());
        });

    return batchId;
  }

  /**
   * Start the load: on another thread, after this one's transaction commits.
   *
   * <p>Both halves of that sentence are load-bearing, and each was a hang.
   *
   * <p>Spring Batch launches on the calling thread by default. Started inline, the job ran on the
   * Tomcat handler and the request waited for a million rows — and then deadlocked, because the
   * job's final step updates the same {@code schedule_batches} row that the request's own
   * transaction was still holding.
   *
   * <p>Started merely on another thread it would deadlock differently: the staged rows are not
   * committed yet, so the match step would see an empty table and declare the load finished. Hence
   * {@code afterCommit}, which is the only point at which the rows this job is about actually
   * exist.
   *
   * <p>The batch id is a job parameter, so each upload is its own job instance — two sponsors
   * loading at once do not collide, and restarting a failed load resumes that one.
   */
  public void launch(UUID batchId, UUID sponsorId, UUID cycleId, LocalDate period, String railRef) {
    var params =
        new JobParametersBuilder()
            .addString("batchId", batchId.toString())
            .addString("sponsorId", sponsorId.toString())
            .addString("cycleId", cycleId.toString())
            .addString("period", period.toString())
            .addString("railRef", railRef)
            .toJobParameters();

    Runnable start =
        () ->
            loads.execute(
                () -> {
                  /*
                   * The scope is set on the thread, before the job starts.
                   *
                   * ScopedDataSource applies the row-level scope when a
                   * connection is checked out, and a tasklet's transaction
                   * opens its connection before the tasklet body runs — so
                   * wrapping the SQL inside the tasklet in runUnscoped is too
                   * late. It looked like it worked, because the staging table
                   * has no policy: the job cheerfully rejected every row for
                   * having no matching member, having been unable to see the
                   * members table at all.
                   */
                  RlsScope.set(RlsScope.system());
                  try {
                    jobOperator.start(scheduleLoad, params);
                  } catch (Exception e) {
                    log.error("schedule load {} did not start", batchId, e);
                    RlsScope.runUnscoped(
                        () ->
                            db.sql(
                                    """
                                    UPDATE schedule_batches
                                       SET state = 'failed', failure = :why, finished_at = now()
                                     WHERE id = :id
                                    """)
                                .param("why", String.valueOf(e.getMessage()))
                                .param("id", batchId)
                                .update());
                  } finally {
                    RlsScope.clear();
                  }
                });

    if (TransactionSynchronizationManager.isSynchronizationActive()) {
      TransactionSynchronizationManager.registerSynchronization(
          new TransactionSynchronization() {
            @Override
            public void afterCommit() {
              start.run();
            }
          });
    } else {
      start.run();
    }
  }

  /** What the console polls while a load is running. */
  public Batch status(UUID batchId) {
    return db.sql(
            """
            SELECT id, state, staged_count, matched_count, loaded_count, started_at, finished_at,
                   failure
              FROM schedule_batches WHERE id = :id
            """)
        .param("id", batchId)
        .query(
            (rs, n) ->
                new Batch(
                    rs.getObject("id", UUID.class),
                    rs.getString("state"),
                    rs.getInt("staged_count"),
                    rs.getInt("matched_count"),
                    rs.getInt("loaded_count"),
                    Rows.instant(rs, "started_at"),
                    Rows.instant(rs, "finished_at"),
                    rs.getString("failure")))
        .optional()
        .orElseThrow(() -> ApiException.notFound("No schedule batch with that reference."));
  }
}
