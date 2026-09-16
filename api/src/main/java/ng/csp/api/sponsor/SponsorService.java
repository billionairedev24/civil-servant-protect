package ng.csp.api.sponsor;

import java.time.Instant;
import java.time.LocalDate;
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
                 WHERE m.sponsor_id = :id
                   AND NOT EXISTS (SELECT 1 FROM beneficiaries b WHERE b.member_id = m.id)
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

  public record RosterMember(
      UUID id, String cspId, String serviceNo, String name, String grade, String tier, LocalDate inForceSince) {}

  public List<RosterMember> roster(UUID sponsorId, String search, int limit) {
    return db.sql(
            """
            SELECT id, csp_id, service_no, display_name, grade, tier, in_force_since
              FROM members
             WHERE sponsor_id = :s
               AND (CAST(:q AS text) IS NULL
                    OR display_name ILIKE '%' || CAST(:q AS text) || '%'
                    OR csp_id       ILIKE '%' || CAST(:q AS text) || '%'
                    OR service_no   ILIKE '%' || CAST(:q AS text) || '%')
             ORDER BY display_name
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
                    rs.getObject("in_force_since", LocalDate.class)))
        .list();
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
