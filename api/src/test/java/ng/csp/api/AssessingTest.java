package ng.csp.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import ng.csp.api.auth.Role;
import ng.csp.api.auth.SessionUser;
import ng.csp.api.claim.ClaimService;
import ng.csp.api.config.RlsScope;
import ng.csp.api.enrolment.EnrolmentService;
import ng.csp.api.evidence.Evidence;
import ng.csp.api.evidence.LocalEvidence;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

/**
 * The assessor's side, under the assessor's own row-level scope.
 *
 * <p>That last clause is the point of this file. Claim rules — who may approve, who may pay, that
 * the payer is not the assessor — are covered by SeparationOfDutiesTest, which sets up as the system
 * scope because it is testing the rules rather than the visibility. So the queue endpoint was tested
 * and returned an empty list to every real assessor: it joins members for the name, and the members
 * policy had no assessor clause. A 200, an empty queue, nothing in any log.
 *
 * <p>Everything here therefore runs through {@link #asAssessor}, which is what a request from the
 * console actually carries.
 */
@SpringBootTest
@ActiveProfiles("test")
class AssessingTest {

  @Autowired ClaimService claims;
  @Autowired EnrolmentService enrolment;
  @Autowired Evidence evidence;
  @Autowired JdbcClient db;

  private SessionUser claimant;
  private SessionUser assessor;
  private SessionUser operations;
  private String ref;

  @BeforeEach
  void seed() {
    RlsScope.set(RlsScope.system());
    for (var table :
        List.of("integration_calls", "claim_documents", "claim_stages", "claims",
            "beneficiary_events", "beneficiaries", "contributions", "collection_cycles",
            "users", "members", "sponsors")) {
      db.sql("TRUNCATE TABLE " + table + " CASCADE").update();
    }

    var sponsorId =
        db.sql(
                """
                INSERT INTO sponsors
                  (type, name, short_name, tag, method, rail_code, rail_label, collection_day)
                VALUES ('federal', 'Fed. Min. of Works', 'IPPIS', 'FEDERAL', 'payroll',
                        'CSP-114', 'IPPIS deduction code CSP-114', 28)
                RETURNING id
                """)
            .query(UUID.class)
            .single();

    var enrolled =
        enrolment.enrol(
            "22233344477", "Ifeoma Nwachukwu", LocalDate.of(1972, 5, 9), "+2348031234511",
            sponsorId, "5512399", "GL 13", "standard", List.of());
    var memberUser =
        db.sql(
                """
                INSERT INTO users (oidc_subject, full_name, role, member_id)
                VALUES ('member-5512399', 'Ifeoma Nwachukwu', 'member', :m) RETURNING id
                """)
            .param("m", enrolled.memberId())
            .query(UUID.class)
            .single();
    claimant = new SessionUser(memberUser, Role.MEMBER, enrolled.memberId(), null, null);

    assessor =
        new SessionUser(
            userWithRole("kc-assessor", "Grace Okon", "assessor"), Role.ASSESSOR, null, null, null);
    operations =
        new SessionUser(
            userWithRole("kc-ops", "CSP Operations", "csp_admin"), Role.CSP_ADMIN, null, null, null);

    RlsScope.set(RlsScope.forMember(enrolled.memberId()));
    ref = claims.open(claimant, "death", "spouse", Map.of()).claimRef();
    for (var docKey : requiredDocs()) {
      var upload =
          claims.beginUpload(claimant, ref, docKey, docKey + ".pdf", "application/pdf", 9);
      ((LocalEvidence) evidence)
          .write(upload.key(), new ByteArrayInputStream("evidence".getBytes(StandardCharsets.UTF_8)));
      claims.attachDocument(claimant, ref, docKey);
    }
    RlsScope.set(RlsScope.system());
  }

  private UUID userWithRole(String subject, String name, String role) {
    return db.sql(
            """
            INSERT INTO users (oidc_subject, full_name, role)
            VALUES (:sub, :n, CAST(:r AS user_role)) RETURNING id
            """)
        .param("sub", subject)
        .param("n", name)
        .param("r", role)
        .query(UUID.class)
        .single();
  }

