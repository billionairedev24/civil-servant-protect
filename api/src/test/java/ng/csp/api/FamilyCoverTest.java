package ng.csp.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import ng.csp.api.config.RlsScope;
import ng.csp.api.enrolment.EnrolmentService;
import ng.csp.api.member.MemberService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

/**
 * Family cover: the people a member adds to their own policy.
 *
 * <p>Two rules carry the whole screen. The premium is quoted by the server for the age band, so an
 * out-of-date app or an edited request cannot buy cover cheaply. And a dependant is deactivated
 * rather than deleted, because the row is what says this person was covered from March to September
 * — a claim in that window is assessed against it.
 */
@SpringBootTest
@ActiveProfiles("test")
class FamilyCoverTest {

  @Autowired MemberService members;
  @Autowired EnrolmentService enrolment;
  @Autowired JdbcClient db;

  private UUID memberId;
  private UUID otherMemberId;

  @BeforeEach
  void seed() {
    RlsScope.set(RlsScope.system());
    for (var table :
        List.of("integration_calls", "dependants", "beneficiary_events", "beneficiaries",
            "contributions", "collection_cycles", "users", "members", "sponsors")) {
      db.sql("TRUNCATE TABLE " + table + " CASCADE").update();
    }

    var sponsorId =
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

    memberId =
        enrolment
            .enrol("22233344455", "Adaeze Nkiru Okafor", LocalDate.of(1990, 4, 12),
                "+2348031234567", sponsorId, "5512340", "GL 12", "standard", List.of())
            .memberId();
    otherMemberId =
        enrolment
            .enrol("22233344466", "Musa Sani Ibrahim", LocalDate.of(1985, 1, 2),
                "+2348039999999", sponsorId, "5512341", "GL 09", "basic", List.of())
            .memberId();
  }

  @AfterEach
  void clearScope() {
    RlsScope.clear();
  }

  @Test
  @DisplayName("the server prices a dependant by age band, and the client never multiplies")
  void theBandIsQuotedHere() {
    var child = members.addDependant(memberId, "Ada Okafor", "Daughter", LocalDate.now().minusYears(9));
    var adult = members.addDependant(memberId, "Chinedu Okafor", "Spouse", LocalDate.now().minusYears(38));
    var senior = members.addDependant(memberId, "Grace Okafor", "Mother", LocalDate.now().minusYears(67));

    assertThat(child.band()).isEqualTo("child");
    assertThat(adult.band()).isEqualTo("adult");
    assertThat(senior.band()).isEqualTo("senior");

    /*
     * Banded rather than continuous, and quoted server-side. A member has to be
     * able to check the number against a printed table, and a rate that moves
     * with a birthday is impossible to argue with at a service desk — which
     * makes it impossible to trust.
     */
    assertThat(senior.premiumMinor()).isGreaterThan(adult.premiumMinor());
    assertThat(adult.premiumMinor()).isGreaterThan(child.premiumMinor());

    // The running total, so the screen never adds up prices itself.
    assertThat(senior.newPremiumMinor())
        .isEqualTo(child.premiumMinor() + adult.premiumMinor() + senior.premiumMinor());
  }

  @Test
  @DisplayName("cover starts on the first of next month, not the day somebody typed it in")
  void coverStartsWithTheNextPremium() {
    var added = members.addDependant(memberId, "Ada Okafor", "Daughter", LocalDate.now().minusYears(9));

    assertThat(added.effectiveFrom()).isEqualTo(LocalDate.now().withDayOfMonth(1).plusMonths(1));
  }

  @Test
  @DisplayName("removing a dependant keeps the row, because a claim may be assessed against it")
  void removingDeactivatesRatherThanDeletes() {
    var child = members.addDependant(memberId, "Ada Okafor", "Daughter", LocalDate.now().minusYears(9));
    var spouse = members.addDependant(memberId, "Chinedu Okafor", "Spouse", LocalDate.now().minusYears(38));
    var id = members.dependants(memberId).stream().filter(d -> d.name().equals("Ada Okafor")).findFirst().orElseThrow().id();

    var removed = members.removeDependant(memberId, id);

    assertThat(removed.name()).isEqualTo("Ada Okafor");
    // The premium drops to what is left, and not before next month: cover to the
    // end of this one has already been paid for.
    assertThat(removed.newPremiumMinor()).isEqualTo(spouse.premiumMinor());
    assertThat(removed.effectiveFrom()).isEqualTo(LocalDate.now().withDayOfMonth(1).plusMonths(1));
    assertThat(removed.coveredUntil()).isEqualTo(removed.effectiveFrom().minusDays(1));

    /*
     * Still there, marked inactive. A delete would leave a family arguing about
     * cover the record no longer remembers — and the months this child was
     * covered were paid for.
     */
    var rows = members.dependants(memberId);
    assertThat(rows).hasSize(2);
    assertThat(rows.stream().filter(d -> d.name().equals("Ada Okafor")).findFirst().orElseThrow().active())
        .isFalse();
    assertThat(child.premiumMinor()).isPositive();
  }

  @Test
  @DisplayName("removing the same person twice is refused rather than repeated")
  void removingIsNotRepeatable() {
    members.addDependant(memberId, "Ada Okafor", "Daughter", LocalDate.now().minusYears(9));
    var id = members.dependants(memberId).getFirst().id();

    members.removeDependant(memberId, id);

    assertThatThrownBy(() -> members.removeDependant(memberId, id))
        .hasMessageContaining("No such dependant");
  }

  @Test
  @DisplayName("one member cannot take somebody off another member's cover")
  void oneMemberCannotTouchAnother_s() {
    members.addDependant(memberId, "Ada Okafor", "Daughter", LocalDate.now().minusYears(9));
    var id = members.dependants(memberId).getFirst().id();

    // The dependant exists. They are simply not this member's, and the answer
    // says so without confirming whose they are.
    assertThatThrownBy(() -> members.removeDependant(otherMemberId, id))
        .hasMessageContaining("No such dependant");

    assertThat(members.dependants(memberId).getFirst().active()).isTrue();
  }
}
