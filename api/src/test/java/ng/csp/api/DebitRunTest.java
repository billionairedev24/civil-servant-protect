package ng.csp.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import ng.csp.api.config.RlsScope;
import ng.csp.api.enrolment.EnrolmentService;
import ng.csp.api.enrolment.LeaverService;
import ng.csp.api.sponsor.ReportService;
import ng.csp.api.sponsor.SponsorService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

/**
 * The direct-debit run, as the console reads it.
 *
 * <p>Every number on that screen is counted from rows that exist rather than reported by the rail. A
 * screen fed by NIBSS's own summary would agree with NIBSS and disagree with the ledger — and the
 * ledger is what pays a claim, so a disagreement discovered at that point is a disagreement
 * discovered too late.
 */
@SpringBootTest
@ActiveProfiles("test")
class DebitRunTest {

  @Autowired SponsorService sponsors;
  @Autowired ReportService reports;
  @Autowired EnrolmentService enrolment;
  @Autowired LeaverService leavers;
  @Autowired JdbcClient db;

  private UUID sponsorId;
  private UUID cycleId;
  private final LocalDate period = LocalDate.now().withDayOfMonth(1);

  @BeforeEach
  void seed() {
    RlsScope.set(RlsScope.system());
    for (var table :
        List.of("integration_calls", "reconciliation_exceptions", "beneficiary_events",
            "beneficiaries", "contributions", "collection_cycles", "users", "members", "sponsors")) {
      db.sql("TRUNCATE TABLE " + table + " CASCADE").update();
    }

    sponsorId =
        db.sql(
                """
                INSERT INTO sponsors
                  (type, name, short_name, tag, method, rail_code, rail_label, collection_day)
                VALUES ('self', 'Self-paying members', 'SELF', 'SELF', 'direct_debit',
                        'CSP-SP-01', 'NIBSS e-mandate', 28)
                RETURNING id
                """)
            .query(UUID.class)
            .single();

    cycleId =
        db.sql(
                """
                INSERT INTO collection_cycles (sponsor_id, period, state, scheduled_count)
                VALUES (:s, :p, 'sent', 3) RETURNING id
                """)
            .param("s", sponsorId)
            .param("p", period)
            .query(UUID.class)
            .single();
  }

  @AfterEach
  void clearScope() {
    RlsScope.clear();
  }

  @Test
  @DisplayName("what settled and what did not is counted from the ledger, not from the rail")
  void countsComeFromContributions() {
    var paid = member("22233344455", "+2348031111111", "5510001");
    var empty = member("22233344466", "+2348031111112", "5510002");
    var waiting = member("22233344477", "+2348031111113", "5510003");

    contribution(paid, "confirmed");
    contribution(empty, "failed");
    contribution(waiting, "expected");

    var run = sponsors.debitRun(sponsorId);

    assertThat(run.counts().presented()).isEqualTo(3);
    assertThat(run.counts().settled()).isEqualTo(1);
    assertThat(run.counts().failed()).isEqualTo(1);
    assertThat(run.counts().awaiting()).isEqualTo(1);
    assertThat(run.period()).isEqualTo(period);
  }

  @Test
  @DisplayName("a failure nobody can retry into working says so")
  void someFailuresNeedTheMember() {
    var one = member("22233344455", "+2348031111111", "5510001");
    var two = member("22233344466", "+2348031111112", "5510002");

    exception(one, "no_funds");
    exception(two, "mandate_revoked");

    var run = sponsors.debitRun(sponsorId);
    var byKind =
        run.failures().stream()
            .collect(java.util.stream.Collectors.toMap(f -> f.kind(), f -> f.memberMustAct()));

    /*
     * An empty account on the 28th is often a full one on the 4th, so that one
     * is retried. A revoked mandate is not: the bank has been told to stop, and
     * only the member can tell it otherwise. A screen offering "retry" for that
     * teaches an officer to press a button for a fortnight.
     */
    assertThat(byKind).containsEntry("no_funds", false).containsEntry("mandate_revoked", true);
  }

  @Test
  @DisplayName("an exception from the other rail is not a debit failure")
  void payrollKindsAreNotShownHere() {
    var member = member("22233344455", "+2348031111111", "5510001");
    exception(member, "no_deduction");

    assertThat(sponsors.debitRun(sponsorId).failures()).isEmpty();
  }

  @Test
  @DisplayName("leavers whose cover is on grace and who have not paid are the list to work")
  void graceRowsAreTheChaseList() {
    var chased = member("22233344455", "+2348031111111", "5510001");
    var alreadyPaying = member("22233344466", "+2348031111112", "5510002");

    leavers.leave(sponsorId, chased, "retired", LocalDate.now().minusDays(10));
    leavers.leave(sponsorId, alreadyPaying, "transferred", LocalDate.now().minusDays(10));
    contribution(alreadyPaying, "confirmed");

    var grace = sponsors.debitRun(sponsorId).grace();

    /*
     * One name, not two. A leaver who has already set up a mandate is not a
     * problem, and a list that keeps showing them is a list an officer learns
     * to skim — which is how the one person who has not paid gets missed.
     */
    assertThat(grace).hasSize(1);
    assertThat(grace.getFirst().cspId()).isNotNull();
    assertThat(grace.getFirst().daysLeft()).isEqualTo(50);
  }

