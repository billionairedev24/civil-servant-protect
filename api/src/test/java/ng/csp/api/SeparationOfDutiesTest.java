package ng.csp.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import ng.csp.api.auth.Permission;
import ng.csp.api.auth.Role;
import ng.csp.api.auth.SessionUser;
import ng.csp.api.config.RlsScope;
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
 * The rules that make the console defensible, against a real Postgres.
 *
 * <p>Driven through the services rather than over HTTP, because that is where the rules live: the
 * maker–checker aspect wraps the service call, and everything else is enforced by the database. The
 * HTTP layer only decides which of these to call.
 *
 * <p>Every assertion here is a rule someone could reasonably argue away in review — "just let the
 * preparer approve it, they know what they're doing" — so each one is pinned by a test that says
 * what goes wrong when it is removed.
 */
@SpringBootTest
@ActiveProfiles("test")
class SeparationOfDutiesTest {

  @Autowired SponsorService sponsors;
  @Autowired JdbcClient db;

  private UUID sponsorId;
  private UUID otherSponsorId;
  private UUID memberId;
  private UUID cycleId;
  private UUID exceptionId;
  private SessionUser preparer;
  private SessionUser approver;
  private SessionUser viewer;

  @BeforeEach
  void seed() {
    RlsScope.set(RlsScope.system());
    for (var table :
        List.of("audit_log", "reconciliation_exceptions", "schedule_batches", "claim_documents",
            "claim_stages", "claims", "beneficiary_events", "beneficiaries", "dependants",
            "contributions", "collection_cycles", "devices", "users", "members", "sponsors")) {
      db.sql("TRUNCATE TABLE " + table + " CASCADE").update();
    }

    sponsorId = sponsor("federal", "Fed. Min. of Education", "CSP-114");
    otherSponsorId = sponsor("state", "Lagos State Head of Service", "CSP-LA-07");

    memberId =
        db.sql(
                """
                INSERT INTO members
                  (csp_id, sponsor_id, service_no, full_name, display_name, date_of_birth,
                   msisdn, tier, in_force_since)
                VALUES ('CSP-114-88214', :s, '4471208', 'Adaeze Nkiru Okafor', 'Adaeze Okafor',
                        DATE '1987-11-04', '+2348030000214', 'standard', DATE '2025-08-01')
                RETURNING id
                """)
            .param("s", sponsorId)
            .query(UUID.class)
            .single();

    preparer = new SessionUser(user("Amina Bello", "sponsor_preparer"), Role.SPONSOR_PREPARER, null, sponsorId, null);
    approver = new SessionUser(user("Musa Danjuma", "sponsor_approver"), Role.SPONSOR_APPROVER, null, sponsorId, null);
    viewer = new SessionUser(user("Ngozi Eze", "sponsor_viewer"), Role.SPONSOR_VIEWER, null, sponsorId, null);

    var period = LocalDate.now().withDayOfMonth(1);
    db.sql("SELECT csp.ensure_contribution_partition(:p)").param("p", period).query(String.class).single();
    cycleId =
        db.sql(
                """
                INSERT INTO collection_cycles (sponsor_id, period, state, rail_ref)
                VALUES (:s, :p, 'reconciling', 'CSP-114/09') RETURNING id
                """)
            .param("s", sponsorId).param("p", period)
            .query(UUID.class)
            .single();

    exceptionId =
        db.sql(
                """
                INSERT INTO reconciliation_exceptions
                  (cycle_id, member_id, kind, expected_minor, received_minor)
                VALUES (:c, :m, 'no_deduction', 250000, 0) RETURNING id
                """)
            .param("c", cycleId).param("m", memberId)
            .query(UUID.class)
            .single();
  }

  @AfterEach
  void clearScope() {
    RlsScope.clear();
  }

  // ── Maker–checker ──────────────────────────────────────────────────────────

  @Test
  @DisplayName("a preparer proposes and cannot commit — that is the whole control")
  void preparerCannotCommit() {
    sponsors.propose(preparer, exceptionId, "waive", "member left service in July, payroll confirmed");

    assertThat(proposedAction()).isEqualTo("waive");
    assertThat(resolvedAction()).isNull();

    assertThatThrownBy(() -> sponsors.resolve(preparer, exceptionId, "approving my own work", null))
        .hasMessageContaining("cannot commit");
  }

  @Test
  @DisplayName("an approver cannot commit an exception nobody has worked")
  void approverCannotActAlone() {
    assertThatThrownBy(() -> sponsors.resolve(approver, exceptionId, "clearing this myself", null))
        .hasMessageContaining("Nobody has proposed");
  }

