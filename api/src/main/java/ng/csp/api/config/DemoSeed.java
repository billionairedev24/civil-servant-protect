package ng.csp.api.config;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import ng.csp.api.domain.Money;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ng.csp.api.domain.Nin;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds the demo. Active only under the {@code seed} profile.
 *
 * <p>These are the same figures the UI fixtures use — Adaeze Okafor, CSP-114-88214, 14 months paid,
 * Chinedu 60 / Ngozi 40 / Emeka 0 — so that pointing the apps at the API changes where the data
 * comes from and nothing a demo would notice.
 *
 * <p>Idempotent: it truncates the demo tables and rewrites them, so it can be run against a database
 * that already has a previous run in it. TRUNCATE rather than DELETE because the append-only
 * triggers are row-level and fire on DELETE, which is exactly what they are there to stop.
 */
@Component
@Profile("seed")
public class DemoSeed implements CommandLineRunner {

  private static final Logger log = LoggerFactory.getLogger(DemoSeed.class);

  /*
   * Keycloak subjects for the demo realm's console accounts.
   *
   * These are the `id` values pinned in deploy/local/keycloak-realm.json. They
   * have to be written down in both places: Keycloak owns the identity, this
   * table owns the sponsor scope, and the subject is the only thing that joins
   * them. Change one and you must change the other.
   */
  private static final String KC_AMINA = "11111111-0000-4000-8000-000000000001";
  private static final String KC_MUSA = "11111111-0000-4000-8000-000000000002";
  private static final String KC_NGOZI = "11111111-0000-4000-8000-000000000003";
  private static final String KC_IBRAHIM = "11111111-0000-4000-8000-000000000004";
  private static final String KC_ASSESSOR = "11111111-0000-4000-8000-000000000005";
  private static final String KC_OPS = "11111111-0000-4000-8000-000000000006";

  private static final long PREMIUM = Money.PREMIUM_STANDARD;

  private record SponsorSeed(
      String key, String type, String name, String shortName, String tag,
      String method, String code, String label, int day) {}

  private static final List<SponsorSeed> SPONSORS =
      List.of(
          new SponsorSeed("federal", "federal", "Fed. Min. of Education", "IPPIS", "FEDERAL",
              "payroll", "CSP-114", "IPPIS deduction code CSP-114 · OAGF approved", 28),
          new SponsorSeed("state", "state", "Lagos State Head of Service", "Lagos State payroll", "STATE",
              "payroll", "CSP-LA-07", "Schedule CSP-LA-07 · Lagos State Treasury", 26),
          new SponsorSeed("employer", "employer", "Nightingale Hospital, Ikeja", "Employer payroll", "EMPLOYER",
              "payroll", "CSP-EM-2214", "Schedule CSP-EM-2214 · monthly CSV", 25),
          new SponsorSeed("self", "self", "Self-paying members", "Direct debit", "SELF",
              "direct_debit", "MND-88214", "NIBSS e-mandate MND-88214 · card on file", 28));

  private record MemberSeed(String key, String csp, String svc, String name, String full, String msisdn) {}

  private static final List<MemberSeed> MEMBERS =
      List.of(
          new MemberSeed("federal", "CSP-114-88214", "4471208", "Adaeze Okafor", "Adaeze Nkiru Okafor", "+2348030000214"),
          new MemberSeed("state", "CSP-207-41192", "LA-88231", "Folake Adeyemi", "Folake Bisi Adeyemi", "+2348030000215"),
          new MemberSeed("employer", "CSP-322-77410", "NH-0912", "Musa Ibrahim", "Musa Sani Ibrahim", "+2348030000216"),
          new MemberSeed("self", "CSP-900-10233", null, "Chidi Eze", "Chidi Okonkwo Eze", "+2348030000217"));

  private final JdbcClient db;
  private final Nin nin;

  public DemoSeed(JdbcClient db, Nin nin) {
    this.db = db;
    this.nin = nin;
  }

