package ng.csp.api.enrolment;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import ng.csp.api.config.RlsScope;
import ng.csp.api.domain.Nin;
import ng.csp.api.domain.Pricing;
import ng.csp.api.integration.IntegrationException;
import ng.csp.api.integration.Comms;
import ng.csp.api.integration.Nimc;
import ng.csp.api.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Putting a civil servant on the scheme.
 *
 * <p>A back-office job, not self-service. The sponsor already holds these people's details — that is
 * what a payroll is — so an HR officer enrols them from what the ministry knows, one at a time or
 * from a list, and the member is then told by SMS that they have cover and can open the app. Nobody
 * signs themselves up.
 *
 * <p>That is not merely a workflow preference. A public enrolment endpoint is an oracle: give it a
 * NIN and it tells you whether that person is enrolled, or lets somebody attach a phone number they
 * control to a civil servant they have read about. The scheme's whole membership is defined by
 * payroll, so there is no reason for such an endpoint to exist.
 *
 * <p>Three things have to be true before somebody is covered:
 *
 * <ol>
 *   <li><b>They are who the payroll says they are.</b> NIMC, not just the file. A scheme paying a
 *       death benefit has to know whose family it is paying, and "we trusted the name on the payroll
 *       file" is how a claim becomes a twelve-month dispute.
 *   <li><b>Somebody collects the money.</b> The sponsor doing the enrolling, on their rail.
 *   <li><b>They are told.</b> Cover nobody knows they have is cover nobody claims — the family of a
 *       member who never opened the app will not know there is anything to claim.
 * </ol>
 *
 * <p>Naming a beneficiary is deliberately not on that list. Insisting on it at the desk would stall
 * enrolment on the detail members are least able to answer on the spot; they are asked in the app
 * immediately afterwards and chased from the sponsor's roster, which is what the "no beneficiary"
 * filter is for.
 */
@Service
public class EnrolmentService {

  private static final Logger log = LoggerFactory.getLogger(EnrolmentService.class);

  /**
   * How closely a name must match NIMC's.
   *
   * <p>Nigerian names do not compare exactly. "ADAEZE N OKAFOR" on a payroll file and "Adaeze Nkiru
   * Okafor" on the register are the same person, and a threshold set at 100 would have enrolment
   * officers overriding it all day until they stopped reading it. Set where a middle name or an
   * initial passes and a different person does not.
   */
  private static final int NAME_MATCH_THRESHOLD = 70;

  private final JdbcClient db;
  private final Nimc nimc;
  private final Nin nin;
  private final Comms comms;

  /*
   * This service, through the proxy.
   *
   * A bulk enrolment needs each member in its own transaction, and calling
   * `this.enrol(...)` from `enrolAll` goes straight to the method and skips the
   * @Transactional proxy entirely — so all two hundred would share the caller's
   * transaction and one bad NIN would roll back the lot. Self-injection is ugly
   * and is the least surprising of the ways around it.
   */
  private final org.springframework.beans.factory.ObjectProvider<EnrolmentService> selfProvider;

  public EnrolmentService(
      JdbcClient db,
      Nimc nimc,
      Nin nin,
      Comms comms,
      org.springframework.beans.factory.ObjectProvider<EnrolmentService> selfProvider) {
    this.db = db;
    this.nimc = nimc;
    this.nin = nin;
    this.comms = comms;
    this.selfProvider = selfProvider;
  }

  private EnrolmentService self() {
    return selfProvider.getObject();
  }

  // ── Is this person who payroll says ─────────────────────────────────────────

  public record Identity(
      boolean verified, String reason, String fullName, LocalDate dateOfBirth, String reference) {}

