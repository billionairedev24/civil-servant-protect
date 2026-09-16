package ng.csp.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import ng.csp.api.auth.Role;
import ng.csp.api.auth.SessionUser;
import ng.csp.api.config.RlsScope;
import ng.csp.api.sponsor.SponsorService;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

/**
 * Loading a payroll schedule, across chunk boundaries.
 *
 * <p>The chunk size is two here — see application-test.yml — because every bug this job has had was
 * at a boundary and none of them is visible on a file that fits in one chunk. A test that had to
 * write ten thousand rows to reach the second chunk is a test nobody would run.
 */
@SpringBootTest
@ActiveProfiles("test")
class ScheduleLoadTest {

  @Autowired SponsorService sponsors;
  @Autowired JdbcClient db;

  private UUID sponsorId;
  private SessionUser preparer;

  @BeforeEach
  void seed() {
    RlsScope.set(RlsScope.system());
    for (var table :
        List.of("schedule_rows", "schedule_batches", "audit_log", "contributions",
            "collection_cycles", "users", "members", "sponsors")) {
      db.sql("TRUNCATE TABLE " + table + " CASCADE").update();
    }

    sponsorId =
        db.sql(
                """
                INSERT INTO sponsors
                  (type, name, short_name, tag, method, rail_code, rail_label, collection_day)
                VALUES ('federal', 'Fed. Min. of Education', 'IPPIS', 'FEDERAL', 'payroll',
                        'CSP-114', 'IPPIS deduction code CSP-114', 28)
                RETURNING id
                """)
            .query(UUID.class)
            .single();

    // Nine members, service numbers 0001..0009. The schedule below asks for
    // twelve, so three of them match nothing.
    for (int i = 1; i <= 9; i++) {
      db.sql(
              """
              INSERT INTO members
                (csp_id, sponsor_id, service_no, full_name, display_name, date_of_birth, msisdn,
                 tier, in_force_since)
              VALUES (:csp, :s, :sn, :n, :n, DATE '1985-01-01', :m, 'standard', DATE '2025-08-01')
              """)
          .param("csp", "CSP-114-%05d".formatted(i))
          .param("s", sponsorId)
          .param("sn", "%04d".formatted(i))
          .param("n", "Member " + i)
          .param("m", "+23480300000%02d".formatted(i))
          .update();
    }

    var userId =
        db.sql(
                """
                INSERT INTO users (oidc_subject, full_name, role, sponsor_id)
                VALUES ('kc-preparer', 'Amina Bello', 'sponsor_preparer', :s) RETURNING id
                """)
            .param("s", sponsorId)
            .query(UUID.class)
            .single();
    preparer = new SessionUser(userId, Role.SPONSOR_PREPARER, null, sponsorId, null);
  }

  @AfterEach
  void clearScope() {
    RlsScope.clear();
  }

  @Test
  @DisplayName("every row is decided once, however the chunks fall")
  void everyRowIsDecidedOnce() {
    /*
     * Twelve rows over a chunk size of two: six windows, and the matching and
     * unmatched rows deliberately interleaved.
     *
     * The bug this pins did the match on one window and the rejection on the
     * *next* one, so rows were rejected that nothing had tried to match. It
     * reported success while writing off perfectly good members — on a real
     * 50,000-row file it matched 20,000 of 40,000 and rejected the rest.
     */
    var rows =
        List.of(
            row("0001"), row("9991"), row("0002"), row("9992"), row("0003"), row("9993"),
            row("0004"), row("0005"), row("0006"), row("0007"), row("0008"), row("0009"));

    var result =
        sponsors.uploadSchedule(
            preparer, sponsorId, LocalDate.of(2026, 10, 1), "test.csv", rows);

    awaitComplete(result.batchId());

    assertThat(countRows(result.batchId(), "matched")).isZero();
    assertThat(countRows(result.batchId(), "loaded")).isEqualTo(9);
    assertThat(countRows(result.batchId(), "rejected")).isEqualTo(3);
    // Nothing is left half-decided.
    assertThat(countRows(result.batchId(), "staged")).isZero();

    // And nine members owe money for October.
    var contributions =
        db.sql("SELECT count(*)::int FROM contributions WHERE period = DATE '2026-10-01'")
            .query(Integer.class)
            .single();
    assertThat(contributions).isEqualTo(9);
  }

  @Test
  @DisplayName("the cycle's totals come from what loaded, not from what the file claimed")
  void cycleTotalsFollowTheRows() {
    var result =
        sponsors.uploadSchedule(
            preparer,
            sponsorId,
            LocalDate.of(2026, 10, 1),
            "test.csv",
            List.of(row("0001"), row("0002"), row("9999")));

    awaitComplete(result.batchId());

    var cycle =
        db.sql(
                """
                SELECT scheduled_count, scheduled_minor FROM collection_cycles
                 WHERE sponsor_id = :s AND period = DATE '2026-10-01'
                """)
            .param("s", sponsorId)
            .query((rs, n) -> new long[] {rs.getInt(1), rs.getLong(2)})
            .single();

    // Three rows were sent; two became money. The cycle says two.
    assertThat(cycle[0]).isEqualTo(2);
    assertThat(cycle[1]).isEqualTo(500_000);
  }

  @Test
  @DisplayName("a rejected row says which line and why, so an officer can fix the file")
  void rejectionsNameTheLine() {
    var result =
        sponsors.uploadSchedule(
            preparer,
            sponsorId,
            LocalDate.of(2026, 10, 1),
            "test.csv",
            List.of(row("0001"), row("8812441"), row("0002")));

    awaitComplete(result.batchId());

    var rejected =
        db.sql(
                """
                SELECT line_no, reason FROM schedule_rows
                 WHERE batch_id = :b AND state = 'rejected'
                """)
            .param("b", result.batchId())
            .query((rs, n) -> rs.getInt("line_no") + ": " + rs.getString("reason"))
            .single();

    assertThat(rejected).isEqualTo("2: No member with service number 8812441");
  }

  private SponsorService.ScheduleRow row(String serviceNo) {
    return new SponsorService.ScheduleRow(serviceNo, "Member " + serviceNo, 250_000);
  }

  /**
   * The load runs on its own thread, after the upload's transaction commits.
   *
   * <p>Polled in this thread rather than Awaitility's. The row-level scope is a ThreadLocal applied
   * when a connection is checked out, so a poll on a borrowed thread queries as nobody and sees an
   * empty table forever — the same trap the job itself fell into, which is worth saying twice.
   */
  private void awaitComplete(UUID batchId) {
    Awaitility.await()
        .atMost(30, TimeUnit.SECONDS)
        .pollInterval(100, TimeUnit.MILLISECONDS)
        .pollInSameThread()
        .until(
            () ->
                "complete"
                    .equals(
                        db.sql("SELECT state FROM schedule_batches WHERE id = :id")
                            .param("id", batchId)
                            .query(String.class)
                            .single()));
  }

  private int countRows(UUID batchId, String state) {
    return db.sql(
            "SELECT count(*)::int FROM schedule_rows WHERE batch_id = :b AND state = CAST(:s AS schedule_row_state)")
        .param("b", batchId)
        .param("s", state)
        .query(Integer.class)
        .single();
  }
}