  @Override
  @Transactional
  public void run(String... args) {
    // The seeder writes across every sponsor, so it is explicitly unscoped
    // rather than fighting the row-level policies it is populating.
    db.sql("SET LOCAL csp.unscoped = 'on'").update();

    for (var table :
        List.of("audit_log", "reconciliation_exceptions", "schedule_batches", "claim_documents",
            "claim_stages", "claims", "beneficiary_events", "beneficiaries", "dependants",
            "contributions", "collection_cycles", "devices", "users", "members", "sponsors")) {
      db.sql("TRUNCATE TABLE " + table + " CASCADE").update();
    }

    var sponsorIds = new java.util.HashMap<String, UUID>();
    for (var s : SPONSORS) {
      var id =
          db.sql(
                  """
                  INSERT INTO sponsors
                    (type, name, short_name, tag, method, rail_code, rail_label, collection_day)
                  VALUES (CAST(:t AS sponsor_type), :n, :sn, :tag,
                          CAST(:m AS collection_method), :code, :label, :day)
                  RETURNING id
                  """)
              .param("t", s.type()).param("n", s.name()).param("sn", s.shortName())
              .param("tag", s.tag()).param("m", s.method()).param("code", s.code())
              .param("label", s.label()).param("day", s.day())
              .query(UUID.class)
              .single();
      sponsorIds.put(s.key(), id);
    }

    var periods = periods(14);
    var inForce = periods.getFirst();

    var memberIds = new java.util.HashMap<String, UUID>();
    for (var m : MEMBERS) {
      var id =
          db.sql(
                  """
                  INSERT INTO members
                    (csp_id, sponsor_id, service_no, full_name, display_name, date_of_birth,
                     grade, msisdn, bank_mask, tier, in_force_since)
                  VALUES (:csp, :sp, :svc, :full, :name, DATE '1987-11-04',
                          'GL 12', :msisdn, 'GTBank ••4471', 'standard', :since)
                  RETURNING id
                  """)
              .param("csp", m.csp()).param("sp", sponsorIds.get(m.key())).param("svc", m.svc())
              .param("full", m.full()).param("name", m.name()).param("msisdn", m.msisdn())
              .param("since", inForce)
              .query(UUID.class)
              .single();
      memberIds.put(m.key(), id);

      db.sql(
              "INSERT INTO users (msisdn, full_name, role, member_id) VALUES (:m, :n, 'member', :id)")
          .param("m", m.msisdn()).param("n", m.full()).param("id", id)
          .update();
    }

    /*
     * The console roles, so a demo can sign in as each and see the difference
     * rather than being told about it.
     *
     * Keyed by `oidc_subject` and not by a phone number, because the console
     * door is Keycloak — an OTP sign-in is refused for these roles on purpose
     * (see AuthService: the query filters to member and next_of_kin, so a
     * preparer cannot skip TOTP by asking for an SMS). The subjects match the
     * pinned user ids in deploy/local/keycloak-realm.json. Without that pinning
     * the realm mints a random subject, resolveOidcUser finds nobody, and the
     * first sign-in silently creates a *second* Amina Bello alongside this one.
     */
    /*
     * `lastSeenDaysAgo` is part of the story, not decoration. An account nobody
     * has ever used is the one an administrator should be looking at on the
     * settings screen — and with every account showing "never signed in", which
     * is what this seed produced, that signal says nothing at all. Three people
     * who use this console and one who has never opened it is the shape of a
     * real ministry.
     */
    record Staff(String subject, String name, String email, String role, Integer lastSeenDaysAgo) {}
    for (var s :
        List.of(
            new Staff(KC_AMINA, "Amina Bello", "a.bello@education.gov.ng", "sponsor_preparer", 0),
            new Staff(KC_MUSA, "Musa Danjuma", "m.danjuma@education.gov.ng", "sponsor_approver", 2),
            new Staff(KC_NGOZI, "Ngozi Eze", "n.eze@education.gov.ng", "sponsor_viewer", 23),
            new Staff(KC_IBRAHIM, "Ibrahim Sule", "i.sule@education.gov.ng", "sponsor_admin", null))) {
      db.sql(
              """
              INSERT INTO users (oidc_subject, full_name, email, role, sponsor_id, last_seen_at)
              VALUES (:s, :n, :e, CAST(:r AS user_role), :sp,
                      CASE WHEN CAST(:days AS int) IS NULL THEN NULL
                           ELSE now() - make_interval(days => CAST(:days AS int)) END)
              """)
          .param("s", s.subject()).param("n", s.name()).param("e", s.email())
          .param("r", s.role()).param("sp", sponsorIds.get("federal"))
          .param("days", s.lastSeenDaysAgo())
          .update();
    }
    // No sponsor_id: an assessor reads claims across rails and CSP operations
    // administers the scheme itself. Scoping either to one MDA would be wrong.
    db.sql(
            """
            INSERT INTO users (oidc_subject, full_name, email, role) VALUES
              (:assessor, 'A. Bello', 'assessor@csp.ng', 'assessor'),
              (:ops, 'CSP Operations', 'ops@csp.ng', 'csp_admin')
            """)
        .param("assessor", KC_ASSESSOR)
        .param("ops", KC_OPS)
        .update();

    var adaeze = memberIds.get("federal");
    seedBeneficiaries(adaeze);
    seedLedger(sponsorIds, memberIds, periods);
    seedClaim(adaeze);

    log.info("seeded {} sponsors, {} members", SPONSORS.size(), MEMBERS.size());
    log.info("  member app — sign in with a phone number and the SMS code:");
    log.info("    +234 803 000 0214   Adaeze Okafor (federal rail)");
    log.info("  console — sign in through Keycloak (username / password):");
    log.info("    amina    / password   Amina Bello    preparer");
    log.info("    musa     / password   Musa Danjuma   approver");
    log.info("    ngozi    / password   Ngozi Eze      viewer");
    log.info("    ibrahim  / password   Ibrahim Sule   admin");
    log.info("    assessor / password   A. Bello       assessor");
    log.info("    ops      / password   CSP Operations csp_admin");
  }