  @Test
  @DisplayName("the timeline is this sponsor's collection day, in the month being collected")
  void theTimelineFollowsTheSponsor() {
    /*
     * The 28th, and the schema will not let it be later: February has 28 days,
     * so a sponsor collecting on the 30th would either miss February or spill
     * into March — and a collection landing in the next period is a month of
     * cover nobody can say was paid for.
     */
    var february = LocalDate.of(2026, 2, 1);
    db.sql("UPDATE collection_cycles SET period = :p WHERE id = :c")
        .param("p", february)
        .param("c", cycleId)
        .update();

    var timeline = sponsors.debitRun(sponsorId).timeline();

    assertThat(timeline.get("presented")).isEqualTo(LocalDate.of(2026, 2, 28));
    assertThat(timeline.get("retried")).isEqualTo(LocalDate.of(2026, 3, 7));
    assertThat(timeline.get("graceEnds")).isEqualTo(LocalDate.of(2026, 4, 29));
  }

  @Test
  @DisplayName("a sponsor that has never collected gets an answer, not a 404")
  void nothingCollectedYetIsAState() {
    db.sql("DELETE FROM collection_cycles WHERE id = :c").param("c", cycleId).update();

    var run = sponsors.debitRun(sponsorId);

    // A sponsor enrolled last week has members and has collected nothing. An
    // error here would read as a broken console on their first week.
    assertThat(run.counts().presented()).isZero();
    assertThat(run.failures()).isEmpty();
    assertThat(run.timeline()).containsKey("presented");
  }

  @Test
  @DisplayName("a remittance says what arrived, not what a bank statement claimed")
  void remittancesCountWhatWasCredited() {
    db.sql("UPDATE collection_cycles SET scheduled_minor = 750000, scheduled_count = 3 WHERE id = :c")
        .param("c", cycleId)
        .update();

    var paid = member("22233344455", "+2348031111111", "5510001");
    var alsoPaid = member("22233344466", "+2348031111112", "5510002");
    var didNot = member("22233344477", "+2348031111113", "5510003");
    contribution(paid, "confirmed");
    contribution(alsoPaid, "confirmed");
    contribution(didNot, "failed");
    exception(didNot, "no_funds");

    var remittance = sponsors.remittances(sponsorId, 12).getFirst();

    /*
     * Three were asked for, two arrived. The variance is what somebody has to
     * explain, and it is negative in the direction that costs a member their
     * cover — which is why it is a number on the screen rather than a
     * percentage that rounds to "fine".
     */
    assertThat(remittance.scheduledMinor()).isEqualTo(750_000L);
    assertThat(remittance.receivedMinor()).isEqualTo(500_000L);
    assertThat(remittance.varianceMinor()).isEqualTo(-250_000L);
    assertThat(remittance.creditedCount()).isEqualTo(2);
    assertThat(remittance.openExceptions()).isEqualTo(1);
  }

  @Test
  @DisplayName("the exports count the same rows the screens do")
  void reportsAgreeWithTheScreens() {
    db.sql("UPDATE collection_cycles SET scheduled_minor = 500000, scheduled_count = 2 WHERE id = :c")
        .param("c", cycleId)
        .update();
    var paid = member("22233344455", "+2348031111111", "5510001");
    var didNot = member("22233344466", "+2348031111112", "5510002");
    contribution(paid, "confirmed");
    contribution(didNot, "failed");

    var csv = reports.of(sponsorId, "remittances", period).csv();
    var run = sponsors.debitRun(sponsorId);

    // A number an officer reads on screen and a number they email to an auditor
    // are the same number, because both are counted from the same rows.
    assertThat(csv).contains("\"2500.00\"").contains("\"-2500.00\"");
    assertThat(run.counts().settled()).isEqualTo(1);
  }

  @Test
  @DisplayName("the claims export carries no amount and no cause")
  void theClaimsExportStaysThin() {
    var report = reports.of(sponsorId, "claims", period);

    /*
     * Read from the sponsor's projection, which has no amount, cause or
     * document on it at all. An export is the likeliest place for a column to
     * appear that nobody meant to disclose — it is written once and read by
     * whoever is sent the file.
     */
    assertThat(report.csv().lines().findFirst().orElseThrow())
        .isEqualTo("\"type\",\"state\",\"claims\",\"awaiting_this_employer\"");
    assertThat(report.filename()).startsWith("claims-summary-");
  }

  @Test
  @DisplayName("a report nobody defined is refused by name, not answered empty")
  void anUnknownReportIsRefused() {
    assertThatThrownBy(() -> reports.of(sponsorId, "everything", period))
        .hasMessageContaining("No such report");
  }

  private UUID member(String nin, String msisdn, String serviceNo) {
    return enrolment
        .enrol(nin, "Member " + serviceNo, LocalDate.of(1990, 4, 12), msisdn, sponsorId,
            serviceNo, "GL 09", "standard", List.of())
        .memberId();
  }

  private void contribution(UUID memberId, String status) {
    db.sql(
            """
            INSERT INTO contributions (member_id, cycle_id, period, amount_minor, source, status)
            VALUES (:m, :c, :p, 250000, 'direct_debit', CAST(:st AS contribution_status))
            """)
        .param("m", memberId)
        .param("c", cycleId)
        .param("p", period)
        .param("st", status)
        .update();
  }

  private void exception(UUID memberId, String kind) {
    db.sql(
            """
            INSERT INTO reconciliation_exceptions
              (cycle_id, member_id, kind, expected_minor, received_minor)
            VALUES (:c, :m, CAST(:k AS exception_kind), 250000, 0)
            """)
        .param("c", cycleId)
        .param("m", memberId)
        .param("k", kind)
        .update();
  }
}
