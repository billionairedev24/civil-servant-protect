package ng.csp.api.enrolment;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import ng.csp.api.domain.Rails;
import ng.csp.api.integration.Comms;
import ng.csp.api.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Taking somebody off the schedule.
 *
 * <p>The counterpart of enrolment, and the half that is easier to get wrong, because the obvious
 * implementation is a delete and the correct one is nearly the opposite. <b>Coming off the payroll
 * stops the deduction. It does not cancel the cover.</b> A member who retires on the 30th is covered
 * on the 1st, and their family is owed the same money they were owed a week earlier.
 *
 * <p>What actually changes is who collects the contribution and how long there is to arrange it.
 * Sixty days of grace from the last day on the payroll: time to set up a direct debit, and time for
 * somebody to deal with it if the first attempt fails. A member who is halfway through a claim when
 * their employment ends is covered for that claim, and the grace date on the record is the evidence
 * rather than an argument.
 *
 * <p>A death is deliberately not a reason here. It is a claim — the event the scheme exists for —
 * and an officer closing a payroll record is the wrong person, in the wrong screen, with no assessor
 * anywhere near it.
 */
@Service
public class LeaverService {

  private static final Logger log = LoggerFactory.getLogger(LeaverService.class);

  /**
   * How long cover continues after the last payday.
   *
   * <p>{@link Rails#GRACE_DAYS}, not a number of its own. It is the same sixty days a member gets
   * when a collection fails, for the same reason — the arrangement that replaces the one that
   * stopped is set up by somebody with other things happening — and two copies of a figure this
   * consequential drift apart the first time one of them is revisited.
   */
  private static final int GRACE_DAYS = Rails.GRACE_DAYS;

  private static final List<String> REASONS =
      List.of("retired", "transferred", "resigned", "dismissed");

  private final JdbcClient db;
  private final Comms comms;

  public LeaverService(JdbcClient db, Comms comms) {
    this.db = db;
    this.comms = comms;
  }

  public record Leaver(
      UUID memberId,
      String cspId,
      String name,
      String serviceNo,
      String reason,
      LocalDate leftOn,
      LocalDate graceUntil,
      /** What the officer should tell them, and what the SMS says. */
      String outcome) {}

  /**
   * Record that somebody has left the payroll.
   *
   * <p>Idempotent in the only sense that matters: a second attempt on the same member is refused
   * rather than quietly moving the grace date, because moving it is how cover ends earlier than
   * anybody was told it would.
   */
  @Transactional
  public Leaver leave(UUID sponsorId, UUID memberId, String reason, LocalDate lastDay) {
    if (reason != null && reason.equalsIgnoreCase("deceased")) {
      throw ApiException.badRequest(
          "A death is a claim, not a removal. Start a claim instead — the cover pays out and the "
              + "record stays open until it does.");
    }
    if (!REASONS.contains(reason)) {
      throw ApiException.badRequest("Reason must be one of: " + String.join(", ", REASONS));
    }
    if (lastDay.isAfter(LocalDate.now().plusMonths(3))) {
      // A date far in the future is a typo — 2027 for 2026 — and it would put
      // somebody's grace period two years out without anybody noticing.
      throw ApiException.badRequest("That last day is more than three months away. Check the year.");
    }

    var member =
        db.sql(
                """
                SELECT csp_id, display_name, service_no, msisdn, left_payroll_on
                  FROM members WHERE id = :id AND sponsor_id = :s
                """)
            .param("id", memberId)
            .param("s", sponsorId)
            .query(
                (rs, n) ->
                    new String[] {
                      rs.getString("csp_id"),
                      rs.getString("display_name"),
                      rs.getString("service_no"),
                      rs.getString("msisdn"),
                      String.valueOf(rs.getObject("left_payroll_on", LocalDate.class))
                    })
            .optional()
            .orElseThrow(() -> ApiException.notFound("No such member on this employer."));

    if (!"null".equals(member[4])) {
      throw ApiException.conflict(
          "already_left",
          "%s already came off the schedule on %s.".formatted(member[0], member[4]));
    }

    var graceUntil = lastDay.plusDays(GRACE_DAYS);
    db.sql(
            """
            UPDATE members
               SET left_payroll_on = :last,
                   leave_reason    = CAST(:reason AS leave_reason),
                   grace_until     = :grace
             WHERE id = :id AND sponsor_id = :s
            """)
        .param("last", lastDay)
        .param("reason", reason)
        .param("grace", graceUntil)
        .param("id", memberId)
        .param("s", sponsorId)
        .update();

    var outcome = outcomeOf(reason, graceUntil);
    log.info("{} left the payroll on {} ({}), cover to {}", member[0], lastDay, reason, graceUntil);
    tell(member[3], member[0], member[1], graceUntil, outcome);

    return new Leaver(
        memberId, member[0], member[1], member[2], reason, lastDay, graceUntil, outcome);
  }