  /**
   * Chinedu 60 / Ngozi 40 / Emeka 0 — including the named-but-unshared third person.
   *
   * <p>Only the spouse carries a NIN. The two children are minors and a minor does not have one, so
   * they are on file with a birth certificate instead — which is why {@code ninOnFile} is a per-row
   * fact and not a property of the member. The screens say "NIN on file" or "Birth cert. on file"
   * off the back of it, and seeding nobody a NIN made an adult look like a child.
   *
   * <p>The number itself is stored the only two ways it may be: an HMAC to match on and AES-GCM
   * ciphertext to re-transmit. Never in the clear, and never returned by the API.
   */
  private void seedBeneficiaries(UUID memberId) {
    record Bene(String name, String relation, String msisdn, String nin, int share) {}
    var people =
        List.of(
            new Bene("Chinedu Okafor", "Spouse", "+2348030000118", "22233344455", 60),
            new Bene("Ngozi Okafor", "Daughter", "+2348060000903", null, 40),
            new Bene("Emeka Okafor", "Son", null, null, 0));
    for (int i = 0; i < people.size(); i++) {
      var p = people.get(i);
      db.sql(
              """
              INSERT INTO beneficiaries
                (member_id, full_name, relation, msisdn, nin_hmac, nin_ciphertext, share_pct, position)
              VALUES (:m, :n, :r, :msisdn, :ninHmac, :ninCipher, :s, :pos)
              """)
          .param("m", memberId).param("n", p.name()).param("r", p.relation())
          .param("msisdn", p.msisdn())
          .param("ninHmac", p.nin() == null ? null : nin.hmac(p.nin()))
          .param("ninCipher", p.nin() == null ? null : nin.encrypt(p.nin()))
          .param("s", p.share()).param("pos", i)
          .update();
    }
    // Dated back so the demo's "last confirmed 14 months ago" nudge is true.
    db.sql(
            """
            INSERT INTO beneficiary_events (member_id, action, created_at)
            VALUES (:m, 'confirmed', now() - interval '14 months')
            """)
        .param("m", memberId)
        .update();

    db.sql(
            """
            INSERT INTO dependants
              (member_id, full_name, relation, date_of_birth, sum_assured_minor, premium_minor)
            VALUES (:m, 'Chinedu Okafor', 'Spouse', DATE '1985-03-12', :s1, :p1),
                   (:m, 'Ngozi Okafor', 'Daughter', DATE '2012-07-04', :s2, :p2)
            """)
        .param("m", memberId)
        .param("s1", Money.naira(2_000_000)).param("p1", Money.naira(1_200))
        .param("s2", Money.naira(500_000)).param("p2", Money.naira(600))
        .update();
  }

