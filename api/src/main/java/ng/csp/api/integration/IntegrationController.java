package ng.csp.api.integration;

import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * What is stuck with the outside world.
 *
 * <p>The replay log's reason for existing is that somebody has to look at it. A payout that timed
 * out sits there as {@code attempting}, and until a person checks with the bank and decides, that
 * claim is neither paid nor safe to pay again — so this is the queue that work comes off.
 *
 * <p>Read-only, and deliberately. There is no "replay" button here: replaying a payout is a decision
 * with a bank statement behind it, not a click, and an endpoint that made it one click would be the
 * fastest way to pay a family twice. Retrying a call means calling the operation again, through the
 * same idempotency key that stops it happening twice.
 *
 * <p>Operations only. The subject column carries CSP-IDs from every rail, which is exactly what a
 * sponsor must not see — and the table's row-level policy says the same thing underneath.
 */
@RestController
@RequestMapping("/v1/operations")
public class IntegrationController {

  private final ReplayLog replay;

  public IntegrationController(ReplayLog replay) {
    this.replay = replay;
  }

  @GetMapping("/integration-calls/stuck")
  @PreAuthorize("hasAuthority('PERM_ROLES_MANAGE')")
  public Map<String, List<ReplayLog.Stuck>> stuck(
      @RequestParam(defaultValue = "50") int limit) {
    return Map.of("calls", replay.stuck(Math.clamp(limit, 1, 500)));
  }
}