  private List<String> requiredDocs() {
    return db.sql(
            """
            SELECT doc_key FROM claim_documents
             WHERE claim_id = (SELECT id FROM claims WHERE claim_ref = :ref) ORDER BY doc_key
            """)
        .param("ref", ref)
        .query(String.class)
        .list();
  }

  @AfterEach
  void clearScope() {
    RlsScope.clear();
  }

  /** As a request from the console arrives: assessor role, assessor scope. */
  private <T> T asAssessor(Supplier<T> work) {
    RlsScope.set(RlsScope.forAssessor());
    try {
      return work.get();
    } finally {
      RlsScope.set(RlsScope.system());
    }
  }

  /** Operations crosses sponsors by design; the permission set is what limits them. */
  private <T> T asOperations(Supplier<T> work) {
    RlsScope.set(RlsScope.system());
    return work.get();
  }

  @Test
  @DisplayName("the queue an assessor actually sees is not empty")
  void theQueueIsVisibleToAnAssessor() {
    var queue = asAssessor(() -> claims.queue());

    /*
     * The assertion that matters is that this list has anything in it at all.
     * The queue reads claims joined to members, and an assessor could read the
     * first and not the second — so every claim in the scheme fell out of the
     * join and the console showed an empty queue while the claims sat there.
     */
    assertThat(queue).hasSize(2); // the death claim and its funeral advance
    var death = queue.stream().filter(q -> q.ref().equals(ref)).findFirst().orElseThrow();
    assertThat(death.memberName()).isEqualTo("Ifeoma Nwachukwu");
    assertThat(death.cspId()).startsWith("CSP-114-");
    assertThat(death.state()).isEqualTo("assessing");
  }

  @Test
  @DisplayName("an assessor reads any claim's detail and its evidence, under their own scope")
  void theDetailAndTheEvidenceAreReadable() {
    var detail = asAssessor(() -> claims.byRef(assessor, ref));
    assertThat(detail.state()).isEqualTo("assessing");
    assertThat(detail.documents()).isNotEmpty().allMatch(d -> d.state().equals("received"));

    var doc = asAssessor(() -> claims.document(assessor, ref, "death_certificate"));
    assertThat(doc.filename()).isEqualTo("death_certificate.pdf");
  }

  @Test
  @DisplayName("approve then pay, each under the scope the role really has")
  void approveThenPay() {
    var state = asAssessor(() -> claims.assess(assessor, ref, "approve", "Certificate checked", 500_000_00L));
    assertThat(state).isEqualTo("approved");

    var paid = asOperations(() -> claims.pay(operations, ref, "058", "0123456789"));
    assertThat(paid.state()).isEqualTo("paid");
    assertThat(paid.amountMinor()).isEqualTo(500_000_00L);
    // The bank's name for the account, not the one anybody typed — that is what
    // catches a transposed digit.
    assertThat(paid.accountName()).isNotBlank();

    // And it leaves the queue, which is what stops it being worked twice.
    assertThat(asAssessor(() -> claims.queue()).stream().map(ClaimService.QueueItem::ref))
        .doesNotContain(ref);
  }

  @Test
  @DisplayName("an approval without an amount is refused before it reaches the trail")
  void anApprovalNeedsAnAmount() {
    assertThatThrownBy(() -> asAssessor(() -> claims.assess(assessor, ref, "approve", "Looks fine", null)))
        .hasMessageContaining("needs the amount");

    assertThat(asAssessor(() -> claims.byRef(assessor, ref)).state()).isEqualTo("assessing");
  }

  @Test
  @DisplayName("an assessor sees members with claims, and nobody else")
  void theRosterIsNotTheAssessorsToRead() {
    // Somebody with no claim: enrolled, on the same rail, and none of an
    // assessor's business.
    var sponsorId =
        db.sql("SELECT id FROM sponsors LIMIT 1").query(UUID.class).single();
    enrolment.enrol(
        "22233344488", "Sunday Adeyemi", LocalDate.of(1980, 2, 2), "+2348031234512",
        sponsorId, "5512400", "GL 09", "standard", List.of());

    var visible =
        asAssessor(
            () ->
                db.sql("SELECT display_name FROM members ORDER BY display_name")
                    .query(String.class)
                    .list());

    assertThat(visible).containsExactly("Ifeoma Nwachukwu");
  }
}