  private void seedLedger(
      java.util.Map<String, UUID> sponsorIds, java.util.Map<String, UUID> memberIds, List<LocalDate> periods) {

    var closed = periods.subList(0, periods.size() - 1);
    var current = periods.getLast();

    for (var m : MEMBERS) {
      var sponsor = SPONSORS.stream().filter(s -> s.key().equals(m.key())).findFirst().orElseThrow();
      var sponsorId = sponsorIds.get(m.key());
      var memberId = memberIds.get(m.key());
      var source = "payroll".equals(sponsor.method()) ? "payroll" : "direct_debit";

      for (var period : closed) {
        db.sql("SELECT csp.ensure_contribution_partition(:p)").param("p", period).query(String.class).single();
        var cycleId =
            db.sql(
                    """
                    INSERT INTO collection_cycles
                      (sponsor_id, period, state, rail_ref, scheduled_count, scheduled_minor,
                       sent_at, returned_at, closed_at)
                    VALUES (:s, :p, 'closed', :ref, 1, :minor, now(), now(), now())
                    ON CONFLICT (sponsor_id, period) DO UPDATE SET state = 'closed'
                    RETURNING id
                    """)
                .param("s", sponsorId).param("p", period)
                .param("ref", "%s/%02d".formatted(sponsor.code(), period.getMonthValue()))
                .param("minor", PREMIUM)
                .query(UUID.class)
                .single();
        db.sql(
                """
                INSERT INTO contributions
                  (member_id, cycle_id, period, amount_minor, source, status, rail_ref, received_at)
                VALUES (:m, :c, :p, :amt, CAST(:src AS contribution_source), 'confirmed', :ref, now())
                """)
            .param("m", memberId).param("c", cycleId).param("p", period)
            .param("amt", PREMIUM).param("src", source).param("ref", sponsor.code())
            .update();
      }

      // The open cycle, with exceptions on it — what the console shows.
      db.sql("SELECT csp.ensure_contribution_partition(:p)").param("p", current).query(String.class).single();
      var openCycle =
          db.sql(
                  """
                  INSERT INTO collection_cycles
                    (sponsor_id, period, state, rail_ref, scheduled_count, scheduled_minor,
                     sent_at, returned_at)
                  VALUES (:s, :p, 'reconciling', :ref, 8412, :minor,
                          now() - interval '26 days', now() - interval '2 days')
                  ON CONFLICT (sponsor_id, period) DO UPDATE SET state = 'reconciling'
                  RETURNING id
                  """)
              .param("s", sponsorId).param("p", current)
              .param("ref", "%s/%02d".formatted(sponsor.code(), current.getMonthValue()))
              .param("minor", PREMIUM * 8412)
              .query(UUID.class)
              .single();
      db.sql(
              """
              INSERT INTO contributions
                (member_id, cycle_id, period, amount_minor, source, status, rail_ref)
              VALUES (:m, :c, :p, :amt, CAST(:src AS contribution_source), 'expected', :ref)
              """)
          .param("m", memberId).param("c", openCycle).param("p", current)
          .param("amt", PREMIUM).param("src", source).param("ref", sponsor.code())
          .update();

      seedExceptions(openCycle, memberId, "payroll".equals(sponsor.method()));
    }
  }

