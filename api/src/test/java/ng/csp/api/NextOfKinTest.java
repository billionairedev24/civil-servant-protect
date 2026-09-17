package ng.csp.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import ng.csp.api.auth.AuthService;
import ng.csp.api.auth.Role;
import ng.csp.api.claim.ClaimService;
import ng.csp.api.config.RlsScope;
import ng.csp.api.enrolment.EnrolmentService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

/**
 * A relative claiming for somebody who has died.
 *
 * <p>The scheme exists to pay death benefits and, until this, the only account that could report a
 * death belonged to the person who had died. The role was there from the first migration with
 * CLAIM_CREATE on it and no door to reach it through.
 *
 * <p>Half these tests are about what a relative <b>cannot</b> see. Handing them the member scope
 * would have been one line and would have opened the contribution ledger, the cover, the dependants
 * and the other beneficiaries' shares — a widow finding out at a funeral what percentage her
 * husband left to someone else. Those assertions are the reason this file exists.
 */
@SpringBootTest
@ActiveProfiles("test")
class NextOfKinTest {

  @Autowired AuthService auth;
  @Autowired ClaimService claims;
  @Autowired EnrolmentService enrolment;
  @Autowired JdbcClient db;

  private UUID memberId;
  private String cspId;
  private static final String KIN_NUMBER = "+2348031234700";
  private static final String STRANGER_NUMBER = "+2348031234799";

  @BeforeEach
  void seed() {
    RlsScope.set(RlsScope.system());
    for (var table :
        List.of("integration_calls", "claim_documents", "claim_stages", "claims",
            "beneficiary_events", "beneficiaries", "dependants", "contributions",
            "collection_cycles", "users", "members", "sponsors")) {
      db.sql("TRUNCATE TABLE " + table + " CASCADE").update();
    }

    var sponsorId =
        db.sql(
                """
                INSERT INTO sponsors
                  (type, name, short_name, tag, method, rail_code, rail_label, collection_day)
                VALUES ('federal', 'Fed. Min. of Justice', 'IPPIS', 'FEDERAL', 'payroll',
                        'CSP-114', 'IPPIS deduction code CSP-114', 28)
                RETURNING id
                """)
            .query(UUID.class)
            .single();

    var enrolled =
        enrolment.enrol(
            "22233344801", "Emeka Obiora", LocalDate.of(1968, 7, 2), "+2348031234701",
            sponsorId, "5512500", "GL 14", "standard",
            List.of(
                new EnrolmentService.NewBeneficiary("Chioma Obiora", "spouse", KIN_NUMBER, 60),
                new EnrolmentService.NewBeneficiary("Uche Obiora", "son", null, 40)));
    memberId = enrolled.memberId();
    cspId = enrolled.cspId();

    // Something to be kept away from: a month of contributions and a dependant.
    db.sql(
            """
            INSERT INTO dependants
              (member_id, full_name, relation, date_of_birth, sum_assured_minor, premium_minor)
            VALUES (:m, 'Ada Obiora', 'daughter', DATE '2012-04-01', 5000000, 60000)
            """)
        .param("m", memberId)
        .update();
  }

  @AfterEach
  void clearScope() {
    RlsScope.clear();
  }

  /** As a request from the app arrives once the relative has signed in. */
  private <T> T asKin(Supplier<T> work) {
    RlsScope.set(RlsScope.forNextOfKin(memberId));
    try {
      return work.get();
    } finally {
      RlsScope.set(RlsScope.system());
    }
  }

  private ng.csp.api.auth.SessionUser signIn(String cspIdEntered, String msisdn) {
    var challenge = auth.startKinChallenge(cspIdEntered, msisdn);
    return auth.verifyKin(challenge.challengeId(), "000000");
  }

  @Test
  @DisplayName("a beneficiary signs in with the member's CSP-ID and their own number")
  void theNamedRelativeGetsIn() {
    var session = signIn(cspId, KIN_NUMBER);

    assertThat(session.role()).isEqualTo(Role.NEXT_OF_KIN);
    // The member id on a kin session is who died, not who is holding the phone.
    assertThat(session.memberId()).isEqualTo(memberId);
    assertThat(session.sponsorId()).isNull();
  }

  @Test
  @DisplayName("knowing the CSP-ID is not enough — the number has to be on the record")
  void aStrangerWithTheIdIsRefused() {
    /*
     * The whole security of this door. CSP-IDs run in sequence and are printed
     * on a card, so somebody who has one can guess their neighbours'. What they
     * cannot do is be named on the policy.
     */
    assertThatThrownBy(() -> signIn(cspId, STRANGER_NUMBER))
        .hasMessageContaining("could not sign you in");
  }

  @Test
  @DisplayName("being named on one policy does not open another")
  void theRightNumberOnTheWrongMemberIsRefused() {
    var otherSponsor = db.sql("SELECT id FROM sponsors LIMIT 1").query(UUID.class).single();
    var other =
        enrolment.enrol(
            "22233344803", "Bisi Adeleke", LocalDate.of(1975, 1, 9), "+2348031234702",
            otherSponsor, "5512501", "GL 10", "standard", List.of());

    assertThatThrownBy(() -> signIn(other.cspId(), KIN_NUMBER))
        .hasMessageContaining("could not sign you in");
  }

