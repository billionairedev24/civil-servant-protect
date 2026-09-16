package ng.csp.api.sponsor;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import ng.csp.api.auth.SessionUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
public class SponsorController {

  private final SponsorService sponsors;
  private final ng.csp.api.claim.ClaimService claims;

  public SponsorController(SponsorService sponsors, ng.csp.api.claim.ClaimService claims) {
    this.sponsors = sponsors;
    this.claims = claims;
  }

  @GetMapping("/sponsors/me/dashboard")
  @PreAuthorize("hasAuthority('PERM_SPONSOR_READ')")
  public SponsorService.Dashboard dashboard(SessionUser session) {
    return sponsors.dashboard(session.requireSponsorId());
  }

  public record ScheduleRowBody(
      @NotBlank String serviceNo, @NotBlank String name, @Min(0) long amountMinor) {}

  public record UploadSchedule(
      @NotNull
          @Pattern(regexp = "^\\d{4}-\\d{2}-01$", message = "A period is the first day of a month")
          String period,
      String filename,
      /*
       * A million rows, which is the build spec's ceiling.
       *
       * The cap was 20,000 when the loader did a SELECT and an INSERT per row;
       * it is now a bulk insert and a batch job, so the limit is the request
       * body rather than the loader. A million rows of JSON is large enough
       * that a real deployment should offer a file upload instead — which is
       * the SFTP poller, and is not written.
       */
      @NotEmpty @Size(max = 1_000_000) List<@Valid ScheduleRowBody> rows) {}

  /**
   * Hand over a schedule.
   *
   * <p>202, not 201. The rows are written down before this returns and the load runs behind it, so
   * what the caller has is a batch to watch rather than a finished result — see the status endpoint
   * below. A request that ran until a million rows were loaded would be cut by a proxy and retried
   * by an officer, and the retry would produce a second million rows.
   */
  @PostMapping("/sponsors/{sponsorId}/schedules")
  @PreAuthorize("hasAuthority('PERM_SCHEDULE_UPLOAD')")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public SponsorService.UploadResult upload(
      SessionUser session, @PathVariable UUID sponsorId, @Valid @RequestBody UploadSchedule body) {
    session.assertSponsorScope(sponsorId);
    return sponsors.uploadSchedule(
        session,
        sponsorId,
        LocalDate.parse(body.period()),
        body.filename() == null ? "schedule.csv" : body.filename(),
        body.rows().stream()
            .map(r -> new SponsorService.ScheduleRow(r.serviceNo(), r.name(), r.amountMinor()))
            .toList());
  }

  /** Progress, for the console to poll while a load runs. */
  @GetMapping("/sponsors/{sponsorId}/schedules/{batchId}")
  @PreAuthorize("hasAuthority('PERM_SPONSOR_READ')")
  public ng.csp.api.schedule.ScheduleLoader.Batch scheduleStatus(
      SessionUser session, @PathVariable UUID sponsorId, @PathVariable UUID batchId) {
    session.assertSponsorScope(sponsorId);
    return sponsors.batchStatus(batchId);
  }

  @GetMapping("/sponsors/{sponsorId}/reconciliation/{cycleId}")
  @PreAuthorize("hasAuthority('PERM_SPONSOR_READ')")
  public SponsorService.Reconciliation reconciliation(
      SessionUser session, @PathVariable UUID sponsorId, @PathVariable UUID cycleId) {
    session.assertSponsorScope(sponsorId);
    return sponsors.reconciliation(sponsorId, cycleId);
  }

  public record ProposeBody(
      @NotNull @Pattern(regexp = "match|waive|chase|remove") String action,
      @NotBlank @Size(min = 4, message = "Say why — this is kept on the audit trail.") String note) {}

  /** The maker's half: a preparer says what they think should happen. */
  @PostMapping("/reconciliation/exceptions/{id}/propose")
  @PreAuthorize("hasAuthority('PERM_EXCEPTION_PROPOSE')")
  public Map<String, Object> propose(
      SessionUser session, @PathVariable UUID id, @Valid @RequestBody ProposeBody body) {
    sponsors.propose(session, id, body.action(), body.note());
    return Map.of("proposed", body.action(), "awaiting", "approver");
  }

  public record ResolveBody(
      @NotBlank @Size(min = 4, message = "Say why — this is kept on the audit trail.") String note,
      UUID matchTo) {}

  /** The checker's half. Guarded by the maker–checker aspect, not by this method. */
  @PostMapping("/reconciliation/exceptions/{id}/resolve")
  public SponsorService.Resolution resolve(
      SessionUser session, @PathVariable UUID id, @Valid @RequestBody ResolveBody body) {
    return sponsors.resolve(session, id, body.note(), body.matchTo());
  }

  @PostMapping("/sponsors/{sponsorId}/cycles/{cycleId}/close")
  public SponsorService.CloseResult close(
      SessionUser session, @PathVariable UUID sponsorId, @PathVariable UUID cycleId) {
    // cycleId first: the aspect takes the first UUID argument as the subject.
    return sponsors.closeCycle(session, cycleId, sponsorId);
  }

  @GetMapping("/sponsors/{sponsorId}/members")
  @PreAuthorize("hasAuthority('PERM_SPONSOR_READ')")
  public SponsorService.Roster roster(
      SessionUser session,
      @PathVariable UUID sponsorId,
      @RequestParam(required = false) String search,
      @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit) {
    session.assertSponsorScope(sponsorId);
    return sponsors.roster(sponsorId, search, limit);
  }

  /**
   * Claims on this sponsor's members, as a sponsor may see them.
   *
   * <p>Not {@code GET /v1/claims}, which is the assessor's queue across every sponsor and needs
   * {@code CLAIM_READ_ANY}. A sponsor holds neither that permission nor any business seeing another
   * MDA's claims, and what comes back here carries no amount, cause or document — see
   * ClaimService.SponsorClaim.
   */
  @GetMapping("/sponsors/{sponsorId}/claims")
  @PreAuthorize("hasAuthority('PERM_SPONSOR_READ')")
  public ng.csp.api.claim.ClaimService.SponsorClaims claims(
      SessionUser session, @PathVariable UUID sponsorId) {
    session.assertSponsorScope(sponsorId);
    return claims.forSponsor(sponsorId);
  }

  /** Who can do what here. Admin only — this screen hands out authority. */
  @GetMapping("/sponsors/{sponsorId}/users")
  @PreAuthorize("hasAuthority('PERM_ROLES_MANAGE')")
  public Map<String, List<SponsorService.ConsoleUser>> users(
      SessionUser session, @PathVariable UUID sponsorId) {
    session.assertSponsorScope(sponsorId);
    return Map.of("users", sponsors.consoleUsers(sponsorId));
  }

  /** The sponsor's own audit trail — showing your working is the point. */
  @GetMapping("/sponsors/{sponsorId}/audit")
  @PreAuthorize("hasAuthority('PERM_SPONSOR_READ')")
  public Map<String, List<SponsorService.AuditEntry>> audit(
      SessionUser session, @PathVariable UUID sponsorId) {
    session.assertSponsorScope(sponsorId);
    return Map.of("entries", sponsors.auditTrail(sponsorId));
  }

}
