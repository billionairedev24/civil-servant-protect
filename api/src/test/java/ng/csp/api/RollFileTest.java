package ng.csp.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import ng.csp.api.auth.Role;
import ng.csp.api.auth.SessionUser;
import ng.csp.api.config.RlsScope;
import ng.csp.api.evidence.Evidence;
import ng.csp.api.rollfile.RollFileService;
import ng.csp.api.sponsor.SponsorService;
import org.awaitility.Awaitility;
import org.bouncycastle.openpgp.PGPPublicKeyRing;
import org.bouncycastle.openpgp.PGPSignatureList;
import org.bouncycastle.openpgp.PGPUtil;
import org.bouncycastle.openpgp.jcajce.JcaPGPObjectFactory;
import org.bouncycastle.openpgp.operator.jcajce.JcaKeyFingerprintCalculator;
import org.bouncycastle.openpgp.operator.jcajce.JcaPGPContentVerifierBuilderProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

/**
 * The roll file: what a payroll sent, what we did with it, and a signature over the answer.
 *
 * <p>Every assertion here is about the stored bytes rather than about what the code meant to store.
 * A test that checks {@code object_key IS NOT NULL} proves a string was written to a column; the
 * question worth answering is whether the object it names exists, matches its digest, and carries a
 * signature that checks out against the key this service publishes.
 */
@SpringBootTest
@ActiveProfiles("test")
class RollFileTest {

  @Autowired SponsorService sponsors;
  @Autowired RollFileService rollFiles;
  @Autowired Evidence store;
  @Autowired JdbcClient db;

  private UUID sponsorId;
  private SessionUser preparer;

