package ng.csp.api.sponsor;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import ng.csp.api.web.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * The exports a finance officer is asked for, as CSV.
 *
 * <p>CSV rather than a formatted document, because every one of these ends up in a spreadsheet: an
 * auditor reconciles it against their own figures, a payroll officer sorts it, somebody pivots it.
 * A PDF of a table is a table nobody can use.
 *
 * <p>Every report is a query against the same rows the screens count, so an export and the console
 * cannot disagree — which is the entire point of an export somebody will quote back at you six
 * months later.
 */
@Service
public class ReportService {

  private final JdbcClient db;

  public ReportService(JdbcClient db) {
    this.db = db;
  }

  public record Report(String filename, String csv) {}

  /** What can be asked for, and what each one is. Unknown kinds are refused by name. */
  public enum Kind {
    SCHEDULE,
    REMITTANCES,
    MOVEMENT,
    CLAIMS,
    LAPSE_RISK;

    static Kind of(String wire) {
      for (var kind : values()) {
        if (kind.name().equalsIgnoreCase(wire.replace('-', '_'))) {
          return kind;
        }
      }
      throw ApiException.badRequest(
          "No such report. Available: schedule, remittances, movement, claims, lapse-risk.");
    }
  }

  public Report of(UUID sponsorId, String wire, LocalDate period) {
    var kind = Kind.of(wire);
    var month = period == null ? LocalDate.now().withDayOfMonth(1) : period.withDayOfMonth(1);
    return switch (kind) {
      case SCHEDULE -> new Report(name("deduction-schedule", month), schedule(sponsorId, month));
      case REMITTANCES -> new Report(name("remittances", month), remittances(sponsorId));
      case MOVEMENT -> new Report(name("membership-movement", month), movement(sponsorId, month));
      case CLAIMS -> new Report(name("claims-summary", month), claims(sponsorId));
      case LAPSE_RISK -> new Report(name("lapse-risk", month), lapseRisk(sponsorId));
    };
  }

  private static String name(String stem, LocalDate month) {
    return "%s-%s.csv".formatted(stem, month.toString().substring(0, 7));
  }

  /** What was asked of payroll, member by member. */
  private String schedule(UUID sponsorId, LocalDate month) {
    var rows =
        db.sql(
                """
                SELECT m.csp_id, m.service_no, m.full_name, m.grade, m.tier,
                       c.amount_minor, c.status::text AS status
                  FROM contributions c
                  JOIN members m ON m.id = c.member_id
                 WHERE c.period = :p AND m.sponsor_id = :s
                 ORDER BY m.csp_id
                """)
            .param("p", month)
            .param("s", sponsorId)
            .query(
                (rs, n) ->
                    List.of(
                        rs.getString("csp_id"),
                        or(rs.getString("service_no")),
                        rs.getString("full_name"),
                        or(rs.getString("grade")),
                        rs.getString("tier"),
                        naira(rs.getLong("amount_minor")),
                        rs.getString("status")))
            .list();

    return csv(List.of("csp_id", "service_no", "name", "grade", "tier", "amount", "status"), rows);
  }

  /** The one auditors ask for: what was scheduled, what arrived, and the difference. */
  private String remittances(UUID sponsorId) {
    var rows =
        db.sql(
                """
                SELECT c.period, c.rail_ref, c.state::text AS state, c.scheduled_count,
                       c.scheduled_minor,
                       COALESCE((SELECT SUM(k.amount_minor) FROM contributions k
                                  WHERE k.cycle_id = c.id AND k.status = 'confirmed'), 0) AS received,
                       COALESCE((SELECT count(*) FROM contributions k
                                  WHERE k.cycle_id = c.id AND k.status = 'confirmed'), 0) AS credited,
                       COALESCE((SELECT count(*) FROM reconciliation_exceptions e
                                  WHERE e.cycle_id = c.id AND e.resolved_at IS NULL), 0) AS open_rows
                  FROM collection_cycles c
                 WHERE c.sponsor_id = :s
                 ORDER BY c.period DESC
                """)
            .param("s", sponsorId)
            .query(
                (rs, n) -> {
                  var scheduled = rs.getLong("scheduled_minor");
                  var received = rs.getLong("received");
                  return List.of(
                      rs.getObject("period", LocalDate.class).toString(),
                      or(rs.getString("rail_ref")),
                      rs.getString("state"),
                      String.valueOf(rs.getInt("scheduled_count")),
                      naira(scheduled),
                      String.valueOf(rs.getInt("credited")),
                      naira(received),
                      naira(received - scheduled),
                      String.valueOf(rs.getInt("open_rows")));
                })
            .list();

    return csv(
        List.of("period", "rail_ref", "state", "scheduled_count", "scheduled", "credited",
            "received", "variance", "open_exceptions"),
        rows);
  }

