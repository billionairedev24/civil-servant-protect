package ng.csp.api.enrolment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import ng.csp.api.auth.SessionUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Coming off a sponsor's schedule.
 *
 * <p>A {@code POST} to {@code .../leave} rather than a {@code DELETE} of the member, and the verb is
 * the argument. Nothing is deleted: the member keeps their record, their CSP-ID, their contribution
 * history and — for sixty days at least — their cover. What ends is the payroll deduction.
 *
 * <p>Same permission as enrolling, because it is the same desk and the same act: deciding who this
 * employer collects for.
 */
@RestController
@RequestMapping("/v1")
public class LeaverController {

  private final LeaverService leavers;

  public LeaverController(LeaverService leavers) {
    this.leavers = leavers;
  }

  public record Leaving(
      @NotBlank String reason,
      /*
       * Their last day on the payroll, which is not today and is not always in
       * the past — an officer is usually told about a retirement in advance,
       * and the grace period counts from the last payday rather than from the
       * moment somebody got round to the paperwork.
       */
      @NotNull LocalDate lastDay) {}

  @PostMapping("/sponsors/{sponsorId}/members/{memberId}/leave")
  @PreAuthorize("hasAuthority('PERM_MEMBERS_MANAGE')")
  public LeaverService.Leaver leave(
      SessionUser session,
      @PathVariable UUID sponsorId,
      @PathVariable UUID memberId,
      @Valid @RequestBody Leaving body) {
    session.assertSponsorScope(sponsorId);
    return leavers.leave(sponsorId, memberId, body.reason(), body.lastDay());
  }

  /** Who has left, whose grace runs out soonest last. Read-only, so a viewer may see it. */
  @GetMapping("/sponsors/{sponsorId}/leavers")
  @PreAuthorize("hasAuthority('PERM_SPONSOR_READ')")
  public Leavers leavers(
      SessionUser session,
      @PathVariable UUID sponsorId,
      @RequestParam(defaultValue = "20") int limit) {
    session.assertSponsorScope(sponsorId);
    return new Leavers(leavers.leavers(sponsorId, Math.clamp(limit, 1, 200)));
  }

  public record Leavers(List<LeaverService.Leaver> leavers) {}
}
