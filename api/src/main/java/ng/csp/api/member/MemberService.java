package ng.csp.api.member;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import ng.csp.api.auth.SessionUser;
import ng.csp.api.domain.Nin;
import ng.csp.api.domain.Pricing;
import ng.csp.api.domain.Rails;
import ng.csp.api.web.ApiException;
import ng.csp.api.web.Rows;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class MemberService {

  private final JdbcClient db;
  /** The context's mapper, so the audit trail is serialised exactly as a response body is. */
  private final ObjectMapper json;
  private final Nin nin;

  public MemberService(JdbcClient db, ObjectMapper json, Nin nin) {
    this.db = db;
    this.json = json;
    this.nin = nin;
  }

  // ── Records on the wire ────────────────────────────────────────────────────

  public record MemberInfo(String name, String fullName, String cspId, String grade) {}

  public record SponsorInfo(
      UUID id, String type, String name, String shortName, String method, String rail, String ref) {}

  /**
   * The cover a member holds, and what it costs them.
   *
   * <p>The price is here rather than worked out by a screen: the family-cover page adds it to the
   * dependants' premiums to show one figure somebody is deciding about, and a client that
   * multiplies is a client that can be out of date about money.
   */
  public record CoverInfo(String tier, long sumAssuredMinor, long premiumMinor, LocalDate inForceSince) {}

  public record CollectionInfo(
      String state,
      LocalDate lastPeriod,
      LocalDate nextDate,
      Instant answerDueAt,
      Instant cardFallbackAt,
      Instant gracePeriodEndsAt) {}

  /** Ranked by the server. Three surfaces render this and they must agree. */
  public record Attention(String key, String severity) {}

  public record Summary(
      MemberInfo member,
      SponsorInfo sponsor,
      CoverInfo cover,
      CollectionInfo collection,
      List<Attention> attention) {}

  private record MemberRow(
      UUID id,
      String cspId,
      String fullName,
      String displayName,
      String grade,
      String tier,
      LocalDate inForceSince,
      UUID sponsorId,
      String sponsorType,
      String sponsorName,
      String sponsorShort,
      String railCode,
      String railLabel,
      int collectionDay,
      String method) {}

  private MemberRow load(UUID memberId) {
    return db.sql(
            """
            SELECT m.id, m.csp_id, m.full_name, m.display_name, m.grade, m.tier, m.in_force_since,
                   s.id AS sponsor_id, s.type::text AS sponsor_type, s.name AS sponsor_name,
                   s.short_name, s.rail_code, s.rail_label, s.collection_day, s.method::text AS method
              FROM members m JOIN sponsors s ON s.id = m.sponsor_id
             WHERE m.id = :id
            """)
        .param("id", memberId)
        .query(
            (rs, n) ->
                new MemberRow(
                    rs.getObject("id", UUID.class),
                    rs.getString("csp_id"),
                    rs.getString("full_name"),
                    rs.getString("display_name"),
                    rs.getString("grade"),
                    rs.getString("tier"),
                    rs.getObject("in_force_since", LocalDate.class),
                    rs.getObject("sponsor_id", UUID.class),
                    rs.getString("sponsor_type"),
                    rs.getString("sponsor_name"),
                    rs.getString("short_name"),
                    rs.getString("rail_code"),
                    rs.getString("rail_label"),
                    rs.getInt("collection_day"),
                    rs.getString("method")))
        .optional()
        .orElseThrow(() -> ApiException.notFound("No such member."));
  }

  /**
   * One call paints the whole dashboard.
   *
   * <p>{@code attention} is ranked here rather than in the client, because three surfaces render it
   * and they must agree on what the most important thing is. Letting each decide is how the phone
   * nags about a beneficiary while the web nags about a late deduction, for the same person, on the
   * same morning.
   */
  public Summary summary(UUID memberId, Instant now) {
    var m = load(memberId);
    var method = Rails.methodFor(Rails.SponsorType.fromWire(m.sponsorType()));

    var latest =
        db.sql(
                """
                SELECT period, status::text AS status FROM contributions
                 WHERE member_id = :id AND source <> 'reversal'
                 ORDER BY period DESC, created_at DESC LIMIT 1
                """)
            .param("id", memberId)
            .query((rs, n) -> Map.entry(rs.getObject("period", LocalDate.class), rs.getString("status")))
            .optional();

    var period = latest.map(Map.Entry::getKey).orElseGet(() -> LocalDate.now(java.time.ZoneOffset.UTC).withDayOfMonth(1));
    var confirmed = latest.map(Map.Entry::getValue).filter("confirmed"::equals).isPresent();
    var state = Rails.collectionState(period, method, confirmed, now);
    var timeline = Rails.timelineFor(period, method);

    var shareTotal =
        db.sql("SELECT COALESCE(SUM(share_pct), 0)::int FROM beneficiaries WHERE member_id = :id")
            .param("id", memberId)
            .query(Integer.class)
            .single();
    var lastConfirmed =
        db.sql(
                """
                SELECT max(created_at) FROM beneficiary_events
                 WHERE member_id = :id AND action = 'confirmed'
                """)
            .param("id", memberId)
            .query(Instant.class)
            .optional()
            .orElse(null);

    var attention = new ArrayList<Attention>();
    if (state == Rails.CollectionState.LAPSED) {
      attention.add(new Attention("cover_lapsed", "urgent"));
    } else if (state == Rails.CollectionState.LATE) {
      attention.add(new Attention("collection_late", "attention"));
    }
    if (lastConfirmed == null || ChronoUnit.MONTHS.between(lastConfirmed.atZone(java.time.ZoneOffset.UTC), now.atZone(java.time.ZoneOffset.UTC)) >= 12) {
      attention.add(new Attention("confirm_beneficiaries", "attention"));
    }
    if (shareTotal != 100) {
      attention.add(new Attention("shares_incomplete", "attention"));
    }

    return new Summary(
        new MemberInfo(m.displayName(), m.fullName(), m.cspId(), m.grade()),
        new SponsorInfo(
            m.sponsorId(), m.sponsorType(), m.sponsorName(), m.sponsorShort(),
            m.method(), m.railLabel(), m.railCode()),
        new CoverInfo(
            m.tier(), Pricing.sumAssuredFor(m.tier()), Pricing.priceFor(m.tier()), m.inForceSince()),
        new CollectionInfo(
            state.wire(),
            latest.map(Map.Entry::getKey).orElse(null),
            period.withDayOfMonth(Math.min(m.collectionDay(), period.lengthOfMonth())),
            timeline.answerDueAt(),
            timeline.cardFallbackAt(),
            timeline.graceEndsAt()),
        List.copyOf(attention));
  }

  // ── Card ───────────────────────────────────────────────────────────────────

  public record Card(
      String cspId,
      String tier,
      LocalDate inForceSince,
      String collectedBy,
      String qrPayload,
      String signature,
      Instant expiresAt,
      String printUrl) {}

  public Card card(UUID memberId, CardSigner signer) {
    var m = load(memberId);
    var signed = signer.sign(m.cspId(), m.tier(), m.inForceSince());
    return new Card(
        m.cspId(), m.tier(), m.inForceSince(), m.railLabel(),
        signed.qrPayload(), signed.signature(), signed.expiresAt(), "/v1/members/me/card.pdf");
  }

  /** Narrow seam so {@link MemberService} does not depend on the crypto. */
  public interface CardSigner {
    SignedCard sign(String cspId, String tier, LocalDate inForceSince);
  }

  public record SignedCard(String qrPayload, String signature, Instant expiresAt) {}

  // ── Ledger ─────────────────────────────────────────────────────────────────

  public record LedgerRow(
      LocalDate period,
      long amountMinor,
      String source,
      String status,
      String railRef,
      Instant receivedAt,
      UUID reversesId) {}

  public record Totals(long paidMinor, int monthsCovered) {}

  public record Ledger(List<LedgerRow> rows, Totals totals) {}

  public Ledger contributions(UUID memberId, LocalDate from, LocalDate to, String status, int limit) {
    var rows =
        db.sql(
                """
                SELECT period, amount_minor, source::text AS source, status::text AS status,
                       rail_ref, received_at, reverses_id
                  FROM contributions
                 WHERE member_id = :id
                   AND (CAST(:from AS date) IS NULL OR period >= CAST(:from AS date))
                   AND (CAST(:to   AS date) IS NULL OR period <= CAST(:to   AS date))
                   AND (CAST(:status AS text) IS NULL OR status::text = CAST(:status AS text))
                 ORDER BY period DESC, created_at DESC
                 LIMIT :limit
                """)
            .param("id", memberId)
            .param("from", from)
            .param("to", to)
            .param("status", status)
            .param("limit", limit)
            .query(
                (rs, n) ->
                    new LedgerRow(
                        rs.getObject("period", LocalDate.class),
                        rs.getLong("amount_minor"),
                        rs.getString("source"),
                        rs.getString("status"),
                        rs.getString("rail_ref"),
                        Rows.instant(rs, "received_at"),
                        rs.getObject("reverses_id", UUID.class)))
            .list();

    var totals =
        db.sql(
                """
                SELECT COALESCE(SUM(amount_minor), 0) AS paid, COUNT(DISTINCT period)::int AS months
                  FROM contributions WHERE member_id = :id AND status = 'confirmed'
                """)
            .param("id", memberId)
            .query((rs, n) -> new Totals(rs.getLong("paid"), rs.getInt("months")))
            .single();

    return new Ledger(rows, totals);
  }

  // ── Beneficiaries ──────────────────────────────────────────────────────────

  /**
   * A beneficiary as the member sees them.
   *
   * <p>No NIN. It is L3 and stored only as an HMAC plus ciphertext, so there is nothing to show
   * that is not either useless or a leak. {@code ninOnFile} is what a member actually needs to
   * know — whether a claim will move in days or in weeks.
   */
  public record Person(
      UUID id, String name, String relation, String msisdn, boolean ninOnFile, int sharePct) {}

  public record BeneficiarySet(List<Person> people, Instant lastConfirmedAt) {}

  public BeneficiarySet beneficiaries(UUID memberId) {
    var people =
        db.sql(
                """
                SELECT id, full_name, relation, msisdn,
                       nin_hmac IS NOT NULL AS nin_on_file, share_pct
                  FROM beneficiaries WHERE member_id = :id ORDER BY position
                """)
            .param("id", memberId)
            .query(
                (rs, n) ->
                    new Person(
                        rs.getObject("id", UUID.class),
                        rs.getString("full_name"),
                        rs.getString("relation"),
                        rs.getString("msisdn"),
                        rs.getBoolean("nin_on_file"),
                        rs.getInt("share_pct")))
            .list();
    var last =
        db.sql(
                """
                SELECT max(created_at) FROM beneficiary_events
                 WHERE member_id = :id AND action = 'confirmed'
                """)
            .param("id", memberId)
            .query(Instant.class)
            .optional()
            .orElse(null);
    return new BeneficiarySet(people, last);
  }

  public record PersonInput(String name, String relation, String msisdn, String nin, int sharePct) {}

  /**
   * Replace the whole set in one transaction.
   *
   * <p>PUT rather than PATCH deliberately: a half-saved split — 60% here, nothing there — is the one
   * state this record must never be in, and the only way to guarantee that is to make a partial
   * update unexpressible.
   */
  @Transactional
  public void replaceBeneficiaries(SessionUser session, List<PersonInput> people) {
    var total = people.stream().mapToInt(PersonInput::sharePct).sum();
    if (total != 100) {
      throw ApiException.conflict("shares_not_100", "Shares total %d%%, not 100%%.".formatted(total));
    }
    var memberId = session.requireMemberId();

    var before =
        db.sql(
                "SELECT full_name, relation, share_pct FROM beneficiaries WHERE member_id = :id ORDER BY position")
            .param("id", memberId)
            .query(
                (rs, n) ->
                    Map.of(
                        "name", rs.getString("full_name"),
                        "relation", rs.getString("relation"),
                        "sharePct", rs.getInt("share_pct")))
            .list();

    // The share check is a statement-level trigger, so clearing and reinserting
    // inside one transaction is legal while a partial write is not.
    db.sql("DELETE FROM beneficiaries WHERE member_id = :id").param("id", memberId).update();
    for (int i = 0; i < people.size(); i++) {
      var p = people.get(i);
      db.sql(
              """
              INSERT INTO beneficiaries
                (member_id, full_name, relation, msisdn, nin_hmac, nin_ciphertext, share_pct, position)
              VALUES (:m, :name, :rel, :msisdn, :ninHmac, :ninCipher, :share, :pos)
              """)
          .param("m", memberId)
          .param("name", p.name())
          .param("rel", p.relation())
          .param("msisdn", p.msisdn())
          .param("ninHmac", nin.hmac(p.nin()))
          .param("ninCipher", nin.encrypt(p.nin()))
          .param("share", p.sharePct())
          .param("pos", i)
          .update();
    }
    writeEvent(memberId, session.userId(), "replaced", before, people);
  }

  @Transactional
  public Instant confirmBeneficiaries(SessionUser session) {
    writeEvent(session.requireMemberId(), session.userId(), "confirmed", null, null);
    return Instant.now();
  }

  private void writeEvent(UUID memberId, UUID actor, String action, Object before, Object after) {
    db.sql(
            """
            INSERT INTO beneficiary_events (member_id, actor_user_id, action, before, after)
            VALUES (:m, :a, :action, CAST(:before AS jsonb), CAST(:after AS jsonb))
            """)
        .param("m", memberId)
        .param("a", actor)
        .param("action", action)
        .param("before", write(before))
        .param("after", write(after))
        .update();
  }

  private String write(Object value) {
    return value == null ? null : json.writeValueAsString(value);
  }

  // ── Dependants ─────────────────────────────────────────────────────────────

  public record Dependant(
      UUID id, String name, String relation, LocalDate dob, long sumAssuredMinor, long premiumMinor, boolean active) {}

  public List<Dependant> dependants(UUID memberId) {
    return db.sql(
            """
            SELECT id, full_name, relation, date_of_birth, sum_assured_minor, premium_minor, active
              FROM dependants WHERE member_id = :id ORDER BY date_of_birth
            """)
        .param("id", memberId)
        .query(
            (rs, n) ->
                new Dependant(
                    rs.getObject("id", UUID.class),
                    rs.getString("full_name"),
                    rs.getString("relation"),
                    rs.getObject("date_of_birth", LocalDate.class),
                    rs.getLong("sum_assured_minor"),
                    rs.getLong("premium_minor"),
                    rs.getBoolean("active")))
        .list();
  }

  public record RemovedDependant(String name, long newPremiumMinor, LocalDate coveredUntil, LocalDate effectiveFrom) {}

  /**
   * Take a dependant off the cover.
   *
   * <p>Deactivated, not deleted. The row is what says this person was covered from March to
   * September, and a claim in that window is assessed against it — a delete would leave a family
   * arguing about cover that the record no longer remembers.
   *
   * <p>Cover runs to the end of the month that has been paid for, and the premium drops from the
   * next one. Ending it on the day somebody pressed the button would take back cover that was
   * already bought.
   */
  @Transactional
  public RemovedDependant removeDependant(UUID memberId, UUID dependantId) {
    var name =
        db.sql(
                """
                SELECT full_name FROM dependants
                 WHERE id = :d AND member_id = :m AND active
                """)
            .param("d", dependantId)
            .param("m", memberId)
            .query(String.class)
            .optional()
            .orElseThrow(() -> ApiException.notFound("No such dependant on your cover."));

    db.sql("UPDATE dependants SET active = false WHERE id = :d AND member_id = :m")
        .param("d", dependantId)
        .param("m", memberId)
        .update();

    var total =
        db.sql("SELECT COALESCE(SUM(premium_minor), 0) FROM dependants WHERE member_id = :m AND active")
            .param("m", memberId)
            .query(Long.class)
            .single();

    var today = LocalDate.now(java.time.ZoneOffset.UTC);
    var nextMonth = today.withDayOfMonth(1).plusMonths(1);
    return new RemovedDependant(name, total, nextMonth.minusDays(1), nextMonth);
  }

  public record AddedDependant(String band, long sumAssuredMinor, long premiumMinor, long newPremiumMinor, LocalDate effectiveFrom) {}

  /**
   * The premium is quoted here for the age band. The client never multiplies, so a cheaper number
   * cannot be produced by an out-of-date app or by anyone editing a request.
   */
  @Transactional
  public AddedDependant addDependant(UUID memberId, String name, String relation, LocalDate dob) {
    var quote = Pricing.quoteDependant(dob, LocalDate.now(java.time.ZoneOffset.UTC));
    db.sql(
            """
            INSERT INTO dependants (member_id, full_name, relation, date_of_birth, sum_assured_minor, premium_minor)
            VALUES (:m, :name, :rel, :dob, :sum, :premium)
            """)
        .param("m", memberId)
        .param("name", name)
        .param("rel", relation)
        .param("dob", dob)
        .param("sum", quote.sumAssuredMinor())
        .param("premium", quote.premiumMinor())
        .update();

    var total =
        db.sql("SELECT COALESCE(SUM(premium_minor), 0) FROM dependants WHERE member_id = :m AND active")
            .param("m", memberId)
            .query(Long.class)
            .single();

    return new AddedDependant(
        quote.band(), quote.sumAssuredMinor(), quote.premiumMinor(), total,
        LocalDate.now(java.time.ZoneOffset.UTC).withDayOfMonth(1).plusMonths(1));
  }
}
