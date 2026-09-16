package ng.csp.api.integration;

import java.time.Instant;
import java.util.List;

/**
 * The payroll SFTP endpoints, where return files appear.
 *
 * <p>This is the rail the whole console is built around, and it is a directory on someone else's
 * server. IPPIS does not have an API. A schedule is sent, it sits on a desk for most of a month, and
 * one day a file appears — or does not, which is the console's "file overdue" state.
 *
 * <p>Absence is not failure. A poller that treated "no file today" as an error would open the
 * circuit breaker on the twenty-nine days of the month when everything is working exactly as
 * intended, so only connection and authentication problems count against it.
 *
 * <p>Files are fetched, never deleted. The remote directory is somebody else's record of what they
 * sent us, and a reconciliation dispute is settled by both sides still having it.
 */
public interface ReturnFiles {

  /** A file sitting on the remote endpoint. */
  record Remote(String path, long sizeBytes, Instant modifiedAt) {}

  /**
   * What is there now.
   *
   * @param sponsorRef which sponsor's endpoint — each MDA has its own host, credentials and naming
   *     convention, and the configuration for them is per-sponsor for that reason.
   */
  List<Remote> list(String sponsorRef);

  /**
   * Fetch one, by content.
   *
   * <p>Returned as bytes rather than streamed to disk: a return file is a few tens of megabytes at
   * the largest sponsor, the parser reads it once, and a temporary file is one more thing holding L3
   * data on a pod's filesystem.
   */
  byte[] fetch(String sponsorRef, String path);
}
