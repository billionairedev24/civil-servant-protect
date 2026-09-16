package ng.csp.api.enrolment;

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
import java.util.UUID;
import ng.csp.api.auth.SessionUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Enrolling a member, from the sponsor's side.
 *
 * <p>Under {@code /v1/sponsors/{id}/...} rather than a top-level {@code /v1/enrolment}, because the
 * sponsor is not a parameter of enrolment — it is whose staff these are. The URL says so, the
 * permission is checked against it, and row-level security scopes everything underneath.
 *
 * <p>There is deliberately no public version of any of this. A public enrolment endpoint is an
 * oracle: give it a NIN and it tells you whether that person is on the scheme, or lets somebody
 * attach a phone number they control to a civil servant whose details they have read. Membership is
 * defined by payroll, so self-service enrolment would add an attack surface and nothing else.
 */
@RestController
@RequestMapping("/v1")
public class EnrolmentController {

  private final EnrolmentService enrolment;

  public EnrolmentController(EnrolmentService enrolment) {
    this.enrolment = enrolment;
  }

  public record VerifyIdentity(
      @NotBlank @Pattern(regexp = "\\d{11}", message = "A NIN is eleven digits") String nin,
      @NotBlank @Size(min = 3) String fullName,
      @NotNull LocalDate dateOfBirth) {}

  /**
   * Check a staff record against NIMC before committing to it.
   *
   * <p>Separate from enrolling so an officer working through a pile of new starters can check one
   * without creating it — a name that does not match is a trip back to the personnel file, not a
   * member.
   *
   * <p>200 with {@code verified: false} rather than a 4xx for a mismatch: a mismatch is an answer,
   * not a malformed request, and the screen showing it needs the reason.
   */
  @PostMapping("/sponsors/{sponsorId}/enrolment/verify")
  @PreAuthorize("hasAuthority('PERM_MEMBERS_MANAGE')")
  public EnrolmentService.Identity verify(
      SessionUser session, @PathVariable UUID sponsorId, @Valid @RequestBody VerifyIdentity body) {
    session.assertSponsorScope(sponsorId);
    return enrolment.verifyIdentity(body.nin(), body.fullName(), body.dateOfBirth());
  }

  public record BeneficiaryBody(
      @NotBlank String name,
      @NotBlank String relation,
      String msisdn,
      @Min(0) @Max(100) int sharePct) {}

  public record NewMember(
      @NotBlank @Pattern(regexp = "\\d{11}", message = "A NIN is eleven digits") String nin,
      @NotBlank @Size(min = 3) String fullName,
      @NotNull LocalDate dateOfBirth,
      /*
       * The number the SMS goes to, and the only credential this member will
       * ever have. Wrong here means somebody else is told they have cover and
       * can sign in as them, which is why it is validated to a shape rather
       * than accepted as typed.
       */
      @NotBlank @Pattern(regexp = "\\+234\\d{10}", message = "A phone number is +234 and ten digits")
          String msisdn,
      String serviceNo,
      String grade,
      @NotBlank @Pattern(regexp = "basic|standard|enhanced|executive") String tier,
      List<@Valid BeneficiaryBody> beneficiaries) {}

  /** Add one person. The HR desk's common case. */
  @PostMapping("/sponsors/{sponsorId}/members")
  @PreAuthorize("hasAuthority('PERM_MEMBERS_MANAGE')")
  @ResponseStatus(HttpStatus.CREATED)
  public EnrolmentService.Enrolled add(
      SessionUser session, @PathVariable UUID sponsorId, @Valid @RequestBody NewMember body) {
    session.assertSponsorScope(sponsorId);
    return enrolment.enrol(
        body.nin(),
        body.fullName(),
        body.dateOfBirth(),
        body.msisdn(),
        sponsorId,
        body.serviceNo(),
        body.grade(),
        body.tier(),
        toBeneficiaries(body.beneficiaries()));
  }

  /*
   * A list of new starters, capped well below the schedule loader's ceiling.
   *
   * Enrolment is not a bulk load: every row is a NIMC call over an IPsec tunnel
   * and a member who will be texted. A thousand at a time keeps the request
   * honest about how long it takes and keeps a mistyped file from generating
   * ten thousand SMS messages before anybody notices.
   */
  public record NewMembers(@NotEmpty @Size(max = 1_000) List<@Valid NewMember> members) {}

  /**
   * Add a list of them.
   *
   * <p>Row by row, and it does not stop at the first failure. A file of two hundred new starters
   * with three bad NINs should enrol a hundred and ninety-seven people and tell the officer about
   * the three — not refuse the lot, which is what a single transaction would do and what would send
   * them back to a spreadsheet to find the problem themselves.
   */
  @PostMapping("/sponsors/{sponsorId}/members/batch")
  @PreAuthorize("hasAuthority('PERM_MEMBERS_MANAGE')")
  public EnrolmentService.BulkResult addAll(
      SessionUser session, @PathVariable UUID sponsorId, @Valid @RequestBody NewMembers body) {
    session.assertSponsorScope(sponsorId);
    return enrolment.enrolAll(
        sponsorId,
        body.members().stream()
            .map(
                m ->
                    new EnrolmentService.Candidate(
                        m.nin(),
                        m.fullName(),
                        m.dateOfBirth(),
                        m.msisdn(),
                        m.serviceNo(),
                        m.grade(),
                        m.tier(),
                        toBeneficiaries(m.beneficiaries())))
            .toList());
  }

  private static List<EnrolmentService.NewBeneficiary> toBeneficiaries(List<BeneficiaryBody> given) {
    return given == null
        ? List.of()
        : given.stream()
            .map(
                b ->
                    new EnrolmentService.NewBeneficiary(
                        b.name(), b.relation(), b.msisdn(), b.sharePct()))
            .toList();
  }
}