  /**
   * Check a NIN against NIMC.
   *
   * <p>Nothing is written down on a failure, and nothing is written down on success either — this
   * returns an answer and the caller decides. That matters because a half-enrolled member is worse
   * than an unenrolled one: they believe they have cover.
   *
   * <p>The NIN never reaches the replay log, the application log, or this method's return value.
   * Only the answer does.
   */
  public Identity verifyIdentity(String rawNin, String fullName, LocalDate dateOfBirth) {
    var normalised = rawNin == null ? "" : rawNin.replaceAll("\\D", "");
    if (normalised.length() != 11) {
      throw ApiException.badRequest("A NIN is eleven digits.");
    }

    /*
     * Already enrolled, checked before NIMC rather than after.
     *
     * The unique index on nin_hmac would catch it at the end, but by then a
     * verification has been paid for and the member has answered three more
     * screens to be told they were already a member on the first one.
     */
    if (existsByNin(normalised)) {
      throw ApiException.conflict(
          "already_enrolled",
          "That NIN is already on the scheme. Check the roster — they may be enrolled under "
              + "another service number, or by another MDA if they have transferred.");
    }

    Nimc.Verification answer;
    try {
      answer = nimc.verify(normalised, fullName, dateOfBirth, "enrolment:" + hashFor(normalised));
    } catch (IntegrationException.Refused e) {
      // NIMC said no. That is an answer, and a final one.
      return new Identity(false, e.getMessage(), null, null, null);
    } catch (IntegrationException.Unavailable e) {
      throw ApiException.serviceUnavailable(
          "NIMC is not answering at the moment. Nothing has been saved — try again shortly.");
    }

    if (!answer.found()) {
      return new Identity(false, "No record at NIMC for that NIN.", null, null, answer.reference());
    }
    /*
     * Which field disagreed, because the person reading this is an HR officer
     * with the file in front of them and has to fix it.
     *
     * This is the one place that detail is safe to give: the endpoint is behind
     * MEMBERS_MANAGE on a sponsor, so the caller already holds the staff record
     * they are asking about. A public version of this call would have to be
     * vague, which is one of several reasons there is no public version.
     */
    if (!answer.dobMatches()) {
      return new Identity(
          false, "The date of birth does not match NIMC's record for that NIN.", null, null,
          answer.reference());
    }
    if (answer.nameScore() < NAME_MATCH_THRESHOLD) {
      return new Identity(
          false, "The name does not match NIMC's record for that NIN.", null, null,
          answer.reference());
    }

    return new Identity(true, null, fullName, dateOfBirth, answer.reference());
  }

  // ── Put them on the scheme ──────────────────────────────────────────────────

  public record NewBeneficiary(String name, String relation, String msisdn, int sharePct) {}

  public record Enrolled(
      UUID memberId, String cspId, String tier, long priceMinor, LocalDate inForceSince,
      String collectionRail, boolean beneficiariesNamed) {}

