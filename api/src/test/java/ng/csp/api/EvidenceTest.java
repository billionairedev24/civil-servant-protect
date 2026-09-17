package ng.csp.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
 * A claim's evidence.
 *
 * <p>The thing being guarded here is narrow and it is the whole point: <b>a claim does not move to
 * assessing until the bytes are actually in the store.</b> Before this, the API wrote down a
 * filename and a storage key the caller made up, kept no file anywhere, and moved the claim along —
 * so an assessor opened a death claim whose certificate did not exist, and the first person to find
 * out was a bereaved family being asked for the document again.
 */
@SpringBootTest
@ActiveProfiles("test")
class EvidenceTest {

  @Autowired ClaimService claims;
  @Autowired EnrolmentService enrolment;
  @Autowired Evidence evidence;
  @Autowired JdbcClient db;

  private SessionUser claimant;
  private SessionUser otherMember;
  private SessionUser assessor;
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
                VALUES ('federal', 'Fed. Min. of Health', 'IPPIS', 'FEDERAL', 'payroll',
                        'CSP-114', 'IPPIS deduction code CSP-114', 28)
                RETURNING id
                """)
            .query(UUID.class)
            .single();

    claimant = member(sponsorId, "22233344455", "Adaeze Nwosu", "+2348031234501", "5512341");
    otherMember = member(sponsorId, "22233344466", "Bello Sanusi", "+2348031234502", "5512342");
    assessor =
        new SessionUser(
            db.sql(
                    """
                    INSERT INTO users (oidc_subject, full_name, role)
                    VALUES ('kc-assessor', 'Grace Okon', 'assessor') RETURNING id
                    """)
                .query(UUID.class)
                .single(),
            Role.ASSESSOR, null, null, null);

    /*
     * Opened under the claimant's own row-level scope, not the system one.
     *
     * That distinction is the whole reason this line is written this way. Every
     * other claim test sets up under the system scope, and a member opening a
     * claim through the API failed outright — the sponsor's projection was
     * refused by a policy keyed on a sponsor the member session does not have
     * (see V11). A test that runs as root proves nothing about what a member
     * can do.
     */
    RlsScope.set(RlsScope.forMember(claimant.memberId()));
    ref = claims.open(claimant, "death", "spouse", Map.of()).claimRef();
    RlsScope.set(RlsScope.system());
  }

  /** Runs work as the member really is: member-scoped, like a request from the app. */
  private <T> T asClaimant(java.util.function.Supplier<T> work) {
    RlsScope.set(RlsScope.forMember(claimant.memberId()));
    try {
      return work.get();
    } finally {
      RlsScope.set(RlsScope.system());
    }
  }

  private SessionUser member(UUID sponsorId, String nin, String name, String msisdn, String serviceNo) {
    var enrolled =
        enrolment.enrol(
            nin, name, LocalDate.of(1970, 1, 1), msisdn, sponsorId, serviceNo, "GL 12",
            "standard", List.of());
    var userId =
        db.sql(
                """
                INSERT INTO users (oidc_subject, full_name, role, member_id)
                VALUES (:sub, :n, 'member', :m) RETURNING id
                """)
            .param("sub", "member-" + serviceNo)
            .param("n", name)
            .param("m", enrolled.memberId())
            .query(UUID.class)
            .single();
    return new SessionUser(userId, Role.MEMBER, enrolled.memberId(), null, null);
  }

  @AfterEach
  void clearScope() {
    RlsScope.clear();
  }

  private String firstRequiredDoc() {
    return db.sql(
            """
            SELECT doc_key FROM claim_documents
             WHERE claim_id = (SELECT id FROM claims WHERE claim_ref = :ref)
             ORDER BY doc_key LIMIT 1
            """)
        .param("ref", ref)
        .query(String.class)
        .single();
  }

  private String stateOf(String docKey) {
    return db.sql(
            """
            SELECT state FROM claim_documents
             WHERE doc_key = :k AND claim_id = (SELECT id FROM claims WHERE claim_ref = :ref)
            """)
        .param("k", docKey)
        .param("ref", ref)
        .query(String.class)
        .single();
  }

  private void uploadTo(Evidence.Upload upload, String content) {
    // Standing in for the browser's PUT. In local mode that request lands in
    // LocalEvidenceController, which calls exactly this.
    ((LocalEvidence) evidence)
        .write(upload.key(), new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8)));
  }

  @Test
  @DisplayName("saying a document was uploaded does not make it uploaded")
  void confirmingWithoutTheBytesIsRefused() {
    var docKey = firstRequiredDoc();
    claims.beginUpload(claimant, ref, docKey, "certificate.pdf", "application/pdf", 4096);

    // The client asked for a URL and never used it — a dropped connection, a
    // cancelled upload, a URL that expired mid-transfer. Every one of those
    // ends here, and none of them may move the claim on.
    assertThatThrownBy(() -> claims.attachDocument(claimant, ref, docKey))
        .hasMessageContaining("did not arrive");

    assertThat(stateOf(docKey)).isEqualTo("required");
    assertThat(claimState()).isEqualTo("documents_pending");
  }

  @Test
  @DisplayName("confirming before asking for a URL is refused, and says which mistake it was")
  void confirmingBeforeBeginningIsRefused() {
    // Distinct from "that is not a document this claim asks for": the client is
    // out of step rather than wrong about the claim, and a message that
    // conflated the two would send somebody looking at the wrong thing.
    assertThatThrownBy(() -> claims.attachDocument(claimant, ref, firstRequiredDoc()))
        .hasMessageContaining("upload URL");
  }

  @Test
  @DisplayName("a document the claim does not ask for cannot be uploaded against it")
  void onlyTheRequiredDocumentsAreAccepted() {
    assertThatThrownBy(
            () ->
                claims.beginUpload(
                    claimant, ref, "passport_photo", "me.jpg", "image/jpeg", 2048))
        .hasMessageContaining("not a document this claim");
  }

  @Test
  @DisplayName("the storage key is the server's, and it is not the same twice")
  void keysAreServerChosenAndUnique() {
    var docKey = firstRequiredDoc();
    var first = claims.beginUpload(claimant, ref, docKey, "a.pdf", "application/pdf", 10);
    var second = claims.beginUpload(claimant, ref, docKey, "a.pdf", "application/pdf", 10);

    /*
     * A second attempt writes a new object rather than overwriting the first.
     * That is what object lock needs, and it is what stops different bytes from
     * appearing behind a key an assessor has already looked at.
     */
    assertThat(first.key()).isNotEqualTo(second.key());
    assertThat(second.key()).startsWith("claims/").endsWith(".pdf");
    assertThat(second.method()).isEqualTo("PUT");
    assertThat(second.expiresAt()).isAfter(java.time.Instant.now());
  }

  @Test
  @DisplayName("a key cannot walk out of the evidence directory")
  void keysCannotTraverse() {
    assertThatThrownBy(() -> evidence.read("../../etc/passwd"))
        .hasMessageContaining("not a document key");
  }

  @Test
  @DisplayName("uploading every required document moves the claim to assessing")
  void theClaimMovesOnWhenTheEvidenceIsThere() {
    var required =
        db.sql(
                """
                SELECT doc_key FROM claim_documents
                 WHERE claim_id = (SELECT id FROM claims WHERE claim_ref = :ref) ORDER BY doc_key
                """)
            .param("ref", ref)
            .query(String.class)
            .list();
    assertThat(required).isNotEmpty();

    var outstanding = required.size();
    for (var docKey : required) {
      // Member-scoped throughout: attaching the last document moves the claim
      // on, which writes the sponsor's projection again — the write that used
      // to be refused under exactly this scope.
      var upload =
          asClaimant(
              () -> claims.beginUpload(claimant, ref, docKey, docKey + ".pdf", "application/pdf", 12));
      uploadTo(upload, "bytes for " + docKey);
      outstanding = asClaimant(() -> claims.attachDocument(claimant, ref, docKey)).outstanding();
    }

    assertThat(outstanding).isZero();
    assertThat(claimState()).isEqualTo("assessing");
  }

  @Test
  @DisplayName("an assessor can read the certificate; another member cannot")
  void readingIsScopedToTheClaimantAndTheAssessor() throws Exception {
    var docKey = firstRequiredDoc();
    var upload = claims.beginUpload(claimant, ref, docKey, "cert.pdf", "application/pdf", 9);
    uploadTo(upload, "certificate");
    claims.attachDocument(claimant, ref, docKey);

    // The assessor: deciding a claim means looking at the document.
    try (var body = claims.document(assessor, ref, docKey).body()) {
      assertThat(new String(body.readAllBytes(), StandardCharsets.UTF_8)).isEqualTo("certificate");
    }

    // The claimant: their own claim, and the filename survives the round trip.
    var own = claims.document(claimant, ref, docKey);
    own.body().close();
    assertThat(own.filename()).isEqualTo("cert.pdf");

    /*
     * Anybody else: refused on the claim's member, not on the reference. A
     * claim reference is CLM-yyyy-nnnn and guessable, and "you have the
     * reference" is not a reason to be shown somebody's death certificate.
     */
    assertThatThrownBy(() -> claims.document(otherMember, ref, docKey))
        .hasMessageContaining("not yours");
  }

  @Test
  @DisplayName("a document nobody has uploaded is not readable, even by an assessor")
  void nothingToReadIsNotFound() {
    assertThatThrownBy(() -> claims.document(assessor, ref, firstRequiredDoc()))
        .hasMessageContaining("has not been uploaded");
  }

  private String claimState() {
    return db.sql("SELECT state::text FROM claims WHERE claim_ref = :ref")
        .param("ref", ref)
        .query(String.class)
        .single();
  }
}
