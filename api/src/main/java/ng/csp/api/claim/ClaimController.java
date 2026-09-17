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
import ng.csp.api.evidence.Evidence;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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

  public record BeginUpload(
      @NotBlank String docKey,
      @NotBlank String filename,
      @NotBlank @Pattern(
              regexp = "application/pdf|image/jpeg|image/png",
              message = "Send a PDF, a JPEG or a PNG.")
          String contentType,
      @Positive @Max(value = 10 * 1024 * 1024, message = "Documents are capped at 10 MB")
          int byteSize) {}

  /**
   * Ask where to put a file.
   *
   * <p>The answer is a URL the client uploads to directly — a presigned PUT at the bucket, or this
   * service's own endpoint in development. Either way the client follows what it is given and does
   * not know which storage is behind it.
   */
  @PostMapping("/claims/{ref}/documents/upload")
  @PreAuthorize("hasAuthority('PERM_CLAIM_CREATE')")
  public Evidence.Upload beginUpload(
      SessionUser session, @PathVariable String ref, @Valid @RequestBody BeginUpload body) {
    return claims.beginUpload(
        session, ref, body.docKey(), body.filename(), body.contentType(), body.byteSize());
  }

  public record AttachDocument(@NotBlank String docKey) {}

  /** Confirm the upload landed. The server checks the store rather than taking the client's word. */
  @PostMapping("/claims/{ref}/documents")
  @PreAuthorize("hasAuthority('PERM_CLAIM_CREATE')")
  public ClaimService.DocumentResult attach(
      SessionUser session, @PathVariable String ref, @Valid @RequestBody AttachDocument body) {
    return claims.attachDocument(session, ref, body.docKey());
  }

  /**
   * Read a document back — the assessor's copy of the certificate.
   *
   * <p>Streamed through this service rather than handed out as a presigned GET, because a presigned
   * URL to a death certificate is a link that works for anyone who ends up with it, and these are
   * exactly the documents whose reads should appear in an audit trail.
   */
  @GetMapping("/claims/{ref}/documents/{docKey}/file")
  @PreAuthorize("hasAuthority('PERM_CLAIM_READ_OWN') or hasAuthority('PERM_CLAIM_READ_ANY')")
  public ResponseEntity<Resource> document(
      SessionUser session, @PathVariable String ref, @PathVariable String docKey) {
    var doc = claims.document(session, ref, docKey);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(doc.contentType()))
        // Inline: an assessor wants to look at it, not collect a downloads folder.
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.inline().filename(doc.filename()).build().toString())
        .body(new InputStreamResource(doc.body()));
  }

  /**
   * Who this claim is about.
   *
   * <p>For a relative who has just signed in and has to be sure they have the right person before
   * they report a death. The name and the CSP-ID and nothing else — not the cover, not the
   * premium, not the grade, all of which `/v1/members/me/summary` would have handed over.
   */
  @GetMapping("/claims/subject")
  @PreAuthorize("hasAuthority('PERM_CLAIM_CREATE')")
  public ClaimService.Subject subject(SessionUser session) {
    return claims.subject(session);
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

  public record Pay(
      @NotBlank @Pattern(regexp = "\\d{3}", message = "A bank code is three digits") String bankCode,
      @NotBlank @Pattern(regexp = "\\d{10}", message = "A NUBAN account number is ten digits")
          String accountNumber) {}

  /**
   * Send an approved claim's money.
   *
   * <p>A different permission from assessing, held by a different role. The assessor decides;
   * operations pays. See ClaimService#pay and the payer_is_not_assessor constraint.
   */
  @PostMapping("/claims/{ref}/pay")
  @PreAuthorize("hasAuthority('PERM_CLAIM_PAY')")
  public ClaimService.Paid pay(
      SessionUser session, @PathVariable String ref, @Valid @RequestBody Pay body) {
    return claims.pay(session, ref, body.bankCode(), body.accountNumber());
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
