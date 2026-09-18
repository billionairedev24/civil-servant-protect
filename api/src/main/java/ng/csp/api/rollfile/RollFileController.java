package ng.csp.api.rollfile;

import java.util.UUID;
import ng.csp.api.auth.SessionUser;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The roll file for a schedule batch: what it is, the file itself, and its signature. */
@RestController
@RequestMapping("/v1")
public class RollFileController {

  private final RollFileService rollFiles;

  public RollFileController(RollFileService rollFiles) {
    this.rollFiles = rollFiles;
  }

  /**
   * Whether there is a roll file, and what it is.
   *
   * <p>Separate from the download so the console can show the digest and the signing time without
   * pulling tens of megabytes to render a row in a table.
   */
  @GetMapping("/sponsors/{sponsorId}/schedules/{batchId}/roll-file")
  @PreAuthorize("hasAuthority('PERM_SPONSOR_READ')")
  public RollFileService.Stored describe(
      SessionUser session, @PathVariable UUID sponsorId, @PathVariable UUID batchId) {
    session.assertSponsorScope(sponsorId);
    return rollFiles.describe(batchId);
  }

  /**
   * The file.
   *
   * <p>Streamed through this service rather than handed out as a presigned GET, for the reason a
   * claim document is: this lists every name and service number on a payroll, and a presigned URL
   * is a link that works for whoever ends up holding it.
   *
   * <p>As an attachment, not inline. It is evidence somebody keeps beside the signature, and a
   * browser rendering it as a wall of text in a tab is not that.
   */
  @GetMapping("/sponsors/{sponsorId}/schedules/{batchId}/roll-file/download")
  @PreAuthorize("hasAuthority('PERM_SPONSOR_READ')")
  public ResponseEntity<Resource> download(
      SessionUser session, @PathVariable UUID sponsorId, @PathVariable UUID batchId) {
    session.assertSponsorScope(sponsorId);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType("text/plain; charset=utf-8"))
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename(batchId + ".txt").build().toString())
        .body(new InputStreamResource(rollFiles.open(batchId)));
  }

  /** The detached signature, as {@code gpg --verify} wants it. */
  @GetMapping("/sponsors/{sponsorId}/schedules/{batchId}/roll-file/signature")
  @PreAuthorize("hasAuthority('PERM_SPONSOR_READ')")
  public ResponseEntity<Resource> signature(
      SessionUser session, @PathVariable UUID sponsorId, @PathVariable UUID batchId) {
    session.assertSponsorScope(sponsorId);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType("application/pgp-signature"))
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename(batchId + ".txt.asc").build().toString())
        .body(new InputStreamResource(rollFiles.openSignature(batchId)));
  }

  /**
   * The public key, to anyone who asks.
   *
   * <p>Open, like the JWKS endpoint and for the same reason: the point of publishing a verifying
   * key is that nobody has to be handed one out of band. A signature that can only be checked by
   * people with an account is a signature that mostly cannot be checked.
   */
  @GetMapping(value = "/roll-files/public-key", produces = "application/pgp-keys")
  public String publicKey() {
    return rollFiles.publicKey();
  }
}