  /**
   * Who has left, most recent first.
   *
   * <p>The screen's real content. An officer opening it wants the people whose grace runs out next,
   * because those are the ones to chase about a direct debit — not a list of everyone who has ever
   * left the ministry.
   */
  public List<Leaver> leavers(UUID sponsorId, int limit) {
    return db.sql(
            """
            SELECT id, csp_id, display_name, service_no, leave_reason::text AS reason,
                   left_payroll_on, grace_until
              FROM members
             WHERE sponsor_id = :s AND left_payroll_on IS NOT NULL
             ORDER BY grace_until DESC
             LIMIT :limit
            """)
        .param("s", sponsorId)
        .param("limit", limit)
        .query(
            (rs, n) -> {
              var grace = rs.getObject("grace_until", LocalDate.class);
              var reason = rs.getString("reason");
              return new Leaver(
                  rs.getObject("id", UUID.class),
                  rs.getString("csp_id"),
                  rs.getString("display_name"),
                  rs.getString("service_no"),
                  reason,
                  rs.getObject("left_payroll_on", LocalDate.class),
                  grace,
                  outcomeOf(reason, grace));
            })
        .list();
  }

  /**
   * What happens to this person's cover, in a sentence an officer can read out.
   *
   * <p>Derived rather than stored. It is a consequence of the reason and the date, and a copy of it
   * in a column would be the version that goes stale the first time the grace period changes.
   */
  private static String outcomeOf(String reason, LocalDate graceUntil) {
    var covered = "Cover continues to " + graceUntil + ". ";
    return covered
        + switch (reason) {
          case "retired" ->
              "A retiree keeps their CSP-ID, their start date and their price — set up a direct "
                  + "debit before then and nothing else changes.";
          case "transferred" ->
              "If the new MDA runs the scheme they go onto its schedule; otherwise a direct debit. "
                  + "Either way they keep their CSP-ID and their start date.";
          default ->
              "After that it lapses unless they set up a direct debit themselves. Contributions "
                  + "already made are not refunded and not lost — the cover they bought was in "
                  + "force for those months.";
        };
  }

  /**
   * Tell them, after the commit.
   *
   * <p>They are about to stop seeing a deduction on a payslip, and the difference between "your
   * cover ended" and "your cover continues to the 28th of November if you do this one thing" is the
   * whole value of the grace period. A member who is not told simply discovers it later, at the
   * worst moment.
   */
  private void tell(
      String msisdn, String cspId, String name, LocalDate graceUntil, String outcome) {
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCommit() {
            try {
              comms.notify(
                  msisdn,
                  "left_payroll",
                  Map.of("name", name, "cspId", cspId, "graceUntil", graceUntil.toString()),
                  cspId + ":left");
            } catch (RuntimeException e) {
              log.warn("could not send the leaver SMS for {}: {}", cspId, e.getMessage());
            }
          }
        });
    log.debug("{} will be told: {}", cspId, outcome);
  }
}