  /** Exception kinds are rail-specific: a file mismatches, a bank refuses. */
  private void seedExceptions(UUID cycleId, UUID memberId, boolean payroll) {
    record Exc(String kind, String name, String svc, String resp, long expected, long received, boolean linked) {}
    var rows =
        payroll
            ? List.of(
                new Exc("unmatched", "ADAEZE N OKAFOR", "4471209", null, PREMIUM, PREMIUM, false),
                new Exc("no_deduction", null, null, null, PREMIUM, 0, true),
                new Exc("wrong_amount", null, null, null, PREMIUM, Money.naira(1_500), true))
            : List.of(
                new Exc("no_funds", null, null, "51 · INSUFFICIENT FUNDS", PREMIUM, 0, true),
                new Exc("mandate_revoked", null, null, "57 · MANDATE REVOKED", PREMIUM, 0, false));

    for (var e : rows) {
      db.sql(
              """
              INSERT INTO reconciliation_exceptions
                (cycle_id, member_id, kind, name_as_written, service_no_as_written,
                 rail_response, expected_minor, received_minor)
              VALUES (:c, :m, CAST(:k AS exception_kind), :n, :svc, :resp, :exp, :rec)
              """)
          .param("c", cycleId).param("m", e.linked() ? memberId : null).param("k", e.kind())
          .param("n", e.name()).param("svc", e.svc()).param("resp", e.resp())
          .param("exp", e.expected()).param("rec", e.received())
          .update();
    }
  }

  private void seedClaim(UUID memberId) {
    var year = LocalDate.now(ZoneOffset.UTC).getYear();
    var claimId =
        db.sql(
                """
                INSERT INTO claims
                  (claim_ref, member_id, type, state, claimant_relation, amount_minor)
                VALUES (:ref, :m, 'funeral_advance', 'assessing', 'Spouse', :amt)
                RETURNING id
                """)
            .param("ref", "CLM-%d-0091".formatted(year))
            .param("m", memberId)
            .param("amt", Money.naira(250_000))
            .query(UUID.class)
            .single();

    record StageSeed(String key, String note, String state, int daysAgo) {}
    for (var s :
        List.of(
            new StageSeed("submitted", "You told us", "done", 4),
            new StageSeed("documents_received", "We received your papers", "done", 3),
            new StageSeed("assessing", "We are checking them", "current", 2))) {
      db.sql(
              """
              INSERT INTO claim_stages (claim_id, stage_key, state, note, occurred_at)
              VALUES (:c, :k, :s, :n, now() - CAST(:d AS interval))
              """)
          .param("c", claimId).param("k", s.key()).param("s", s.state())
          .param("n", s.note()).param("d", s.daysAgo() + " days")
          .update();
    }
    for (var key : List.of("death_certificate", "claimant_id")) {
      db.sql(
              """
              INSERT INTO claim_documents (claim_id, doc_key, state, uploaded_at)
              VALUES (:c, :k, 'received', now() - interval '3 days')
              """)
          .param("c", claimId).param("k", key)
          .update();
    }
  }

  /** {@code count} months ending with the current one, as period first-days. */
  private static List<LocalDate> periods(int count) {
    var thisMonth = LocalDate.now(ZoneOffset.UTC).withDayOfMonth(1);
    return java.util.stream.IntStream.range(0, count)
        .mapToObj(i -> thisMonth.minusMonths(count - 1L - i))
        .toList();
  }
}
