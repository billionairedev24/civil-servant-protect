package ng.csp.api.evidence;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import ng.csp.api.config.RlsScope;
import ng.csp.api.web.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Takes the bytes when there is no bucket to take them.
 *
 * <p>Exists only under {@code csp.evidence.mode=local}, which the prod profile refuses. In a real
 * deployment the browser PUTs to the object store's own presigned URL and this class is not even
 * registered — which is why it is a separate controller rather than a branch inside the claim one.
 *
 * <p>It authenticates the same way a presigned URL does: by the URL. The key was generated here,
 * handed to an authenticated claimant seconds earlier, and has to match a document this claim is
 * still waiting for. That is weaker than a signature over the request, and it is why this is refused
 * in production rather than hardened into something that looks safe enough to deploy.
 */
@RestController
@RequestMapping("/v1")
@ConditionalOnProperty(name = "csp.evidence.mode", havingValue = "local", matchIfMissing = true)
public class LocalEvidenceController {

  /** The same cap the claim endpoint validates, enforced again on the bytes themselves. */
  private static final long MAX_BYTES = 10L * 1024 * 1024;

  private final LocalEvidence store;
  private final JdbcClient db;

  public LocalEvidenceController(Evidence store, JdbcClient db) {
    this.store = (LocalEvidence) store;
    this.db = db;
  }

  @PutMapping("/evidence/**")
  public void upload(HttpServletRequest request) throws IOException {
    var key = request.getRequestURI().replaceFirst("^.*?/v1/evidence/", "");
    if (key.isBlank()) {
      throw ApiException.badRequest("That is not a document key.");
    }

    /*
     * Unscoped because the request carries no session — see the class note. The
     * key is the whole credential, so the check is that some claim is actually
     * waiting for this exact key: a key already uploaded against, or one that
     * was never issued, is refused.
     */
    var awaited =
        RlsScope.runUnscoped(
            () ->
                db.sql(
                        """
                        SELECT count(*)::int FROM claim_documents
                         WHERE storage_key = :k AND state <> 'received'
                        """)
                    .param("k", key)
                    .query(Integer.class)
                    .single());

    if (awaited == 0) {
      throw ApiException.notFound("No claim is waiting for that document.");
    }

    if (request.getContentLengthLong() > MAX_BYTES) {
      throw ApiException.badRequest("Documents are capped at 10 MB.");
    }

    store.write(key, request.getInputStream());
  }
}
