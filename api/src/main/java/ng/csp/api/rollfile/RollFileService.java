package ng.csp.api.rollfile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;
import ng.csp.api.config.RlsScope;
import ng.csp.api.evidence.Evidence;
import ng.csp.api.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Produce the roll file for a finished load, and hand it back later.
 *
 * <p>Runs at the end of the load job, after the rows have reached their final states — before that
 * the file would be a snapshot of work in progress, which is a different and much less useful
 * document.
 */
@Service
public class RollFileService {

  private static final Logger log = LoggerFactory.getLogger(RollFileService.class);

  private final JdbcClient db;
  private final RollFile roll;
  private final RollFileSigner signer;
  private final Evidence store;

  public RollFileService(JdbcClient db, RollFile roll, RollFileSigner signer, Evidence store) {
    this.db = db;
    this.roll = roll;
    this.signer = signer;
    this.store = store;
  }

  /**
   * Render, sign, store, record. Never throws.
   *
   * <p>A load that posted a million contributions correctly and then could not reach the bucket is
   * not a failed load, and turning it into one — rolling back real money to punish a storage
   * outage — would be a worse outcome than the problem. So the failure is caught, written to
   * {@code roll_file_error} where the console can show it, and left for somebody to retry.
   *
   * <p>The distinction that column draws is the point: null means nothing was attempted, a message
   * means it was attempted and this is why there is no file. Leaving the keys null for both would
   * make a storage outage look exactly like a batch from before this feature existed.
   */
  public void produce(UUID batchId) {
    RollFile.Rendered rendered = null;
    try {
      var generatedAt = Instant.now();
      rendered = roll.render(batchId, generatedAt);

      var base = "roll/%s/%s".formatted(period(batchId), batchId);
      var fileKey = base + ".txt";
      var signatureKey = base + ".txt.asc";

      store.put(fileKey, "text/plain; charset=utf-8", rendered.file());

      var signature = signer.sign(rendered.file());
      var signatureFile = Files.createTempFile("roll-sig-", ".asc");
      try {
        Files.write(signatureFile, signature);
        store.put(signatureKey, "application/pgp-signature", signatureFile);
      } finally {
        Files.deleteIfExists(signatureFile);
      }

      db.sql(
              """
              UPDATE schedule_batches
                 SET object_key = :file, pgp_signature_key = :sig,
                     roll_file_sha256 = :sha, roll_file_bytes = :bytes,
                     signed_at = :at, roll_file_error = NULL
               WHERE id = :id
              """)
          .param("file", fileKey)
          .param("sig", signatureKey)
          .param("sha", rendered.sha256())
          .param("bytes", rendered.byteSize())
          .param("at", java.sql.Timestamp.from(generatedAt))
          .param("id", batchId)
          .update();

      log.info(
          "roll file for batch {} stored at {} ({} bytes, sha256 {}), signed by {}",
          batchId, fileKey, rendered.byteSize(), rendered.sha256(), signer.describe());

    } catch (Exception e) {
      log.error("roll file for batch {} could not be produced", batchId, e);
      recordFailure(batchId, e);
    } finally {
      if (rendered != null) {
        try {
          Files.deleteIfExists(rendered.file());
        } catch (IOException ignored) {
          // A leftover temp file is not worth failing or logging a second time.
        }
      }
    }
  }

  /*
   * Recorded unscoped and in its own statement.
   *
   * The job runs under the system scope, but this is the path taken when
   * something has already gone wrong, and a failure to record the failure would
   * leave the batch looking untouched. Any exception here is swallowed for the
   * same reason: this method's caller has already caught one.
   */
  private void recordFailure(UUID batchId, Exception cause) {
    try {
      RlsScope.runUnscoped(
          () ->
              db.sql("UPDATE schedule_batches SET roll_file_error = :why WHERE id = :id")
                  .param("why", summarise(cause))
                  .param("id", batchId)
                  .update());
    } catch (Exception e) {
      log.error("could not even record the roll file failure for batch {}", batchId, e);
    }
  }

  /** A sentence for the console, not a stack trace. The stack trace is already in the log. */
  private static String summarise(Exception e) {
    var message = e.getMessage();
    return e.getClass().getSimpleName() + (message == null || message.isBlank() ? "" : ": " + message);
  }

  private String period(UUID batchId) {
    return db.sql(
            """
            SELECT to_char(c.period, 'YYYY-MM')
              FROM schedule_batches b JOIN collection_cycles c ON c.id = b.cycle_id
             WHERE b.id = :id
            """)
        .param("id", batchId)
        .query(String.class)
        .single();
  }

  /** What the console needs to show, and what a download needs to find. */
  public record Stored(
      String objectKey,
      String signatureKey,
      String sha256,
      Long byteSize,
      Instant signedAt,
      String error) {}

  /**
   * The batch's roll file, or a reason there is none.
   *
   * <p>Read under the caller's own scope, so a sponsor asking about a batch that is not theirs gets
   * nothing — the row-level policy on {@code schedule_batches} already keys on the cycle's sponsor.
   */
  public Stored describe(UUID batchId) {
    return db.sql(
            """
            SELECT object_key, pgp_signature_key, roll_file_sha256, roll_file_bytes,
                   signed_at, roll_file_error
              FROM schedule_batches WHERE id = :id
            """)
        .param("id", batchId)
        .query(
            (rs, n) ->
                new Stored(
                    rs.getString("object_key"),
                    rs.getString("pgp_signature_key"),
                    rs.getString("roll_file_sha256"),
                    rs.getObject("roll_file_bytes") == null ? null : rs.getLong("roll_file_bytes"),
                    rs.getTimestamp("signed_at") == null
                        ? null
                        : rs.getTimestamp("signed_at").toInstant(),
                    rs.getString("roll_file_error")))
        .optional()
        .orElseThrow(() -> ApiException.notFound("No such schedule batch."));
  }

  /** The file itself. */
  public InputStream open(UUID batchId) {
    return store.read(keyOf(describe(batchId).objectKey()));
  }

  /** The detached signature. */
  public InputStream openSignature(UUID batchId) {
    return store.read(keyOf(describe(batchId).signatureKey()));
  }

  private static String keyOf(String key) {
    if (key == null) {
      throw ApiException.notFound("That schedule has no roll file.");
    }
    return key;
  }

  /** Published so that a signature can be checked without asking us for anything. */
  public String publicKey() {
    return signer.publicKeyArmored();
  }
}
