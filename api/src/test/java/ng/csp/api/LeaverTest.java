package ng.csp.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import ng.csp.api.config.RlsScope;
import ng.csp.api.enrolment.EnrolmentService;
import ng.csp.api.enrolment.LeaverService;
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
 * Coming off the schedule.
 *
 * <p>Every test here is about the same thing said a different way: <b>the deduction stops and the
 * cover does not.</b> That is the rule an implementation gets wrong by accident — a delete, a
 * disabled flag, a member excluded from a query — and each of those is a family told at a funeral
 * that there is no policy.
 */
@SpringBootTest
@ActiveProfiles("test")
class LeaverTest {

  @Autowired LeaverService leavers;
  @Autowired EnrolmentService enrolment;
  @Autowired SponsorService sponsors;
  @Autowired JdbcClient db;

  private UUID sponsorId;
  private UUID memberId;
  private String cspId;

  @BeforeEach
  void seed() {
    RlsScope.set(RlsScope.system());
    for (var table :
        List.of("integration_calls", "beneficiary_events", "beneficiaries", "contributions",
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

    var enrolled =
        enrolment.enrol(
            "22233344455", "Chinedu Obi Eze", LocalDate.of(1966, 3, 4), "+2348031234567",
            sponsorId, "5512340", "GL 14", "standard", List.of());
    memberId = enrolled.memberId();
    cspId = enrolled.cspId();
  }

  @AfterEach
  void clearScope() {
    RlsScope.clear();
  }

  @Test
  @DisplayName("leaving the payroll stops the deduction and leaves the cover in force")
  void coverSurvivesTheLastPayday() {
    var lastDay = LocalDate.now();
    var left = leavers.leave(sponsorId, memberId, "retired", lastDay);

    assertThat(left.cspId()).isEqualTo(cspId);
    // Sixty days, from the last payday rather than from the paperwork.
    assertThat(left.graceUntil()).isEqualTo(lastDay.plusDays(60));

    /*
     * The member row is still there, with everything on it. A retiree keeps
     * their CSP-ID, their start date and twenty years of contribution history —
     * deleting the row, or blanking the cover, would throw away the thing they
     * were paying for.
     */
    var row =
        db.sql(
                """
                SELECT csp_id, in_force_since, tier, leave_reason::text AS reason, grace_until
                  FROM members WHERE id = :id
                """)
            .param("id", memberId)
            .query(
                (rs, n) ->
                    new Object[] {
                      rs.getString("csp_id"),
                      rs.getObject("in_force_since", LocalDate.class),
                      rs.getString("tier"),
                      rs.getString("reason"),
                      rs.getObject("grace_until", LocalDate.class)
                    })
            .single();

    assertThat((String) row[0]).isEqualTo(cspId);
    assertThat((String) row[2]).isEqualTo("standard");
    assertThat((String) row[3]).isEqualTo("retired");
    assertThat((LocalDate) row[4]).isEqualTo(lastDay.plusDays(60));
  }

  @Test
  @DisplayName("a death is a claim, and this screen refuses to be the place it is recorded")
  void aDeathIsNotARemoval() {
    assertThatThrownBy(() -> leavers.leave(sponsorId, memberId, "deceased", LocalDate.now()))
        .hasMessageContaining("claim");

    var stillOnTheSchedule =
        db.sql("SELECT count(*)::int FROM members WHERE id = :id AND left_payroll_on IS NULL")
            .param("id", memberId)
            .query(Integer.class)
            .single();
    assertThat(stillOnTheSchedule).isEqualTo(1);
  }

  @Test
  @DisplayName("leaving twice is refused, because the second one would move the grace date")
  void leavingIsNotRepeatable() {
    var lastDay = LocalDate.now().minusDays(20);
    leavers.leave(sponsorId, memberId, "resigned", lastDay);

    assertThatThrownBy(() -> leavers.leave(sponsorId, memberId, "dismissed", LocalDate.now()))
        .hasMessageContaining("already came off the schedule");

    // And the first answer stands: a silent second write would end cover twenty
    // days earlier than the member was told it would.
    var grace =
        db.sql("SELECT grace_until FROM members WHERE id = :id")
            .param("id", memberId)
            .query(LocalDate.class)
            .single();
    assertThat(grace).isEqualTo(lastDay.plusDays(60));
  }

  @Test
  @DisplayName("a leaver is not counted as a failed collection")
  void aLeaverIsNotACollectionProblem() {
    var before = sponsors.roster(sponsorId, null, 50).counts();
    assertThat(before.notDeducted()).isEqualTo(1);

    leavers.leave(sponsorId, memberId, "retired", LocalDate.now());

    /*
     * Still on the roster — an officer has to be able to find them, and their
     * grace period is the thing to chase — but no longer in the number that
     * means "somebody did not pay this month". That number is a to-do list, and
     * a leaver is not on it.
     */
    var after = sponsors.roster(sponsorId, null, 50).counts();
    assertThat(after.all()).isEqualTo(1);
    assertThat(after.notDeducted()).isZero();

    var listed = sponsors.roster(sponsorId, null, 50).members().getFirst();
    assertThat(listed.leftOn()).isEqualTo(LocalDate.now());
    assertThat(listed.graceUntil()).isEqualTo(LocalDate.now().plusDays(60));
  }

  @Test
  @DisplayName("what happens next is said in the answer, not left to the officer")
  void theOutcomeIsSpelledOut() {
    var retired = leavers.leave(sponsorId, memberId, "retired", LocalDate.now());
    assertThat(retired.outcome()).contains("CSP-ID").contains(retired.graceUntil().toString());
  }

  @Test
  @DisplayName("somebody else's member cannot be removed from this employer's schedule")
  void oneEmployerCannotRemoveAnother_s() {
    var otherSponsor =
        db.sql(
                """
                INSERT INTO sponsors
                  (type, name, short_name, tag, method, rail_code, rail_label, collection_day)
                VALUES ('state', 'Lagos State Head of Service', 'LASG', 'STATE', 'payroll',
                        'CSP-LA-07', 'Lagos payroll code', 25)
                RETURNING id
                """)
            .query(UUID.class)
            .single();

    // The member exists. They are simply not this employer's to remove, and the
    // answer says so without confirming who they are.
    assertThatThrownBy(() -> leavers.leave(otherSponsor, memberId, "retired", LocalDate.now()))
        .hasMessageContaining("No such member");
  }

  @Test
  @DisplayName("a last day years away is a typo, not a plan")
  void aLastDayFarInTheFutureIsRefused() {
    assertThatThrownBy(
            () -> leavers.leave(sponsorId, memberId, "retired", LocalDate.now().plusYears(1)))
        .hasMessageContaining("Check the year");
  }

  @Test
  @DisplayName("the leavers list is who to chase, soonest grace last")
  void theListIsOrderedByGrace() {
    var second =
        enrolment.enrol(
            "22233344466", "Blessing Uche Umoh", LocalDate.of(1988, 7, 2), "+2348039990000",
            sponsorId, "5512341", "GL 09", "basic", List.of());

    leavers.leave(sponsorId, memberId, "retired", LocalDate.now().minusDays(30));
    leavers.leave(sponsorId, second.memberId(), "transferred", LocalDate.now());

    var list = leavers.leavers(sponsorId, 20);
    assertThat(list).hasSize(2);
    assertThat(list.getFirst().cspId()).isEqualTo(second.cspId());
    assertThat(list.getLast().cspId()).isEqualTo(cspId);
  }
}