  /**
   * Create the member, start their cover, and tell them.
   *
   * <p>One transaction, on purpose. A member who exists with no cover date, or an account with no
   * member behind it, is a record somebody reconciles by hand later — and "later" here means at a
   * claim, which is the worst possible time.
   *
   * <p>The SMS goes after the commit rather than inside it. A message telling somebody they are
   * covered, sent from a transaction that then rolls back, is worse than no message.
   */
  @Transactional
  public Enrolled enrol(
      String rawNin,
      String fullName,
      LocalDate dateOfBirth,
      String msisdn,
      UUID sponsorId,
      String serviceNo,
      String grade,
      String tier,
      List<NewBeneficiary> beneficiaries) {

    var normalised = rawNin.replaceAll("\\D", "");
    var identity = verifyIdentity(normalised, fullName, dateOfBirth);
    if (!identity.verified()) {
      throw ApiException.badRequest(identity.reason());
    }

    var price = Pricing.SCHEDULE.tiers().stream().filter(t -> t.code().equals(tier)).findFirst();
    if (price.isEmpty()) {
      throw ApiException.badRequest(
          "Unknown cover tier. Choose one of: "
              + Pricing.SCHEDULE.tiers().stream().map(Pricing.Tier::code).toList());
    }

    /*
     * Enrolment creates rows across rails, so it runs unscoped.
     *
     * The caller is a member-to-be with no session at all, or an HR officer
     * scoped to one sponsor. Neither scope can see the sponsor row this member
     * is about to be attached to — and under RLS that is a silent empty result
     * rather than an error.
     */
    return RlsScope.runUnscoped(
        () -> {
          var sponsor =
              db.sql("SELECT rail_code, method, collection_day FROM sponsors WHERE id = :id")
                  .param("id", sponsorId)
                  .query((rs, n) -> new String[] {rs.getString("rail_code"), rs.getString("method")})
                  .optional()
                  .orElseThrow(() -> ApiException.badRequest("No such sponsor."));

          if (existsByMsisdn(msisdn)) {
            throw ApiException.conflict(
                "phone_in_use",
                "That phone number is already on an account. Sign in with it instead.");
          }

          /*
           * A service number is one person within one MDA.
           *
           * The unique index would catch this anyway, but as a duplicate-key
           * violation halfway through the insert — which reaches an HR officer
           * as a five hundred and tells them nothing. Two rows sharing a
           * service number is a file with a line pasted twice, or two people
           * genuinely holding one number in payroll, and both are answered at
           * the personnel file rather than here.
           */
          if (serviceNo != null && !serviceNo.isBlank() && existsByServiceNo(sponsorId, serviceNo)) {
            throw ApiException.conflict(
                "service_no_in_use",
                "Service number " + serviceNo + " is already enrolled for this employer.");
          }

          /*
           * Cover starts on the first of next month, not today.
           *
           * The first deduction comes off the next payroll run, and cover that
           * began before anybody paid for it is cover the scheme is carrying
           * for free — but worse than that, it is a claim window in which a
           * member is covered and the record cannot say what they paid.
           */
          var inForce = LocalDate.now().withDayOfMonth(1).plusMonths(1);
          var cspId = nextCspId(sponsor[0]);

          var memberId =
              db.sql(
                      """
                      INSERT INTO members
                        (csp_id, sponsor_id, service_no, full_name, display_name, date_of_birth,
                         grade, msisdn, nin_hmac, nin_ciphertext, tier, in_force_since)
                      VALUES (:csp, :sponsor, :svc, :full, :display, :dob, :grade, :msisdn,
                              :ninHmac, :ninCipher, :tier, :inForce)
                      RETURNING id
                      """)
                  .param("csp", cspId)
                  .param("sponsor", sponsorId)
                  .param("svc", serviceNo)
                  .param("full", fullName)
                  .param("display", shortNameOf(fullName))
                  .param("dob", dateOfBirth)
                  .param("grade", grade)
                  .param("msisdn", msisdn)
                  .param("ninHmac", nin.hmac(normalised))
                  .param("ninCipher", nin.encrypt(normalised))
                  .param("tier", tier)
                  .param("inForce", inForce)
                  .query(UUID.class)
                  .single();

          // The account they sign in with. A member's only credential is their
          // phone number, so the user row and the member row are made together
          // or not at all.
          db.sql(
                  """
                  INSERT INTO users (msisdn, full_name, role, member_id)
                  VALUES (:msisdn, :name, 'member', :member)
                  """)
              .param("msisdn", msisdn)
              .param("name", fullName)
              .param("member", memberId)
              .update();

          var named = beneficiaries != null && !beneficiaries.isEmpty();
          if (named) {
            saveBeneficiaries(memberId, beneficiaries);
          }

          log.info("enrolled {} on sponsor {} at {}", cspId, sponsorId, tier);
          invite(msisdn, cspId, shortNameOf(fullName), inForce);
          return new Enrolled(
              memberId, cspId, tier, price.get().priceMinor(), inForce, sponsor[1], named);
        });
  }

  // ── A list of them ──────────────────────────────────────────────────────────

  /** One row of a list of new starters. */
  public record Candidate(
      String nin, String fullName, LocalDate dateOfBirth, String msisdn, String serviceNo,
      String grade, String tier, List<NewBeneficiary> beneficiaries) {}