  @Test
  @DisplayName("the same person cannot be both halves, even holding both permissions")
  void makerCannotBeChecker() {
    // An approver may legitimately also prepare. What they may not do is
    // approve the thing they themselves proposed.
    sponsors.propose(approver, exceptionId, "waive", "I worked this one myself");

    assertThatThrownBy(() -> sponsors.resolve(approver, exceptionId, "and approving it too", null))
        .hasMessageContaining("You proposed this");
  }

  @Test
  @DisplayName("a viewer holds no writing permission at all")
  void viewerIsReadOnly() {
    assertThat(viewer.role().can(Permission.SPONSOR_READ)).isTrue();
    assertThat(viewer.role().can(Permission.EXCEPTION_PROPOSE)).isFalse();
    assertThat(viewer.role().can(Permission.EXCEPTION_RESOLVE)).isFalse();
    assertThat(viewer.role().can(Permission.CYCLE_CLOSE)).isFalse();
  }

  @Test
  @DisplayName("an admin hands out authority but cannot approve money with it")
  void adminIsNotASuperset() {
    var admin = Role.SPONSOR_ADMIN;
    assertThat(admin.can(Permission.ROLES_MANAGE)).isTrue();
    assertThat(admin.can(Permission.MEMBERS_MANAGE)).isTrue();
    // Otherwise one account is both halves of the two-person rule.
    assertThat(admin.can(Permission.EXCEPTION_RESOLVE)).isFalse();
    assertThat(admin.can(Permission.CYCLE_CLOSE)).isFalse();
  }

  @Test
  @DisplayName("preparer proposes, approver commits, cycle closes")
  void theHappyPathTakesTwoPeople() {
    sponsors.propose(preparer, exceptionId, "match", "service number was one digit out");
    var outcome = sponsors.resolve(approver, exceptionId, "checked against the July file, agreed", null);

    assertThat(outcome.memberState()).isEqualTo("in_force");
    assertThat(resolvedAction()).isEqualTo("match");

    var closed = sponsors.closeCycle(approver, cycleId, sponsorId);
    assertThat(closed.closed()).isTrue();
  }

  @Test
  @DisplayName("a cycle cannot close while an exception is undecided")
  void openExceptionsBlockTheCycle() {
    assertThatThrownBy(() -> sponsors.closeCycle(approver, cycleId, sponsorId))
        .hasMessageContaining("need a decision");
  }

  // ── Scope ──────────────────────────────────────────────────────────────────

  @Test
  @DisplayName("the URL check and the row policies are two independent defences")
  void sponsorScopeIsEnforcedTwice() {
    // First defence: the request is refused for naming someone else's sponsor.
    assertThatThrownBy(() -> preparer.assertSponsorScope(otherSponsorId))
        .hasMessageContaining("not yours");

    // Second: even with that check gone, the rows are not there to be read.
    // The service does not throw here — it simply finds nothing, which is the
    // failure mode to want.
    RlsScope.set(RlsScope.forSponsor(sponsorId));
    assertThat(sponsors.roster(otherSponsorId, null, 50)).isEmpty();
    assertThat(sponsors.roster(sponsorId, null, 50)).hasSize(1);
  }

  @Test
  @DisplayName("row-level security hides another sponsor's members even from a raw query")
  void rowLevelSecurityHidesOtherRails() {
    RlsScope.set(RlsScope.forSponsor(otherSponsorId));
    assertThat(countMembers()).isZero();

    RlsScope.set(RlsScope.forSponsor(sponsorId));
    assertThat(countMembers()).isOne();
  }

  @Test
  @DisplayName("a sponsor cannot see who a member leaves their money to")
  void beneficiariesAreNotTheEmployersBusiness() {
    RlsScope.set(RlsScope.system());
    db.sql(
            """
            INSERT INTO beneficiaries (member_id, full_name, relation, share_pct, position)
            VALUES (:m, 'Chinedu Okafor', 'Spouse', 60, 0),
                   (:m, 'Ngozi Okafor', 'Daughter', 40, 1)
            """)
        .param("m", memberId)
        .update();

    RlsScope.set(RlsScope.forSponsor(sponsorId));
    assertThat(countBeneficiaries()).isZero();

    RlsScope.set(RlsScope.forMember(memberId));
    assertThat(countBeneficiaries()).isEqualTo(2);
  }

  // ── The ledger and the trail ───────────────────────────────────────────────

  @Test
  @DisplayName("the ledger refuses to be rewritten")
  void ledgerIsAppendOnly() {
    RlsScope.set(RlsScope.system());
    db.sql(
            """
            INSERT INTO contributions (member_id, period, amount_minor, source, status)
            VALUES (:m, :p, 250000, 'payroll', 'confirmed')
            """)
        .param("m", memberId).param("p", LocalDate.now().withDayOfMonth(1))
        .update();

    assertThatThrownBy(() -> db.sql("UPDATE contributions SET amount_minor = 1").update())
        .hasMessageContaining("append-only");
    assertThatThrownBy(() -> db.sql("DELETE FROM contributions").update())
        .hasMessageContaining("append-only");
  }

