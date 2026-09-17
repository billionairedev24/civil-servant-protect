package ng.csp.api.evidence;

import java.io.InputStream;
import java.time.Instant;
import java.util.Map;

/**
 * Where a claim's evidence actually lives.
 *
 * <p>A death certificate, an identity page, a bank letter. Until this existed the API recorded a
 * filename, a size and a storage key the caller made up, and no bytes were stored anywhere — so a
 * claim carried a list of documents that did not exist, and an assessor had nothing to look at.
 *
 * <p>A seam rather than a direct S3 call, for the same reason as the NIMC and payout adapters: the
 * spec asks for S3-compatible object storage with server-side encryption and object lock, and a
 * laptop has none of that. {@link LocalEvidence} writes to a directory and is honest about being a
 * development thing; the prod profile refuses to start on it.
 *
 * <p>The upload never passes through this service. The API says where to put the file and the
 * browser puts it there — a ten-megabyte certificate through a request thread is a thread spent on
 * copying bytes, and at claim volume on roll week that is the wrong place for them.
 */
public interface Evidence {

  /**
   * Where to send a file, and how.
   *
   * <p>The client follows what it is given rather than knowing which storage is behind it: a
   * presigned URL at the bucket, or this service's own upload endpoint. One client path, two
   * implementations.
   */
  record Upload(
      String key,
      String url,
      String method,
      Map<String, String> headers,
      Instant expiresAt) {}

  /**
   * Somewhere to put one document of one claim.
   *
   * @param key the storage key this service chose — never one the caller supplies, because a key a
   *     caller picks is a path a caller can traverse
   */
  Upload begin(String key, String contentType, long byteSize);

  /** The bytes back, for an assessor reading what was sent. */
  InputStream read(String key);

  /** True when the object is actually there, which is not the same as the row saying so. */
  boolean exists(String key);

  /** Named in the startup log, so nobody has to guess where evidence is going. */
  String describe();
}
