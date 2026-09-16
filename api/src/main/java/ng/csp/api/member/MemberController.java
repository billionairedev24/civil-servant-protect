package ng.csp.api.member;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import ng.csp.api.auth.SessionUser;
import ng.csp.api.domain.Pricing;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
public class MemberController {

  private final MemberService members;
  private final CardService cards;

  public MemberController(MemberService members, CardService cards) {
    this.members = members;
    this.cards = cards;
  }

  @GetMapping("/members/me/summary")
  @PreAuthorize("hasAuthority('PERM_MEMBER_READ')")
  public MemberService.Summary summary(SessionUser session) {
    return members.summary(session.requireMemberId(), Instant.now());
  }

  @GetMapping("/members/me/card")
  @PreAuthorize("hasAuthority('PERM_MEMBER_READ')")
  public MemberService.Card card(SessionUser session) {
    return members.card(session.requireMemberId(), cards);
  }

  @GetMapping("/members/me/contributions")
  @PreAuthorize("hasAuthority('PERM_MEMBER_READ')")
  public MemberService.Ledger contributions(
      SessionUser session,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) String status,
      @RequestParam(defaultValue = "24") @Min(1) @Max(100) int limit) {
    return members.contributions(session.requireMemberId(), from, to, status, limit);
  }

  @GetMapping("/members/me/beneficiaries")
  @PreAuthorize("hasAuthority('PERM_MEMBER_READ')")
  public MemberService.BeneficiarySet beneficiaries(SessionUser session) {
    return members.beneficiaries(session.requireMemberId());
  }

  public record PersonBody(
      @NotBlank @Size(min = 2) String name,
      @NotBlank @Size(min = 2) String relation,
      String msisdn,
      String nin,
      @Min(0) @Max(100) int sharePct) {}

  public record ReplaceBeneficiaries(
      @NotNull
          @Size(
              min = 2,
              max = 8,
              message = "Name at least two people, so one unreachable name never stalls a claim.")
          List<@Valid PersonBody> people) {}

  @PutMapping("/members/me/beneficiaries")
  @PreAuthorize("hasAuthority('PERM_MEMBER_WRITE_BENEFICIARIES')")
  public Map<String, Object> replaceBeneficiaries(
      SessionUser session, @Valid @RequestBody ReplaceBeneficiaries body) {
    members.replaceBeneficiaries(
        session,
        body.people().stream()
            .map(p -> new MemberService.PersonInput(p.name(), p.relation(), p.msisdn(), p.nin(), p.sharePct()))
            .toList());
    return Map.of("ok", true, "people", body.people().size());
  }

  /** The annual "are these still the people you want paid?" tap. */
  @PostMapping("/members/me/beneficiaries/confirm")
  @PreAuthorize("hasAuthority('PERM_MEMBER_WRITE_BENEFICIARIES')")
  public Map<String, Instant> confirm(SessionUser session) {
    return Map.of("confirmedAt", members.confirmBeneficiaries(session));
  }

  @GetMapping("/members/me/dependants")
  @PreAuthorize("hasAuthority('PERM_MEMBER_READ')")
  public Map<String, List<MemberService.Dependant>> dependants(SessionUser session) {
    return Map.of("dependants", members.dependants(session.requireMemberId()));
  }

  public record AddDependant(
      @NotBlank @Size(min = 2) String name,
      @NotBlank @Size(min = 2) String relation,
      @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dob) {}

  @PostMapping("/members/me/dependants")
  @PreAuthorize("hasAuthority('PERM_MEMBER_WRITE_DEPENDANTS')")
  @ResponseStatus(HttpStatus.CREATED)
  public MemberService.AddedDependant addDependant(
      SessionUser session, @Valid @RequestBody AddDependant body) {
    return members.addDependant(session.requireMemberId(), body.name(), body.relation(), body.dob());
  }

  /** The benefit schedule. Keyed, not positional, so a locale can reorder it. */
  @GetMapping("/products/schedule")
  public Pricing.Schedule schedule() {
    return Pricing.SCHEDULE;
  }
}