  @Test
  @DisplayName("a relative reports the death, and the trail says it was them")
  void theRelativeCanReportADeath() {
    var session = signIn(cspId, KIN_NUMBER);
    var opened = asKin(() -> claims.open(session, "death", "spouse", Map.of()));

    assertThat(opened.claimRef()).startsWith("CLM-");
    // The funeral advance opens beside it, which is the point of the whole path:
    // money for a burial happening this week.
    assertThat(opened.funeralAdvanceRef()).isNotNull();

    var detail = asKin(() -> claims.byRef(session, opened.claimRef()));
    assertThat(detail.state()).isEqualTo("documents_pending");
    assertThat(detail.stages())
        .anyMatch(stage -> "Reported by the next of kin".equals(stage.note()));
  }

  @Test
  @DisplayName("a relative cannot report an accident — that is the member's own claim")
  void onlyADeathClaim() {
    var session = signIn(cspId, KIN_NUMBER);

    assertThatThrownBy(() -> asKin(() -> claims.open(session, "accident", "spouse", Map.of())))
        .hasMessageContaining("next of kin can report a death");
  }

  @Test
  @DisplayName("a relative sees the claim and nothing else about the member")
  void theScopeStopsAtTheClaim() {
    var session = signIn(cspId, KIN_NUMBER);
    var opened = asKin(() -> claims.open(session, "death", "spouse", Map.of()));

    // What they may read: the claim, and the member's name to be sure it is the
    // right person.
    assertThat(asKin(() -> claims.byRef(session, opened.claimRef()))).isNotNull();
    assertThat(asKin(() -> db.sql("SELECT display_name FROM members").query(String.class).list()))
        .containsExactly("Emeka Obiora");

    /*
     * What they may not. Each of these is a real disclosure rather than a
     * hypothetical: the ledger is the member's salary history, the dependants
     * are their children's names and ages, and the beneficiary shares tell one
     * relative exactly what every other relative was left.
     */
    assertThat(asKin(() -> db.sql("SELECT full_name FROM beneficiaries").query(String.class).list()))
        .isEmpty();
    assertThat(asKin(() -> db.sql("SELECT full_name FROM dependants").query(String.class).list()))
        .isEmpty();
    assertThat(
            asKin(
                () ->
                    db.sql("SELECT count(*)::int FROM contributions").query(Integer.class).single()))
        .isZero();
  }

  @Test
  @DisplayName("the member's own screens are not a relative's to open")
  void theMemberEndpointsAreClosedToKin() {
    /*
     * The permission, not the scope.
     *
     * With MEMBER_READ on this role, /v1/members/me/summary answered 200 with
     * the member's cover, premium, grade and employer — the row-level scope had
     * opened the member's row so a relative could check the name, and a row
     * opened for one column is opened for all of them. Found by calling the
     * endpoint over HTTP; a test that exercises services never crosses the
     * @PreAuthorize that was letting it through.
     */
    assertThat(Role.NEXT_OF_KIN.can(ng.csp.api.auth.Permission.MEMBER_READ)).isFalse();
    assertThat(Role.MEMBER.can(ng.csp.api.auth.Permission.MEMBER_READ)).isTrue();
  }

  @Test
  @DisplayName("a relative is told who they are claiming for, and nothing else about them")
  void theSubjectIsJustAName() {
    var session = signIn(cspId, KIN_NUMBER);
    var subject = asKin(() -> claims.subject(session));

    assertThat(subject.name()).isEqualTo("Emeka Obiora");
    assertThat(subject.cspId()).isEqualTo(cspId);
    // Two fields. Adding a third is a decision somebody has to make on purpose.
    assertThat(ClaimService.Subject.class.getRecordComponents()).hasSize(2);
  }

  @Test
  @DisplayName("a relative who is themselves a member keeps both accounts")
  void aRelativeCanAlsoBeAMember() {
    /*
     * Two civil servants married to each other name each other, which is the
     * common case rather than the odd one. Their number already has a `users`
     * row, and `users.msisdn` is UNIQUE — so writing it a second time would
     * fail on the first claim of this kind.
     */
    var sponsorId = db.sql("SELECT id FROM sponsors LIMIT 1").query(UUID.class).single();
    var spouse =
        enrolment.enrol(
            "22233344804", "Chioma Obiora", LocalDate.of(1972, 3, 3), KIN_NUMBER,
            sponsorId, "5512502", "GL 12", "standard", List.of());
    // Enrolment already gave her a member account on this number — that is the
    // row this test is about colliding with.
    assertThat(
            db.sql("SELECT count(*)::int FROM users WHERE msisdn = :m").param("m", KIN_NUMBER)
                .query(Integer.class)
                .single())
        .isEqualTo(1);

    var session = signIn(cspId, KIN_NUMBER);
    assertThat(session.role()).isEqualTo(Role.NEXT_OF_KIN);
    assertThat(session.memberId()).isEqualTo(memberId);

    // And her own member account is untouched and still the only row her number
    // signs in as — the kin account is identified by its subject, not a number.
    var rows =
        db.sql("SELECT count(*)::int FROM users WHERE msisdn = :m").param("m", KIN_NUMBER)
            .query(Integer.class)
            .single();
    assertThat(rows).isEqualTo(1);
    assertThat(spouse.memberId()).isNotEqualTo(memberId);
  }

  @Test
  @DisplayName("signing in twice reuses the one account rather than making another")
  void theKinAccountIsNotCreatedTwice() {
    signIn(cspId, KIN_NUMBER);
    signIn(cspId, KIN_NUMBER);

    var accounts =
        db.sql("SELECT count(*)::int FROM users WHERE role = 'next_of_kin'")
            .query(Integer.class)
            .single();
    assertThat(accounts).isEqualTo(1);
  }
}
