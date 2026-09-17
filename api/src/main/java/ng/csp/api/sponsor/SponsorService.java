package ng.csp.api.sponsor;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import ng.csp.api.auth.MakerChecker;
import ng.csp.api.auth.Permission;
import ng.csp.api.auth.SessionUser;
import ng.csp.api.domain.Rails;
import ng.csp.api.schedule.ScheduleLoader;
import ng.csp.api.web.ApiException;
import ng.csp.api.web.Rows;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class SponsorService {

  private final JdbcClient db;
  private final ScheduleLoader loader;
  private final ObjectMapper json;

  public SponsorService(JdbcClient db, ObjectMapper json, ScheduleLoader loader) {
    this.db = db;
    this.json = json;
    this.loader = loader;
  }

  public record SponsorInfo(
      UUID id, String name, String shortName, String tag, String type, String method, String railCode) {}

  public record CycleInfo(
      UUID id, LocalDate period, String state, String railRef,
      int scheduledCount, long scheduledMinor, Instant sentAt, Instant returnedAt) {}

  public record RosterInfo(int members, int withoutBeneficiary) {}

  public record ExceptionSummary(long total, long open, Map<String, Object> byKind) {}

  public record Dashboard(
      SponsorInfo sponsor, CycleInfo cycle, RosterInfo roster, ExceptionSummary exceptions) {}

  SponsorInfo sponsorOr404(UUID sponsorId) {
    return db.sql(
            """
            SELECT id, name, short_name, tag, type::text AS type,
                   method::text AS method, rail_code
              FROM sponsors WHERE id = :id
            """)
        .param("id", sponsorId)
        .query(
            (rs, n) ->
                new SponsorInfo(
                    rs.getObject("id", UUID.class),
                    rs.getString("name"),
                    rs.getString("short_name"),
                    rs.getString("tag"),
                    rs.getString("type"),
                    rs.getString("method"),
                    rs.getString("rail_code")))
        .optional()
        .orElseThrow(() -> ApiException.notFound("No such sponsor."));
  }

  /** The console's home screen: this month, in one call. */
  public Dashboard dashboard(UUID sponsorId) {
    var sponsor = sponsorOr404(sponsorId);

    var cycle =
        db.sql(
                """
                SELECT id, period, state::text AS state, rail_ref, scheduled_count,
                       scheduled_minor, sent_at, returned_at
                  FROM collection_cycles WHERE sponsor_id = :id
                 ORDER BY period DESC LIMIT 1
                """)
            .param("id", sponsorId)
            .query(
                (rs, n) ->
                    new CycleInfo(
                        rs.getObject("id", UUID.class),
                        rs.getObject("period", LocalDate.class),
                        rs.getString("state"),
                        rs.getString("rail_ref"),
                        rs.getInt("scheduled_count"),
                        rs.getLong("scheduled_minor"),
                        Rows.instant(rs, "sent_at"),
                        Rows.instant(rs, "returned_at")))
            .optional()
            .orElse(null);

    var members =
        db.sql("SELECT count(*)::int FROM members WHERE sponsor_id = :id")
            .param("id", sponsorId)
            .query(Integer.class)
            .single();

    var noBeneficiary =
        db.sql(
                """
                SELECT count(*)::int FROM members m
                 WHERE m.sponsor_id = :id AND NOT m.has_payee_beneficiary
                """)
            .param("id", sponsorId)
            .query(Integer.class)
            .single();

    var summary = cycle == null ? emptySummary() : summaryFor(cycle.id());

    return new Dashboard(sponsor, cycle, new RosterInfo(members, noBeneficiary), summary);
  }

  ExceptionSummary summaryFor(UUID cycleId) {
    return db.sql("SELECT total, open, by_kind FROM cycle_exception_summary WHERE cycle_id = :id")
        .param("id", cycleId)
        .query(
            (rs, n) -> {
              var raw = rs.getString("by_kind");
              Map<String, Object> byKind =
                  raw == null ? Map.of() : json.readValue(raw, Map.class);
              return new ExceptionSummary(rs.getLong("total"), rs.getLong("open"), byKind);
            })
        .optional()
        .orElseGet(SponsorService::emptySummary);
  }

  private static ExceptionSummary emptySummary() {
    return new ExceptionSummary(0, 0, Map.of());
  }

  // ── Schedule upload ────────────────────────────────────────────────────────

  public record ScheduleRow(String serviceNo, String name, long amountMinor) {}

  public record Rejected(int row, String reason) {}

  /**
   * What an upload answers with.
   *
   * <p>No rejection list: rejection is decided by the job's match step, which has not run yet.
   * Returning an empty one would be claiming every row was fine before anything had looked at them.
   * The list is on the batch when it finishes.
   */
  public record UploadResult(UUID cycleId, UUID batchId, int rowCount) {}

  /**
   * Upload the month's schedule. A preparer's job.
   *
   * <p>Take a payroll schedule and start turning it into money owed.
   *
   * <p>Returns as soon as the rows are safely written down, not when they are loaded. A federal
   * schedule is 8,412 rows and the spec's ceiling is a million; an HTTP request that runs for
   * minutes gets cut by a proxy, abandoned by a browser and retried by an officer, and the retry
   * produces a second million rows. So this stages and hands off — see ScheduleLoader and
   * ScheduleLoadJob — and the console watches the batch.
   */
  @Transactional
  public UploadResult uploadSchedule(
      SessionUser session, UUID sponsorId, LocalDate period, String filename, List<ScheduleRow> rows) {

    var sponsor = sponsorOr404(sponsorId);
    if (!"payroll".equals(sponsor.method())) {
      throw ApiException.conflict(
          "no_schedule_on_this_rail",
          "Self-paying sponsors have no schedule to send — collection is by direct debit.");
    }

    db.sql("SELECT csp.ensure_contribution_partition(:p)").param("p", period).query(String.class).single();

    /*
     * The cycle is created with zero totals and filled in by the job's last
     * step, from what was actually loaded. A file claiming a million rows and a
     * load that produced 900,000 contributions disagree, and the number worth
     * having is the one backed by rows.
     */
    var railRef = "%s/%02d".formatted(sponsor.railCode(), period.getMonthValue());
    var cycleId =
        db.sql(
                """
                INSERT INTO collection_cycles
                  (sponsor_id, period, state, rail_ref, scheduled_count, scheduled_minor, sent_at)
                VALUES (:s, :p, 'sent', :ref, 0, 0, now())
                ON CONFLICT (sponsor_id, period) DO UPDATE
                  SET state = 'sent', sent_at = now()
                RETURNING id
                """)
            .param("s", sponsorId)
            .param("p", period)
            .param("ref", railRef)
            .query(UUID.class)
            .single();

    var batchId =
        loader.stage(
            cycleId,
            filename,
            session.userId(),
            rows.stream()
                .map(r -> new ScheduleLoader.Row(r.serviceNo(), r.name(), r.amountMinor()))
                .toList());

    audit(session, sponsorId, "schedule.uploaded", "cycle", cycleId.toString(),
        Map.of("period", period.toString(), "rows", rows.size(), "batch", batchId.toString()));

    loader.launch(batchId, sponsorId, cycleId, period, sponsor.railCode());

    // Nothing is rejected yet — rejection is decided by the match step, and the
    // list is on the batch once it finishes. Reporting an empty list here would
    // be claiming every row was fine before anything had looked.
    return new UploadResult(cycleId, batchId, rows.size());
  }

  /** Progress, for the console to poll while a load runs. */
  public ScheduleLoader.Batch batchStatus(UUID batchId) {
    return loader.status(batchId);
  }

  // ── Reconciliation ─────────────────────────────────────────────────────────

  public record ExceptionRow(
      UUID id, UUID memberId, String memberName, String cspId, String ourServiceNo,
      String kind, String nameAsWritten, String serviceNoAsWritten, String railResponse,
      long expectedMinor, long receivedMinor,
      String proposedAction, String proposedNote, Instant proposedAt,
      String resolvedAction, String resolvedNote, Instant resolvedAt) {}

  public record Reconciliation(
      String method, int matched, List<ExceptionRow> exceptions, ExceptionSummary summary) {}

  // ── Remittances ─────────────────────────────────────────────────────────────

  /**
   * One month's money, as the ledger has it.
   *
   * <p>A credit arriving is not cover. On a payroll rail one transfer covers thousands of members,
   * and it only becomes cover when it is matched to the return file member by member — so
   * {@code receivedMinor} is the sum of what was actually credited to members, not a number a bank
   * statement quoted. The difference between that and {@code scheduledMinor} is the variance
   * somebody has to explain.
   */
  public record Remittance(
      UUID cycleId,
      LocalDate period,
      String state,
      String railRef,
      Instant valueDate,
      long scheduledMinor,
      long receivedMinor,
      int scheduledCount,
      int creditedCount,
      long varianceMinor,
      int openExceptions) {}

  /**
   * The last year of them, newest first.
   *
   * <p>Derived rather than stored. A remittances table would be a second place for the same facts
   * and a second thing to keep true: the cycle already says what was asked for, the contributions
   * say what arrived, and the exceptions say what is still unexplained. A figure that disagrees with
   * the ledger is worse than no figure, because it will be believed.
   */
  public List<Remittance> remittances(UUID sponsorId, int limit) {
    return db.sql(
            """
            SELECT c.id, c.period, c.state::text AS state, c.rail_ref, c.returned_at,
                   c.scheduled_count, c.scheduled_minor,
                   COALESCE((SELECT SUM(k.amount_minor) FROM contributions k
                              WHERE k.cycle_id = c.id AND k.status = 'confirmed'), 0) AS received,
                   COALESCE((SELECT count(*) FROM contributions k
                              WHERE k.cycle_id = c.id AND k.status = 'confirmed'), 0) AS credited,
                   COALESCE((SELECT count(*) FROM reconciliation_exceptions e
                              WHERE e.cycle_id = c.id AND e.resolved_at IS NULL), 0) AS open_exceptions
              FROM collection_cycles c
             WHERE c.sponsor_id = :s
             ORDER BY c.period DESC
             LIMIT :limit
            """)
        .param("s", sponsorId)
        .param("limit", limit)
        .query(
            (rs, n) -> {
              var scheduled = rs.getLong("scheduled_minor");
              var received = rs.getLong("received");
              return new Remittance(
                  rs.getObject("id", UUID.class),
                  rs.getObject("period", LocalDate.class),
                  rs.getString("state"),
                  rs.getString("rail_ref"),
                  Rows.instant(rs, "returned_at"),
                  scheduled,
                  received,
                  rs.getInt("scheduled_count"),
                  rs.getInt("credited"),
                  // Negative when less arrived than was asked for, which is the
                  // direction that costs somebody their cover.
                  received - scheduled,
                  rs.getInt("open_exceptions"));
            })
        .list();
  }

  // ── The direct-debit run ────────────────────────────────────────────────────

  public record DebitCounts(int presented, int settled, int awaiting, int failed) {}

  /** One reason a debit did not settle, with what an officer can do about it. */
  public record DebitFailure(String kind, int count, boolean memberMustAct) {}

  /** A leaver whose cover is running on grace and who has not paid yet. */
  public record GraceRow(String cspId, String name, LocalDate graceUntil, int daysLeft) {}

  public record DebitRun(
      LocalDate period,
      String method,
      DebitCounts counts,
      List<DebitFailure> failures,
      /** First attempt, second attempt, card fallback, and the day cover lapses. */
      Map<String, LocalDate> timeline,
      List<GraceRow> grace) {}

  /**
   * What the bank said, for the month being collected.
   *
   * <p>Every number here is counted from rows that exist rather than reported by the rail: a
   * presentment is a contribution row, a settlement is that row confirmed, a failure is an exception
   * raised against the cycle. A screen fed by the integration's own summary would agree with NIBSS
   * and disagree with the ledger, and the ledger is what pays a claim.
   *
   * <p>Answers for a payroll sponsor too, and should. Payroll sponsors still run debits — for the
   * people the file missed and the ones who have left service — and those are exactly the members
   * nobody is watching, because the main collection looks fine.
   */
  public DebitRun debitRun(UUID sponsorId) {
    var sponsor = sponsorOr404(sponsorId);

    var cycle =
        db.sql(
                """
                SELECT id, period FROM collection_cycles
                 WHERE sponsor_id = :id ORDER BY period DESC LIMIT 1
                """)
            .param("id", sponsorId)
            .query((rs, n) -> new Object[] {rs.getObject("id", UUID.class), rs.getObject("period", LocalDate.class)})
            .optional()
            .orElse(null);

    /*
     * No cycle yet is a real state, not an error: a sponsor enrolled last week
     * has members and has collected nothing. The screen should say so rather
     * than 404, which would read as a broken console.
     */
    var period = cycle == null ? LocalDate.now().withDayOfMonth(1) : (LocalDate) cycle[1];
    var cycleId = cycle == null ? null : (UUID) cycle[0];

    var counts =
        db.sql(
                """
                SELECT count(*)::int AS presented,
                       count(*) FILTER (WHERE status = 'confirmed')::int AS settled,
                       count(*) FILTER (WHERE status = 'expected')::int  AS awaiting,
                       count(*) FILTER (WHERE status = 'failed')::int    AS failed
                  FROM contributions
                 WHERE period = :p
                   AND source = 'direct_debit'
                   AND member_id IN (SELECT id FROM members WHERE sponsor_id = :s)
                """)
            .param("p", period)
            .param("s", sponsorId)
            .query(
                (rs, n) ->
                    new DebitCounts(
                        rs.getInt("presented"),
                        rs.getInt("settled"),
                        rs.getInt("awaiting"),
                        rs.getInt("failed")))
            .single();

    var failures =
        cycleId == null
            ? List.<DebitFailure>of()
            : db.sql(
                    """
                    SELECT kind::text AS kind, count(*)::int AS n
                      FROM reconciliation_exceptions
                     WHERE cycle_id = :c AND resolved_at IS NULL
                     GROUP BY kind ORDER BY n DESC
                    """)
                .param("c", cycleId)
                .query((rs, n) -> new String[] {rs.getString("kind"), String.valueOf(rs.getInt("n"))})
                .list()
                .stream()
                .filter(row -> Rails.DEBIT_KINDS.contains(row[0]))
                .map(
                    row ->
                        new DebitFailure(
                            row[0],
                            Integer.parseInt(row[1]),
                            // A revoked mandate or a dead card cannot be retried
                            // into working. Somebody has to ask the member, and
                            // a screen that offers "retry" for these teaches an
                            // officer to press it for a fortnight.
                            !"no_funds".equals(row[0])))
                .toList();

    var first = collectionDay(period, sponsor);
    // Ordered, because the screen reads it as a sequence and a HashMap would
    // hand it back in whatever order it liked.
    var timeline = new LinkedHashMap<String, LocalDate>();
    timeline.put("presented", first);
    // After salaries land. The commonest failure by far is an account that was
    // empty on the 28th and is not on the 4th.
    timeline.put("retried", first.plusDays(Rails.CARD_FALLBACK_DAYS));
    timeline.put("cardFallback", first.plusDays(Rails.CARD_FALLBACK_DAYS * 2L));
    timeline.put("graceEnds", first.plusDays(Rails.GRACE_DAYS));

    /*
     * Leavers whose grace is running, and who have not paid this month.
     *
     * The list this screen exists for on a payroll sponsor. These members left
     * the schedule with cover in force, and the only thing that keeps it in
     * force is a direct debit somebody has to ask them to set up — while the
     * main collection reports that everything is fine.
     */
    var grace =
        db.sql(
                """
                SELECT m.csp_id, m.display_name, m.grace_until
                  FROM members m
                 WHERE m.sponsor_id = :s
                   AND m.grace_until IS NOT NULL
                   AND m.grace_until >= CURRENT_DATE
                   AND NOT EXISTS (
                     SELECT 1 FROM contributions c
                      WHERE c.member_id = m.id AND c.period = :p AND c.status = 'confirmed')
                 ORDER BY m.grace_until
                 LIMIT 25
                """)
            .param("s", sponsorId)
            .param("p", period)
            .query(
                (rs, n) -> {
                  var until = rs.getObject("grace_until", LocalDate.class);
                  return new GraceRow(
                      rs.getString("csp_id"),
                      rs.getString("display_name"),
                      until,
                      (int) ChronoUnit.DAYS.between(LocalDate.now(), until));
                })
            .list();

    return new DebitRun(period, sponsor.method(), counts, failures, timeline, grace);
  }

  /**
   * The day of the month this sponsor collects on, in the month being collected.
   *
   * <p>No clamping and no rolling forward, because the schema will not store a day that needs
   * either: {@code collection_day} is checked between 1 and 28. That ceiling is not arbitrary —
   * February has 28 days, so a sponsor collecting on the 30th would either miss February or spill
   * into March, and a collection that lands in the next period is a month of cover nobody can say
   * was paid for. The rule belongs in the constraint rather than in arithmetic here.
   */
  private LocalDate collectionDay(LocalDate period, SponsorInfo sponsor) {
    var day =
        db.sql("SELECT collection_day FROM sponsors WHERE id = :id")
            .param("id", sponsor.id())
            .query(Integer.class)
            .optional()
            .orElse(28);
    return period.withDayOfMonth(day);
  }

  public Reconciliation reconciliation(UUID sponsorId, UUID cycleId) {
    var sponsor = sponsorOr404(sponsorId);
    /*
     * How many rows on the schedule came back without a question against them.
     *
     * Deliberately not "how many contributions are confirmed". Nothing is
     * credited until the cycle is closed, so that count is zero for every cycle
     * that is still being reconciled — which is every cycle this screen is ever
     * looked at. It made the match bar read "0 of 8,412 reconciled" on a file
     * where all but three rows were fine.
     *
     * What an officer is asking here is about the *file*: of everything we sent,
     * how much came back needing a decision. That is the schedule less the
     * exceptions raised against it.
     */
    var matched =
        db.sql(
                """
                SELECT GREATEST(
                         c.scheduled_count
                           - (SELECT count(*)::int FROM reconciliation_exceptions e
                               WHERE e.cycle_id = c.id),
                         0)::int
                  FROM collection_cycles c
                 WHERE c.id = :c
                """)
            .param("c", cycleId)
            .query(Integer.class)
            .single();

    var exceptions =
        db.sql(
                """
                SELECT e.id, e.member_id, e.kind::text AS kind, e.name_as_written,
                       e.service_no_as_written, e.rail_response, e.expected_minor, e.received_minor,
                       e.proposed_action::text AS proposed_action, e.proposed_note, e.proposed_at,
                       e.resolved_action::text AS resolved_action, e.resolved_note, e.resolved_at,
                       m.display_name, m.csp_id, m.service_no
                  FROM reconciliation_exceptions e
                  LEFT JOIN members m ON m.id = e.member_id
                 WHERE e.cycle_id = :c
                 ORDER BY e.resolved_at NULLS FIRST, e.created_at
                """)
            .param("c", cycleId)
            .query(
                (rs, n) ->
                    new ExceptionRow(
                        rs.getObject("id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        rs.getString("display_name"),
                        rs.getString("csp_id"),
                        rs.getString("service_no"),
                        rs.getString("kind"),
                        rs.getString("name_as_written"),
                        rs.getString("service_no_as_written"),
                        rs.getString("rail_response"),
                        rs.getLong("expected_minor"),
                        rs.getLong("received_minor"),
                        rs.getString("proposed_action"),
                        rs.getString("proposed_note"),
                        Rows.instant(rs, "proposed_at"),
                        rs.getString("resolved_action"),
                        rs.getString("resolved_note"),
                        Rows.instant(rs, "resolved_at")))
            .list();

    // The client branches on this, never on the sponsor's name.
    return new Reconciliation(sponsor.method(), matched, exceptions, summaryFor(cycleId));
  }

  /** A preparer says what they think should happen. Nothing moves yet. */
  @Transactional
  public void propose(SessionUser session, UUID exceptionId, String action, String note) {
    var sponsorId = sponsorOfException(exceptionId);
    session.assertSponsorScope(sponsorId);

    var updated =
        db.sql(
                """
                UPDATE reconciliation_exceptions
                   SET proposed_action = CAST(:a AS exception_action),
                       proposed_note = :note, proposed_by = :u, proposed_at = now()
                 WHERE id = :id AND resolved_action IS NULL
                """)
            .param("a", action)
            .param("note", note)
            .param("u", session.userId())
            .param("id", exceptionId)
            .update();
    if (updated == 0) {
      throw ApiException.conflict("already_resolved", "That exception is already resolved.");
    }
    audit(session, sponsorId, "exception.proposed", "exception", exceptionId.toString(),
        Map.of("action", action, "note", note));
  }

  public record Resolution(String memberState, Instant graceEndsAt) {}

  /**
   * An approver commits it.
   *
   * <p>The aspect checks the permission, that a proposal exists, and that the approver is not the
   * person who proposed it. The database constraint refuses the row if it somehow gets past.
   */
  @Transactional
  @MakerChecker(commits = Permission.EXCEPTION_RESOLVE, subject = "exception")
  public Resolution resolve(SessionUser session, UUID exceptionId, String note, UUID matchTo) {
    var sponsorId = sponsorOfException(exceptionId);
    session.assertSponsorScope(sponsorId);

    var row =
        db.sql(
                """
                SELECT e.cycle_id, e.member_id, e.kind::text AS kind, e.received_minor,
                       e.proposed_action::text AS proposed_action, e.resolved_action,
                       c.period, s.rail_code, s.type::text AS sponsor_type
                  FROM reconciliation_exceptions e
                  JOIN collection_cycles c ON c.id = e.cycle_id
                  JOIN sponsors s ON s.id = c.sponsor_id
                 WHERE e.id = :id
                   FOR UPDATE OF e
                """)
            .param("id", exceptionId)
            .query(
                (rs, n) ->
                    Map.of(
                        "cycleId", rs.getObject("cycle_id", UUID.class),
                        "memberId", String.valueOf(rs.getObject("member_id", UUID.class)),
                        "received", rs.getLong("received_minor"),
                        "action", String.valueOf(rs.getString("proposed_action")),
                        "resolved", String.valueOf(rs.getString("resolved_action")),
                        "period", rs.getObject("period", LocalDate.class),
                        "railCode", rs.getString("rail_code"),
                        "sponsorType", rs.getString("sponsor_type")))
            .optional()
            .orElseThrow(() -> ApiException.notFound("No such exception."));

    if (!"null".equals(row.get("resolved"))) {
      throw ApiException.conflict("already_resolved", "That exception is already resolved.");
    }

    var action = (String) row.get("action");
    var memberId =
        matchTo != null
            ? matchTo
            : "null".equals(row.get("memberId")) ? null : UUID.fromString((String) row.get("memberId"));

    if ("match".equals(action) && memberId == null) {
      throw ApiException.badRequest("Matching needs the member to match to.");
    }

    db.sql(
            """
            UPDATE reconciliation_exceptions
               SET resolved_action = proposed_action, resolved_note = :note,
                   resolved_by = :u, resolved_at = now(),
                   member_id = COALESCE(:m, member_id)
             WHERE id = :id
            """)
        .param("note", note)
        .param("u", session.userId())
        .param("m", memberId)
        .param("id", exceptionId)
        .update();

    // Matching credits the member with a new row, never an edit — which is why a
    // mistake here is recoverable and visible rather than quiet.
    if ("match".equals(action) && memberId != null) {
      var method = Rails.methodFor(Rails.SponsorType.fromWire((String) row.get("sponsorType")));
      db.sql(
              """
              INSERT INTO contributions
                (member_id, cycle_id, period, amount_minor, source, status, rail_ref, received_at)
              VALUES (:m, :c, :p, :amt, CAST(:src AS contribution_source), 'confirmed', :ref, now())
              """)
          .param("m", memberId)
          .param("c", row.get("cycleId"))
          .param("p", row.get("period"))
          .param("amt", row.get("received"))
          .param("src", method == Rails.Method.PAYROLL ? "payroll" : "direct_debit")
          .param("ref", row.get("railCode"))
          .update();
    }

    audit(session, sponsorId, "exception." + action, "exception", exceptionId.toString(),
        Map.of("note", note, "memberId", String.valueOf(memberId)));

    // 'remove' never drops cover on the spot: the grace period starts and the
    // member is told on both member surfaces.
    var graceEndsAt =
        "remove".equals(action)
            ? Instant.now().plus(java.time.Duration.ofDays(Rails.GRACE_DAYS))
            : null;
    return new Resolution("remove".equals(action) ? "grace" : "in_force", graceEndsAt);
  }

  public record CloseResult(boolean closed, int credited) {}

  /**
   * Close the cycle.
   *
   * <p>Refused while anything is undecided. This is the console's whole reason to exist: an officer
   * cannot make fifty-seven problems disappear by pressing one button.
   *
   * <p>Checker-only rather than maker–checker: the month's work is the proposal, so there is no
   * separate one to require.
   */
  @Transactional
  @MakerChecker(commits = Permission.CYCLE_CLOSE, subject = "cycle", requiresProposal = false)
  public CloseResult closeCycle(SessionUser session, UUID cycleId, UUID sponsorId) {
    session.assertSponsorScope(sponsorId);

    var open =
        db.sql(
                """
                SELECT count(*)::int FROM reconciliation_exceptions
                 WHERE cycle_id = :c AND resolved_action IS NULL
                """)
            .param("c", cycleId)
            .query(Integer.class)
            .single();
    if (open > 0) {
      throw ApiException.conflict(
          "exceptions_open",
          "%d exception(s) still need a decision before this cycle can close.".formatted(open));
    }

    var closed =
        db.sql(
                """
                UPDATE collection_cycles
                   SET state = 'closed', closed_at = now(), closed_by = :u
                 WHERE id = :c AND sponsor_id = :s AND state <> 'closed'
                """)
            .param("u", session.userId())
            .param("c", cycleId)
            .param("s", sponsorId)
            .update();
    if (closed == 0) {
      throw ApiException.conflict("already_closed", "That cycle is already closed.");
    }

    // Everything still merely expected on a closed cycle is now confirmed.
    var credited =
        db.sql(
                """
                INSERT INTO contributions
                  (member_id, cycle_id, period, amount_minor, source, status, rail_ref, received_at)
                SELECT member_id, cycle_id, period, amount_minor, source, 'confirmed', rail_ref, now()
                  FROM contributions
                 WHERE cycle_id = :c AND status = 'expected'
                """)
            .param("c", cycleId)
            .update();

    audit(session, sponsorId, "cycle.closed", "cycle", cycleId.toString(), Map.of("credited", credited));
    return new CloseResult(true, credited);
  }

  // ── Roster, roles, audit ───────────────────────────────────────────────────

  /**
   * A member, as the roster screen reads one.
   *
   * <p>Carries the two facts the screen exists to show, and neither of them is on the members table.
   * "Who has not been deducted this month" is the reason an HR officer opens this page at all, and a
   * roster that only lists names makes them go and look at reconciliation instead — which is a
   * different screen answering a different question about a different month.
   *
   * <p>{@code hasBeneficiary} is the other one. An unnominated member is a claim that will take
   * twelve months instead of twenty days, and chasing them is work somebody does from this list.
   */
  public record RosterMember(
      UUID id,
      String cspId,
      String serviceNo,
      String name,
      String grade,
      String tier,
      LocalDate inForceSince,
      /** The latest contribution's status: confirmed, expected, failed — or null if never any. */
      String collectionState,
      String lastPeriod,
      boolean hasBeneficiary,
      /*
       * Null for almost everybody. Set together or not at all: the last day on
       * the payroll and the day cover stops being free — the second is what an
       * officer is chasing a direct debit against, and what somebody will be
       * asked about at a claim.
       */
      LocalDate leftOn,
      LocalDate graceUntil) {}

  /** The chip counts, so the filters say something true rather than something fixed. */
  public record RosterCounts(int all, int paid, int notDeducted, int noBeneficiary) {}

  public record Roster(List<RosterMember> members, RosterCounts counts) {}

  public Roster roster(UUID sponsorId, String search, int limit) {
    var members =
        db.sql(
                """
                SELECT m.id, m.csp_id, m.service_no, m.display_name, m.grade, m.tier,
                       m.in_force_since,
                       c.status::text AS collection_state,
                       c.period       AS last_period,
                       /*
                        * A column, not a subquery. A sponsor may not read
                        * beneficiaries, and a subquery under that policy does
                        * not fail — it returns nothing, so every member read as
                        * unnominated. The flag is maintained by trigger on a row
                        * the sponsor can see. See V10.
                        */
                       m.has_payee_beneficiary AS has_beneficiary,
                       m.left_payroll_on, m.grace_until
                  FROM members m
                  /*
                   * The most recent contribution, whatever its state. LATERAL
                   * rather than a join on a grouped subquery: this runs once per
                   * row of the page being shown, which at fifty rows is fifty
                   * index lookups, where the grouped version scans every
                   * contribution the sponsor has ever had.
                   */
                  LEFT JOIN LATERAL (
                    SELECT status, period FROM contributions
                     WHERE member_id = m.id
                     ORDER BY period DESC
                     LIMIT 1
                  ) c ON true
                 WHERE m.sponsor_id = :s
                   AND (CAST(:q AS text) IS NULL
                        OR m.display_name ILIKE '%' || CAST(:q AS text) || '%'
                        OR m.csp_id       ILIKE '%' || CAST(:q AS text) || '%'
                        OR m.service_no   ILIKE '%' || CAST(:q AS text) || '%')
                 ORDER BY m.display_name
                 LIMIT :limit
                """)
            .param("s", sponsorId)
            .param("q", search)
            .param("limit", limit)
            .query(
                (rs, n) ->
                    new RosterMember(
                        rs.getObject("id", UUID.class),
                        rs.getString("csp_id"),
                        rs.getString("service_no"),
                        rs.getString("display_name"),
                        rs.getString("grade"),
                        rs.getString("tier"),
                        rs.getObject("in_force_since", LocalDate.class),
                        rs.getString("collection_state"),
                        String.valueOf(rs.getObject("last_period", LocalDate.class)),
                        rs.getBoolean("has_beneficiary"),
                        rs.getObject("left_payroll_on", LocalDate.class),
                        rs.getObject("grace_until", LocalDate.class)))
            .list();

    /*
     * Counts over the whole roster, not over the page.
     *
     * A chip saying "12 not deducted" when the list is showing fifty of 8,440
     * has to mean twelve on the sponsor, or it is telling an officer their
     * problem is smaller than it is.
     */
    var counts =
        db.sql(
                """
                SELECT count(*)::int AS all_members,
                       count(*) FILTER (WHERE c.status = 'confirmed')::int AS paid,
                       /*
                        * Leavers excluded. Somebody who came off the payroll in
                        * August is not a collection that failed — they are a
                        * direct debit to chase, which is a different screen and
                        * a different piece of work. Counting them here puts a
                        * number in front of an officer that they cannot act on
                        * and cannot make go down.
                        */
                       count(*) FILTER (WHERE c.status IS DISTINCT FROM 'confirmed'
                                          AND m.left_payroll_on IS NULL)::int
                         AS not_deducted,
                       count(*) FILTER (WHERE NOT m.has_payee_beneficiary)::int
                         AS no_beneficiary
                  FROM members m
                  LEFT JOIN LATERAL (
                    SELECT status FROM contributions
                     WHERE member_id = m.id ORDER BY period DESC LIMIT 1
                  ) c ON true
                 WHERE m.sponsor_id = :s
                """)
            .param("s", sponsorId)
            .query(
                (rs, n) ->
                    new RosterCounts(
                        rs.getInt("all_members"),
                        rs.getInt("paid"),
                        rs.getInt("not_deducted"),
                        rs.getInt("no_beneficiary")))
            .single();

    return new Roster(members, counts);
  }

  public record ConsoleUser(
      UUID id, String name, String email, String role, String roleLabel,
      List<String> permissions, Instant lastSeenAt, boolean disabled) {}

  public List<ConsoleUser> consoleUsers(UUID sponsorId) {
    return db.sql(
            """
            SELECT id, full_name, email, role::text AS role, last_seen_at, disabled_at
              FROM users WHERE sponsor_id = :s ORDER BY full_name
            """)
        .param("s", sponsorId)
        .query(
            (rs, n) -> {
              var role = ng.csp.api.auth.Role.fromWire(rs.getString("role"));
              return new ConsoleUser(
                  rs.getObject("id", UUID.class),
                  rs.getString("full_name"),
                  rs.getString("email"),
                  role.wire(),
                  role.label(),
                  role.permissions().stream().map(Enum::name).sorted().toList(),
                  Rows.instant(rs, "last_seen_at"),
                  rs.getObject("disabled_at") != null);
            })
        .list();
  }

  public record AuditEntry(
      Instant at, String action, String subjectType, String subjectId,
      String actorName, String actorRole) {}

  public List<AuditEntry> auditTrail(UUID sponsorId) {
    return db.sql(
            """
            SELECT a.created_at, a.action, a.subject_type, a.subject_id,
                   a.actor_role::text AS actor_role, u.full_name AS actor_name
              FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
             WHERE a.sponsor_id = :s ORDER BY a.created_at DESC LIMIT 100
            """)
        .param("s", sponsorId)
        .query(
            (rs, n) ->
                new AuditEntry(
                    Rows.instant(rs, "created_at"),
                    rs.getString("action"),
                    rs.getString("subject_type"),
                    rs.getString("subject_id"),
                    rs.getString("actor_name"),
                    rs.getString("actor_role")))
        .list();
  }

  private UUID sponsorOfException(UUID exceptionId) {
    return db.sql(
            """
            SELECT c.sponsor_id FROM reconciliation_exceptions e
              JOIN collection_cycles c ON c.id = e.cycle_id
             WHERE e.id = :id
            """)
        .param("id", exceptionId)
        .query(UUID.class)
        .optional()
        .orElseThrow(() -> ApiException.notFound("No such exception."));
  }

  private void audit(
      SessionUser session, UUID sponsorId, String action, String subjectType, String subjectId, Object detail) {
    db.sql(
            """
            INSERT INTO audit_log
              (actor_user_id, actor_role, sponsor_id, action, subject_type, subject_id, detail)
            VALUES (:u, CAST(:r AS user_role), :s, :a, :st, :si, CAST(:d AS jsonb))
            """)
        .param("u", session.userId())
        .param("r", session.role().wire())
        .param("s", sponsorId)
        .param("a", action)
        .param("st", subjectType)
        .param("si", subjectId)
        .param("d", json.writeValueAsString(detail))
        .update();
  }
}