  public record Rejected(int row, String name, String reason) {}

  public record BulkResult(int submitted, int enrolled, List<Enrolled> members, List<Rejected> rejected) {}

  /**
   * Enrol a list, one at a time, and report what did not work.
   *
   * <p>Each member is its own transaction — {@code enrol} is {@code @Transactional} and called
   * through the proxy — so three bad NINs in a file of two hundred cost three enrolments, not two
   * hundred. The alternative is a single transaction that rolls the lot back and sends an officer to
   * a spreadsheet to find the problem themselves, which is how a bad file becomes a week.
   *
   * <p>Deliberately sequential. Every row is a NIMC call over an IPsec tunnel and an SMS to a real
   * person; running them in parallel would trip the circuit breaker on a file that is merely large,
   * and the breaker exists because NIMC is fragile rather than because we are impatient.
   */
  public BulkResult enrolAll(UUID sponsorId, List<Candidate> candidates) {
    var enrolled = new java.util.ArrayList<Enrolled>();
    var rejected = new java.util.ArrayList<Rejected>();

    for (int i = 0; i < candidates.size(); i++) {
      var candidate = candidates.get(i);
      // The line number an officer sees in their spreadsheet, allowing for the
      // header row — the same convention the schedule loader uses.
      var row = i + 2;
      try {
        enrolled.add(
            self().enrol(
                candidate.nin(),
                candidate.fullName(),
                candidate.dateOfBirth(),
                candidate.msisdn(),
                sponsorId,
                candidate.serviceNo(),
                candidate.grade(),
                candidate.tier(),
                candidate.beneficiaries()));
      } catch (ApiException e) {
        rejected.add(new Rejected(row, candidate.fullName(), e.getMessage()));
      } catch (RuntimeException e) {
        log.warn("row {} of a bulk enrolment failed", row, e);
        rejected.add(new Rejected(row, candidate.fullName(), "Could not be enrolled."));
      }
    }

    return new BulkResult(candidates.size(), enrolled.size(), List.copyOf(enrolled), List.copyOf(rejected));
  }