  /**
   * Starters and leavers, with the dates that decide what is owed.
   *
   * <p>Both in one file on purpose. The question this answers is "why did the total change", and
   * separating the two halves means reconciling two files to answer it.
   */
  private String movement(UUID sponsorId, LocalDate month) {
    var rows =
        db.sql(
                """
                SELECT csp_id, service_no, full_name, tier,
                       'joined' AS movement, in_force_since AS on_date, NULL::text AS reason
                  FROM members
                 WHERE sponsor_id = :s
                   AND in_force_since >= :from AND in_force_since < :to
                UNION ALL
                SELECT csp_id, service_no, full_name, tier,
                       'left' AS movement, left_payroll_on AS on_date, leave_reason::text
                  FROM members
                 WHERE sponsor_id = :s
                   AND left_payroll_on >= :from AND left_payroll_on < :to
                 ORDER BY on_date, csp_id
                """)
            .param("s", sponsorId)
            .param("from", month)
            .param("to", month.plusMonths(1))
            .query(
                (rs, n) ->
                    List.of(
                        rs.getString("csp_id"),
                        or(rs.getString("service_no")),
                        rs.getString("full_name"),
                        rs.getString("tier"),
                        rs.getString("movement"),
                        String.valueOf(rs.getObject("on_date", LocalDate.class)),
                        or(rs.getString("reason"))))
            .list();

    return csv(
        List.of("csp_id", "service_no", "name", "tier", "movement", "date", "reason"), rows);
  }

  /**
   * Counts and outcomes. No amount, no cause, no document.
   *
   * <p>Read from the sponsor's projection rather than from claims, so this export cannot grow a
   * column an employer should never have: what a colleague's household was paid, or what they died
   * of.
   */
  private String claims(UUID sponsorId) {
    var rows =
        db.sql(
                """
                SELECT type, state, count(*)::int AS n,
                       count(*) FILTER (WHERE awaiting_sponsor)::int AS awaiting
                  FROM sponsor_claim_view
                 WHERE sponsor_id = :s
                 GROUP BY type, state
                 ORDER BY type, state
                """)
            .param("s", sponsorId)
            .query(
                (rs, n) ->
                    List.of(
                        rs.getString("type"),
                        rs.getString("state"),
                        String.valueOf(rs.getInt("n")),
                        String.valueOf(rs.getInt("awaiting"))))
            .list();

    return csv(List.of("type", "state", "claims", "awaiting_this_employer"), rows);
  }

  /**
   * Who loses cover next, soonest first.
   *
   * <p>Nobody asks for this one until a family has been refused. It is the report that exists so
   * that conversation happens in September rather than at a graveside — everyone whose grace period
   * is running and who has not paid this month.
   */
  private String lapseRisk(UUID sponsorId) {
    var rows =
        db.sql(
                """
                SELECT m.csp_id, m.full_name, m.msisdn, m.leave_reason::text AS reason,
                       m.left_payroll_on, m.grace_until,
                       (m.grace_until - CURRENT_DATE) AS days_left
                  FROM members m
                 WHERE m.sponsor_id = :s
                   AND m.grace_until IS NOT NULL
                   AND m.grace_until >= CURRENT_DATE
                   AND NOT EXISTS (
                     SELECT 1 FROM contributions c
                      WHERE c.member_id = m.id
                        AND c.period = date_trunc('month', CURRENT_DATE)::date
                        AND c.status = 'confirmed')
                 ORDER BY m.grace_until
                """)
            .param("s", sponsorId)
            .query(
                (rs, n) ->
                    List.of(
                        rs.getString("csp_id"),
                        rs.getString("full_name"),
                        // The number to ring. This is the one report whose whole
                        // purpose is somebody picking up a telephone.
                        or(rs.getString("msisdn")),
                        or(rs.getString("reason")),
                        String.valueOf(rs.getObject("left_payroll_on", LocalDate.class)),
                        String.valueOf(rs.getObject("grace_until", LocalDate.class)),
                        String.valueOf(rs.getInt("days_left"))))
            .list();

    return csv(
        List.of("csp_id", "name", "phone", "left_because", "left_on", "covered_until", "days_left"),
        rows);
  }

  private static String or(String value) {
    return value == null ? "" : value;
  }

  /** Kobo to a plain decimal. No currency symbol, no thousands separator: it goes into a cell. */
  private static String naira(long minor) {
    return "%d.%02d".formatted(minor / 100, Math.abs(minor % 100));
  }

  /**
   * Rows to CSV.
   *
   * <p>Quotes every field rather than deciding which need it. A name with a comma in it is the
   * commonest thing in these files — "OKAFOR, ADAEZE N" — and a quoting rule with an exception in it
   * is a rule that will meet the exception on somebody's roster of eight thousand.
   */
  private static String csv(List<String> header, List<List<String>> rows) {
    var out = new StringBuilder();
    out.append(line(header));
    for (var row : rows) {
      out.append(line(row));
    }
    return out.toString();
  }

  private static String line(List<String> cells) {
    var out = new StringBuilder();
    for (var i = 0; i < cells.size(); i++) {
      if (i > 0) {
        out.append(',');
      }
      out.append('"').append(cells.get(i).replace("\"", "\"\"")).append('"');
    }
    // CRLF, because Excel on a ministry desktop is the reader that matters.
    return out.append("\r\n").toString();
  }
}
