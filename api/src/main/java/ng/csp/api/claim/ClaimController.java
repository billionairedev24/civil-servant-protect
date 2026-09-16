package ng.csp.api.claim;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import ng.csp.api.auth.SessionUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
public class ClaimController {

  private final ClaimService claims;

  public ClaimController(ClaimService claims) {
    this.claims = claims;
  }

  public record OpenClaim(
      @NotBlank @Pattern(regexp = "death|accident|disability") String type,
      @NotBlank @Size(min = 2) String claimantRelation,
      Map<String, Object> answers) {}

  @PostMapping("/claims")
  @PreAuthorize("hasAuthority('PERM_CLAIM_CREATE')")
  @ResponseStatus(HttpStatus.CREATED)
  public ClaimService.Opened open(SessionUser session, @Valid @RequestBody OpenClaim body) {
    return claims.open(
        session, body.type(), body.claimantRelation(),
        body.answers() == null ? Map.of() : body.answers());
  }

  @GetMapping("/claims/{ref}")
  @PreAuthorize("hasAuthority('PERM_CLAIM_READ_OWN') or hasAuthority('PERM_CLAIM_READ_ANY')")
  public ClaimService.ClaimDetail byRef(SessionUser session, @PathVariable String ref) {
    return claims.byRef(session, ref);
  }

  public record AttachDocument(
      @NotBlank String docKey,
      @NotBlank String filename,
      @NotBlank @Pattern(regexp = "application/pdf|image/jpeg|image/png") String contentType,
      @Positive @Max(value = 10 * 1024 * 1024, message = "Documents are capped at 10 MB") int byteSize,
      @NotBlank String storageKey) {}

  @PostMapping("/claims/{ref}/documents")
  @PreAuthorize("hasAuthority('PERM_CLAIM_CREATE')")
  public ClaimService.DocumentResult attach(
      SessionUser session, @PathVariable String ref, @Valid @RequestBody AttachDocument body) {
    return claims.attachDocument(
        session, ref, body.docKey(), body.filename(), body.contentType(),
        body.byteSize(), body.storageKey());
  }

  /** The member's own claims. Scoped to the session — there is no id to pass. */
  @GetMapping("/members/me/claims")
  @PreAuthorize("hasAuthority('PERM_CLAIM_READ_OWN')")
  public Map<String, List<ClaimService.MyClaim>> mine(SessionUser session) {
    return Map.of("claims", claims.mine(session));
  }

  @GetMapping("/claims")
  @PreAuthorize("hasAuthority('PERM_CLAIM_READ_ANY')")
  public Map<String, List<ClaimService.QueueItem>> queue() {
    return Map.of("claims", claims.queue());
  }

  public record Assess(
      @NotBlank @Pattern(regexp = "approve|decline|request_more") String decision,
      @NotBlank @Size(min = 4, message = "Say why — this is kept on the claim trail.") String note,
      Long amountMinor) {}

  @PostMapping("/claims/{ref}/assess")
  @PreAuthorize("hasAuthority('PERM_CLAIM_ASSESS')")
  public Map<String, String> assess(
      SessionUser session, @PathVariable String ref, @Valid @RequestBody Assess body) {
    var state = claims.assess(session, ref, body.decision(), body.note(), body.amountMinor());
    return Map.of("ref", ref, "state", state);
  }
}