  @Test
  @DisplayName("a contribution lands in its month's partition")
  void contributionsArePartitionedByMonth() {
    RlsScope.set(RlsScope.system());
    var period = LocalDate.now().withDayOfMonth(1);
    db.sql(
            """
            INSERT INTO contributions (member_id, period, amount_minor, source, status)
            VALUES (:m, :p, 250000, 'payroll', 'confirmed')
            """)
        .param("m", memberId).param("p", period)
        .update();

    var partition =
        db.sql("SELECT tableoid::regclass::text FROM contributions LIMIT 1")
            .query(String.class)
            .single();
    assertThat(partition).isEqualTo("contributions_%d_%02d".formatted(period.getYear(), period.getMonthValue()));
  }

  @Test
  @DisplayName("the audit trail notices a row removed behind its back")
  void auditChainDetectsTampering() {
    RlsScope.set(RlsScope.system());
    for (var action : List.of("cycle.opened", "exception.waive", "cycle.closed")) {
      db.sql(
              """
              INSERT INTO audit_log (actor_user_id, actor_role, sponsor_id, action, detail)
              VALUES (:u, 'sponsor_approver', :s, :a, '{}'::jsonb)
              """)
          .param("u", approver.userId()).param("s", sponsorId).param("a", action)
          .update();
    }
    assertThat(brokenAt()).isNull();

    // As someone with enough rights would actually do it: disable the guard first.
    db.sql("ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only").update();
    db.sql("DELETE FROM audit_log WHERE action = 'exception.waive'").update();
    db.sql("ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only").update();

    assertThat(brokenAt()).isNotNull();
  }

  @Test
  @DisplayName("a split that does not reach 100% is refused when the transaction settles")
  void sharesMustReachOneHundred() {
    RlsScope.set(RlsScope.system());
    assertThatThrownBy(
            () ->
                db.sql(
                        """
                        INSERT INTO beneficiaries (member_id, full_name, relation, share_pct, position)
                        VALUES (:m, 'Chinedu Okafor', 'Spouse', 60, 0),
                               (:m, 'Ngozi Okafor', 'Daughter', 30, 1)
                        """)
                    .param("m", memberId)
                    .update())
        .hasMessageContaining("not 100%");
  }

  @Test
  @DisplayName("a named beneficiary holding nothing is allowed — that is why confirmation exists")
  void aBeneficiaryMayHoldNoShare() {
    RlsScope.set(RlsScope.system());
    assertThatCode(
            () ->
                db.sql(
                        """
                        INSERT INTO beneficiaries (member_id, full_name, relation, share_pct, position)
                        VALUES (:m, 'Chinedu Okafor', 'Spouse', 60, 0),
                               (:m, 'Ngozi Okafor', 'Daughter', 40, 1),
                               (:m, 'Emeka Okafor', 'Son', 0, 2)
                        """)
                    .param("m", memberId)
                    .update())
        .doesNotThrowAnyException();
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private UUID sponsor(String type, String name, String code) {
    return db.sql(
            """
            INSERT INTO sponsors (type, name, short_name, tag, method, rail_code, rail_label, collection_day)
            VALUES (CAST(:t AS sponsor_type), :n, :n, 'TAG', 'payroll', :c, :c, 28)
            RETURNING id
            """)
        .param("t", type).param("n", name).param("c", code)
        .query(UUID.class)
        .single();
  }

  private UUID user(String name, String role) {
    return db.sql(
            """
            INSERT INTO users (oidc_subject, full_name, role, sponsor_id)
            VALUES (:sub, :n, CAST(:r AS user_role), :s) RETURNING id
            """)
        .param("sub", "kc-" + name.replace(' ', '-'))
        .param("n", name).param("r", role).param("s", sponsorId)
        .query(UUID.class)
        .single();
  }

  private String proposedAction() {
    return db.sql("SELECT proposed_action::text FROM reconciliation_exceptions WHERE id = :id")
        .param("id", exceptionId).query(String.class).single();
  }

  private String resolvedAction() {
    return db.sql("SELECT resolved_action::text FROM reconciliation_exceptions WHERE id = :id")
        .param("id", exceptionId).query(String.class).optional().orElse(null);
  }

  private int countMembers() {
    return db.sql("SELECT count(*)::int FROM members").query(Integer.class).single();
  }

  private int countBeneficiaries() {
    return db.sql("SELECT count(*)::int FROM beneficiaries").query(Integer.class).single();
  }

  private Long brokenAt() {
    return db.sql("SELECT broken_at FROM csp.verify_audit_chain()")
        .query(Long.class).optional().orElse(null);
  }
}
