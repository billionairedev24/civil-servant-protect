package ng.csp.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
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
 * Putting somebody on the scheme.
 *
 * <p>Back-office work: the sponsor holds these people's details already, so an HR officer enrols
 * them and the member is told by SMS. There is no self-service path and these tests are the record
 * of that — everything here is scoped to a sponsor.
 *
 * <p>The stub NIMC rejects a NIN ending in zero, which is how the "no such person" branch stays
 * reachable without inventing a second stub. An enrolment flow whose failure path has never run is
 * a failure path nobody has seen.
 */
@SpringBootTest
@ActiveProfiles("test")
class EnrolmentTest {

  @Autowired EnrolmentService enrolment;
  @Autowired JdbcClient db;

  private UUID sponsorId;

  @BeforeEach
  void seed() {
    RlsScope.set(RlsScope.system());
    for (var table :
        List.of("integration_calls", "beneficiary_events", "beneficiaries", "users", "members",
            "sponsors")) {
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
  }

  @AfterEach
  void clearScope() {
    RlsScope.clear();
  }

  @Test
  @DisplayName("enrolling creates a member, an account to sign in with, and cover from next month")
  void enrollingMakesAMember() {
    var enrolled = enrol("22233344455", "Ngozi Chidinma Bello", "+2348031234567");

    assertThat(enrolled.cspId()).matches("CSP-114-\\d{5}");
    assertThat(enrolled.tier()).isEqualTo("standard");
    // Not today. The first deduction comes off the next payroll run, and cover
    // that began before anybody paid for it is a claim window the record cannot
    // account for.
    assertThat(enrolled.inForceSince()).isEqualTo(LocalDate.now().withDayOfMonth(1).plusMonths(1));

    // A member's only credential is their phone number, so the account and the
    // member row are made together or not at all.
    var account =
        db.sql("SELECT count(*)::int FROM users WHERE msisdn = :m AND member_id = :id")
            .param("m", "+2348031234567")
            .param("id", enrolled.memberId())
            .query(Integer.class)
            .single();
    assertThat(account).isEqualTo(1);
  }

  @Test
  @DisplayName("the NIN is stored as a hash and a ciphertext, never in the clear")
  void ninIsNeverStoredInTheClear() {
    var enrolled = enrol("22233344455", "Ngozi Chidinma Bello", "+2348031234567");

    var row =
        db.sql(
                """
                SELECT encode(nin_hmac, 'hex') AS h, length(nin_ciphertext) AS c,
                       (nin_hmac::text LIKE '%22233344455%') AS leaked
                  FROM members WHERE id = :id
                """)
            .param("id", enrolled.memberId())
            .query((rs, n) -> new Object[] {rs.getString("h"), rs.getInt("c"), rs.getBoolean("leaked")})
            .single();

    assertThat((String) row[0]).hasSize(64);
    assertThat((Integer) row[1]).isGreaterThan(0);
    assertThat((Boolean) row[2]).isFalse();
  }

  @Test
  @DisplayName("the same person cannot be enrolled twice, even under a different service number")
  void oneNinIsOneMember() {
    enrol("22233344455", "Ngozi Chidinma Bello", "+2348031234567");

    assertThatThrownBy(() -> enrol("22233344455", "Ngozi Chidinma Bello", "+2348039999999"))
        .hasMessageContaining("already on the scheme");
  }

  @Test
  @DisplayName("a phone number belongs to one account, because it is the only credential")
  void onePhoneNumberIsOneAccount() {
    enrol("22233344455", "Ngozi Chidinma Bello", "+2348031234567");

    assertThatThrownBy(() -> enrol("22233344466", "Somebody Else Entirely", "+2348031234567"))
        .hasMessageContaining("already on an account");
  }

  @Test
  @DisplayName("NIMC not knowing the NIN stops the enrolment, and writes nothing down")
  void anUnknownNinEnrolsNobody() {
    // The stub rejects a NIN ending in zero.
    assertThatThrownBy(() -> enrol("22233344450", "Ghost Person", "+2348031234567"))
        .hasMessageContaining("No record at NIMC");

    var members = db.sql("SELECT count(*)::int FROM members").query(Integer.class).single();
    assertThat(members).isZero();
  }

  @Test
  @DisplayName("beneficiaries named at enrolment must total 100%, and nobody is half-enrolled if not")
  void sharesMustTotalOneHundred() {
    assertThatThrownBy(
            () ->
                enrolment.enrol(
                    "22233344455", "Ngozi Chidinma Bello", LocalDate.of(1990, 4, 12),
                    "+2348031234567", sponsorId, "5512340", "GL 10", "standard",
                    List.of(
                        new EnrolmentService.NewBeneficiary("Chinedu Bello", "Spouse", null, 60),
                        new EnrolmentService.NewBeneficiary("Ada Bello", "Daughter", null, 30))))
        .hasMessageContaining("100%");

    // The member is not left half-made. A record with cover and no payees is one
    // somebody reconciles by hand at a claim, which is the worst possible time.
    var members = db.sql("SELECT count(*)::int FROM members").query(Integer.class).single();
    assertThat(members).isZero();
  }

  @Test
  @DisplayName("a payroll name written surname-first is still greeted by first name")
  void aSurnameFirstNameIsReadAsOne() {
    /*
     * "UMOH, BLESSING UCHE" is how half of these files write a name, and the
     * first and last words of it are "UMOH" and "UCHE". Somebody whose first
     * contact with the scheme is a text message addressed to "UMOH, UCHE" has
     * been told, accurately, that nobody read it.
     */
    assertThat(EnrolmentService.shortNameOf("UMOH, BLESSING UCHE")).isEqualTo("BLESSING UMOH");
    assertThat(EnrolmentService.shortNameOf("Adaeze Nkiru Okafor")).isEqualTo("Adaeze Okafor");
    assertThat(EnrolmentService.shortNameOf("Ngozi Bello")).isEqualTo("Ngozi Bello");
    // A trailing comma is a typo, not a surname. Fall back rather than greet
    // somebody by an empty string.
    assertThat(EnrolmentService.shortNameOf("Ngozi Bello,")).isEqualTo("Ngozi Bello,");
  }

  @Test
  @DisplayName("a service number belongs to one person within an employer")
  void oneServiceNumberIsOnePerson() {
    enrol("22233344455", "Ngozi Chidinma Bello", "+2348031234567", "5512340");

    /*
     * The unique index catches this regardless. The check exists so it is caught
     * with a sentence rather than a duplicate-key violation — and so the failure
     * reaches an officer as something to take back to the personnel file.
     */
    assertThatThrownBy(
            () -> enrol("22233344466", "Somebody Else Entirely", "+2348039999999", "5512340"))
        .hasMessageContaining("5512340");
  }

  @Test
  @DisplayName("a failed enrolment reports what went wrong, not what went wrong afterwards")
  void aFailureIsNotMaskedByTidyingUp() {
    enrol("22233344455", "Ngozi Chidinma Bello", "+2348031234567", "5512340");

    /*
     * Enrolment runs unscoped, so it puts the scope back when it is done. On a
     * failure it does that on a connection whose transaction has aborted, where
     * every statement is refused — and that refusal used to replace the real
     * error on its way out, leaving "Could not apply the row-level scope" for a
     * duplicate service number.
     */
    assertThatThrownBy(
            () -> enrol("22233344466", "Somebody Else Entirely", "+2348039999999", "5512340"))
        .hasMessageNotContaining("row-level scope");

    // And the scope survived it: this thread can still read.
    assertThat(db.sql("SELECT count(*)::int FROM members").query(Integer.class).single())
        .isEqualTo(1);
  }

  @Test
  @DisplayName("a list enrols what it can and names what it could not, with row numbers")
  void aListDoesNotFailWholesale() {
    var result =
        enrolment.enrolAll(
            sponsorId,
            List.of(
                candidate("22277700011", "Blessing Uche Umoh", "+2348036660001"),
                // Ending in zero: NIMC has never heard of them.
                candidate("22277700010", "Ghost Person", "+2348036660002"),
                candidate("22277700013", "Yusuf Garba Lawal", "+2348036660003")));

    assertThat(result.submitted()).isEqualTo(3);
    assertThat(result.enrolled()).isEqualTo(2);
    assertThat(result.rejected()).hasSize(1);

    /*
     * The row number an officer sees in their spreadsheet, allowing for the
     * header. Two good rows out of three should enrol two people and name the
     * third — not refuse the file, which is what one transaction would do and
     * what sends somebody back to a spreadsheet to find the problem themselves.
     */
    assertThat(result.rejected().getFirst().row()).isEqualTo(3);
    assertThat(result.rejected().getFirst().name()).isEqualTo("Ghost Person");

    var members = db.sql("SELECT count(*)::int FROM members").query(Integer.class).single();
    assertThat(members).isEqualTo(2);
  }

  @Test
  @DisplayName("CSP-IDs count up within the sponsor's rail")
  void cspIdsAreSequentialWithinARail() {
    var first = enrol("22277700011", "Blessing Uche Umoh", "+2348036660001", "5512340");
    var second = enrol("22277700013", "Yusuf Garba Lawal", "+2348036660003", "5512341");

    // Sequential rather than random, because a payroll clerk reads these down a
    // telephone and a block of consecutive ids is what makes a mistyped one
    // obvious.
    assertThat(second.cspId()).isGreaterThan(first.cspId());
    assertThat(first.cspId()).startsWith("CSP-114-");
  }

  private EnrolmentService.Enrolled enrol(String nin, String name, String msisdn) {
    return enrol(nin, name, msisdn, "5512340");
  }

  private EnrolmentService.Enrolled enrol(
      String nin, String name, String msisdn, String serviceNo) {
    return enrolment.enrol(
        nin, name, LocalDate.of(1990, 4, 12), msisdn, sponsorId, serviceNo, "GL 10", "standard",
        List.of());
  }

  private EnrolmentService.Candidate candidate(String nin, String name, String msisdn) {
    return new EnrolmentService.Candidate(
        nin, name, LocalDate.of(1990, 4, 12), msisdn, null, null, "standard", List.of());
  }
}