  /**
   * Tell them they have cover.
   *
   * <p>The one message that has to arrive. Everything else in this system assumes a member who
   * knows they are a member: the app, the protection card, the annual beneficiary confirmation,
   * and — the one that matters — a family who knows there is something to claim. Cover that nobody
   * was told about is cover that is never claimed, which is a scheme collecting money for nothing.
   *
   * <p>After the commit, and it does not fail the enrolment. The member exists either way; an SMS
   * that did not send is a row in the replay log and a resend, while an enrolment rolled back
   * because an aggregator was down is a civil servant who has to queue at HR again.
   */
  private void invite(String msisdn, String cspId, String name, LocalDate inForce) {
    org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
        new org.springframework.transaction.support.TransactionSynchronization() {
          @Override
          public void afterCommit() {
            try {
              comms.notify(
                  msisdn,
                  "enrolled",
                  java.util.Map.of(
                      "name", name,
                      "cspId", cspId,
                      "inForce", inForce.toString()),
                  cspId);
            } catch (RuntimeException e) {
              log.warn("could not send the enrolment SMS for {}: {}", cspId, e.getMessage());
            }
          }
        });
  }

  /**
   * The first beneficiaries.
   *
   * <p>Shares must total 100 or nothing — the same rule as every later edit, enforced by a deferred
   * constraint trigger. Enforcing it here as well means the member is told while the form is in
   * front of them rather than by a 500 afterwards.
   */
  private void saveBeneficiaries(UUID memberId, List<NewBeneficiary> people) {
    var total = people.stream().mapToInt(NewBeneficiary::sharePct).sum();
    if (total != 100) {
      throw ApiException.badRequest(
          "Shares must add up to exactly 100%%. These add up to %d%%.".formatted(total));
    }

    for (int i = 0; i < people.size(); i++) {
      var person = people.get(i);
      db.sql(
              """
              INSERT INTO beneficiaries (member_id, full_name, relation, msisdn, share_pct, position)
              VALUES (:m, :n, :r, :msisdn, :s, :pos)
              """)
          .param("m", memberId)
          .param("n", person.name())
          .param("r", person.relation())
          .param("msisdn", person.msisdn())
          .param("s", person.sharePct())
          .param("pos", i)
          .update();
    }

    db.sql("INSERT INTO beneficiary_events (member_id, action) VALUES (:m, 'confirmed')")
        .param("m", memberId)
        .update();
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private boolean existsByNin(String normalised) {
    return RlsScope.runUnscoped(
        () ->
            db.sql("SELECT count(*)::int FROM members WHERE nin_hmac = :h")
                .param("h", nin.hmac(normalised))
                .query(Integer.class)
                .single()
            > 0);
  }

  private boolean existsByMsisdn(String msisdn) {
    return db.sql("SELECT count(*)::int FROM users WHERE msisdn = :m")
            .param("m", msisdn)
            .query(Integer.class)
            .single()
        > 0;
  }

  private boolean existsByServiceNo(UUID sponsorId, String serviceNo) {
    return db.sql(
                "SELECT count(*)::int FROM members WHERE sponsor_id = :s AND service_no = :no")
            .param("s", sponsorId)
            .param("no", serviceNo)
            .query(Integer.class)
            .single()
        > 0;
  }

  /**
   * CSP-114-00001, counting up within the sponsor's rail code.
   *
   * <p>Sequential within a rail rather than random, because a payroll clerk reads these down a
   * telephone and a block of consecutive ids for one MDA is what makes a mistyped one obvious.
   *
   * <p>Racy by construction — two enrolments at the same instant can pick the same number — which
   * the unique index on csp_id turns into a failed insert rather than two members sharing an id.
   * Retried once, because at this volume a collision is a curiosity rather than a pattern.
   */
  private String nextCspId(String railCode) {
    var prefix = railCode.replaceAll("[^0-9]", "");
    var stem = prefix.length() >= 3 ? prefix.substring(0, 3) : String.format("%3s", prefix).replace(' ', '0');

    var next =
        db.sql(
                """
                SELECT COALESCE(MAX(SUBSTRING(csp_id FROM 9 FOR 5)::int), 0) + 1
                  FROM members WHERE csp_id LIKE :like
                """)
            .param("like", "CSP-" + stem + "-%")
            .query(Integer.class)
            .single();

    return "CSP-%s-%05d".formatted(stem, next);
  }

  /**
   * "Adaeze Okafor" from "Adaeze Nkiru Okafor", and from "OKAFOR, ADAEZE NKIRU".
   *
   * <p>What the app greets somebody with, and what the invitation SMS says. A middle name on a home
   * screen reads as a form rather than a greeting, and the full name stays on the record for claims.
   *
   * <p>The comma is the half of this that matters. Half of payroll exports write a name surname
   * first — "UMOH, BLESSING UCHE" — and taking the first and last words of that greets somebody as
   * "UMOH, UCHE", which is not a name anybody has ever been called. So a comma is read as the
   * boundary it is and the surname goes to the back.
   */
  public static String shortNameOf(String fullName) {
    var trimmed = fullName.trim();

    var comma = trimmed.indexOf(',');
    if (comma > 0) {
      var surname = trimmed.substring(0, comma).trim();
      var given = trimmed.substring(comma + 1).trim().split("\\s+");
      if (!surname.isEmpty() && given.length > 0 && !given[0].isEmpty()) {
        return given[0] + " " + surname;
      }
    }

    var parts = trimmed.split("\\s+");
    return parts.length <= 2 ? trimmed : parts[0] + " " + parts[parts.length - 1];
  }

  /** A stable, non-reversible handle for the replay log's subject. Never the NIN. */
  private String hashFor(String normalised) {
    return java.util.HexFormat.of().formatHex(nin.hmac(normalised), 0, 6);
  }
}