  @BeforeEach
  void seed() {
    members = 0;
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

    member("0001", "Adaeze Okonkwo");
    // A name with a tab in it. Payroll exports contain surprises, and this one
    // would shift every later column on its line if it were written through
    // unescaped — see the test below.
    member("0002", "Chinedu\tEze");

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
  @DisplayName("a finished load leaves a roll file whose signature actually verifies")
  void signatureVerifies() throws Exception {
    var batchId = load(row("0001", "Adaeze Okonkwo"), row("0002", "Chinedu\tEze"));

    var stored = rollFiles.describe(batchId);
    assertThat(stored.error()).isNull();
    assertThat(stored.objectKey()).isNotNull();
    assertThat(stored.signatureKey()).isNotNull();
    assertThat(stored.signedAt()).isNotNull();

    var bytes = read(stored.objectKey());
    var signature = read(stored.signatureKey());

    // The digest on the row is over the bytes in the bucket, not over a re-render.
    assertThat(sha256(bytes)).isEqualTo(stored.sha256());
    assertThat((long) bytes.length).isEqualTo(stored.byteSize());

    assertThat(verifies(bytes, signature, rollFiles.publicKey()))
        .as("the published public key verifies the stored signature")
        .isTrue();
  }

  @Test
  @DisplayName("one changed byte and the signature stops verifying")
  void tamperingIsDetected() throws Exception {
    var batchId = load(row("0001", "Adaeze Okonkwo"));
    var stored = rollFiles.describe(batchId);

    var bytes = read(stored.objectKey());
    var signature = read(stored.signatureKey());

    /*
     * An amount, changed the way somebody would change it.
     *
     * Not a random byte in the header: the point of signing a roll file is that
     * a figure cannot be edited after the fact, so the test edits a figure. The
     * digest check would catch this too — this asserts the signature does, which
     * is the claim that holds when whoever edited the file also edits the row.
     */
    var text = new String(bytes, StandardCharsets.UTF_8).replace("250000", "150000");
    assertThat(text).doesNotContain("250000");

    assertThat(verifies(text.getBytes(StandardCharsets.UTF_8), signature, rollFiles.publicKey()))
        .isFalse();
  }

  @Test
  @DisplayName("a tab in a name cannot shift the columns")
  void namesAreEscaped() throws Exception {
    var batchId = load(row("0002", "Chinedu\tEze"));
    var bytes = read(rollFiles.describe(batchId).objectKey());
    var text = new String(bytes, StandardCharsets.UTF_8);

    var row = text.lines().filter(l -> l.startsWith("1\t")).findFirst().orElseThrow();

    /*
     * Six columns, whatever the name contained.
     *
     * The limit of -1 is load-bearing: a loaded row has no reason, so the line
     * ends in an empty field, and String.split drops trailing empties by
     * default. Without it this asserts five and the format looks wrong when it
     * is the reader that is.
     */
    assertThat(row.split("\t", -1)).hasSize(6);
    assertThat(row).contains("Chinedu\\tEze");
    // And the literal tab is gone, so no reader can split on it by accident.
    assertThat(row.chars().filter(c -> c == '\t').count()).isEqualTo(5);
  }

  @Test
  @DisplayName("the file records what was sent as well as what was taken")
  void bothTotalsAreRecorded() throws Exception {
    // Two that match and one that does not: ₦7,500 submitted, ₦5,000 taken.
    var batchId = load(row("0001", "Adaeze Okonkwo"), row("0002", "Chinedu Eze"), row("9999", "Nobody At All"));

    var text = new String(read(rollFiles.describe(batchId).objectKey()), StandardCharsets.UTF_8);

    assertThat(text).contains("rows-submitted: 3");
    assertThat(text).contains("rows-loaded: 2");
    assertThat(text).contains("rows-rejected: 1");
    assertThat(text).contains("submitted-minor: 750000");
    assertThat(text).contains("loaded-minor: 500000");
    // The header names the sponsor, so the file means something without us.
    assertThat(text).contains("sponsor-name: Fed. Min. of Education");
    assertThat(text).contains("rail-code: CSP-114");
  }

  @Test
  @DisplayName("every time in the header is UTC with its offset on it")
  void timesAreUnambiguous() throws Exception {
    var batchId = load(row("0001", "Adaeze Okonkwo"));
    var text = new String(read(rollFiles.describe(batchId).objectKey()), StandardCharsets.UTF_8);

    /*
     * Caught by reading the file rather than by an assertion.
     *
     * The driver returns java.sql.Timestamp, whose toString is a local time with
     * no zone, so load-started read "2026-09-18 04:07:44" beside a generated
     * field that was correctly "...Z". A document whose whole purpose is to be
     * unambiguous in thirty years cannot record a time and leave the zone to be
     * guessed.
     */
    for (var field : List.of("load-started", "load-finished", "generated")) {
      var line = text.lines().filter(l -> l.startsWith(field + ": ")).findFirst().orElseThrow();
      var value = line.substring(field.length() + 2);
      assertThat(value).as("%s is an ISO-8601 instant", field).endsWith("Z").contains("T");
      // Parses as one, rather than merely looking like one.
      assertThat(java.time.Instant.parse(value)).isNotNull();
    }

    // A period is a month: no time, no zone, nothing to be ambiguous about.
    assertThat(text).contains("period: 2026-10-01");
  }

  @Test
  @DisplayName("a rejected row carries its reason into the file")
  void rejectionsAreInTheFile() throws Exception {
    var batchId = load(row("0001", "Adaeze Okonkwo"), row("8812441", "Ghost Employee"));
    var text = new String(read(rollFiles.describe(batchId).objectKey()), StandardCharsets.UTF_8);

    assertThat(text).contains("rejected\tNo member with service number 8812441");
  }

  @Test
  @DisplayName("a batch with no roll file is not the same as a batch whose roll file failed")
  void absenceIsDistinguishable() {
    var batchId = load(row("0001", "Adaeze Okonkwo"));

    // Produced: a key and no error.
    var produced = rollFiles.describe(batchId);
    assertThat(produced.objectKey()).isNotNull();
    assertThat(produced.error()).isNull();

    /*
     * A batch from before this feature existed, or one whose roll file was
     * never attempted, has neither. That is the distinction V14's roll_file_error
     * column draws, and it matters because a storage outage and an old batch
     * would otherwise look identical to the console.
     */
    db.sql("UPDATE schedule_batches SET object_key = NULL, pgp_signature_key = NULL WHERE id = :id")
        .param("id", batchId)
        .update();

    var absent = rollFiles.describe(batchId);
    assertThat(absent.objectKey()).isNull();
    assertThat(absent.error()).isNull();
    assertThatThrownBy(() -> rollFiles.open(batchId)).hasMessageContaining("no roll file");
  }

  // ---------------------------------------------------------------- helpers

  private UUID load(SponsorService.ScheduleRow... rows) {
    var result =
        sponsors.uploadSchedule(
            preparer, sponsorId, LocalDate.of(2026, 10, 1), "ippis-october.csv", List.of(rows));
    awaitRollFile(result.batchId());
    return result.batchId();
  }

  /**
   * Waits for the roll file step, not for the load.
   *
   * <p>The batch reaches {@code complete} in the step before this one, so a test that awaited
   * {@code state = 'complete'} and then read {@code object_key} would race the roll file and fail
   * intermittently — the worst kind of failure to chase. Polled in this thread, because the
   * row-level scope is a ThreadLocal applied at connection checkout.
   */
  private void awaitRollFile(UUID batchId) {
    Awaitility.await()
        .atMost(30, TimeUnit.SECONDS)
        .pollInterval(100, TimeUnit.MILLISECONDS)
        .pollInSameThread()
        .until(
            () ->
                db.sql(
                        """
                        SELECT (object_key IS NOT NULL OR roll_file_error IS NOT NULL)
                          FROM schedule_batches WHERE id = :id
                        """)
                    .param("id", batchId)
                    .query(Boolean.class)
                    .single());
  }

  private SponsorService.ScheduleRow row(String serviceNo, String name) {
    return new SponsorService.ScheduleRow(serviceNo, name, 250_000);
  }

  /** Sequence for the CSP-ID and the phone number, both of which have a shape to keep. */
  private int members = 0;

  private void member(String serviceNo, String name) {
    var n = ++members;
    db.sql(
            """
            INSERT INTO members
              (csp_id, sponsor_id, service_no, full_name, display_name, date_of_birth, msisdn,
               tier, in_force_since)
            VALUES (:csp, :s, :sn, :n, :n, DATE '1985-01-01', :m, 'standard', DATE '2025-08-01')
            """)
        .param("csp", "CSP-114-%05d".formatted(n))
        .param("s", sponsorId)
        .param("sn", serviceNo)
        .param("n", name)
        .param("m", "+23480300000%02d".formatted(n))
        .update();
  }

  private byte[] read(String key) throws Exception {
    try (var in = store.read(key)) {
      return in.readAllBytes();
    }
  }

  private static String sha256(byte[] bytes) throws Exception {
    return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
  }

  /**
   * Verify a detached signature the way anyone else would: with the published key and nothing from
   * inside this service.
   */
  private static boolean verifies(byte[] content, byte[] signature, String armouredKey)
      throws Exception {
    var factory =
        new JcaPGPObjectFactory(PGPUtil.getDecoderStream(new ByteArrayInputStream(signature)));
    var signatures = (PGPSignatureList) factory.nextObject();
    var sig = signatures.get(0);

    var ring =
        new PGPPublicKeyRing(
            PGPUtil.getDecoderStream(
                new ByteArrayInputStream(armouredKey.getBytes(StandardCharsets.UTF_8))),
            new JcaKeyFingerprintCalculator());

    sig.init(new JcaPGPContentVerifierBuilderProvider().setProvider("BC"), ring.getPublicKey(sig.getKeyID()));
    sig.update(content);
    return sig.verify();
  }
}
