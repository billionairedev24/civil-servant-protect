package ng.csp.api.rollfile;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * What a payroll sent, and what we decided about it, as bytes somebody can keep.
 *
 * <p>The question this answers is the one an auditor actually asks: <em>show me what the Ministry
 * of Education sent in August and what you did with it</em>. Until this existed the only answer was
 * a query against {@code schedule_rows} — live, mutable, and worth exactly as much as the trust
 * placed in whoever ran it. A stored file with a signature over it is a different kind of answer.
 *
 * <h2>Why a plain text format</h2>
 *
 * <p>Tab-separated UTF-8, rendered here rather than by a library. A roll file has to be readable in
 * thirty years by somebody with no access to this code, which rules out anything whose meaning
 * lives in a schema kept somewhere else. It also has to be byte-stable, and hand-rolling the
 * serialisation is the only way to be sure of that — a JSON writer is free to reorder keys, a CSV
 * library is free to change its quoting rules in a minor release, and either would silently
 * invalidate every signature made before the upgrade.
 *
 * <h2>Escaping, which is not a detail</h2>
 *
 * <p>Names come from payroll exports and payroll exports contain surprises. A tab inside a name
 * would shift every later column on that line; a newline would split one row into two. Either makes
 * the file ambiguous, and an ambiguous canonical format defeats the point of signing it — two
 * readers would disagree about what was signed. So backslash, tab, CR and LF are escaped, and the
 * escape character is escaped first.
 *
 * <h2>Rendered once</h2>
 *
 * <p>The file is written at the end of a load and never rewritten. Verification reads the stored
 * bytes; it does not re-render and compare. That is deliberate: re-rendering makes the signature a
 * statement about this code's current output rather than about what was recorded at the time, so
 * any later change to this format — a new column, a different header — would retroactively
 * invalidate history. The {@code generated} header is in the file for the same reason it makes
 * re-rendering impossible: it records when this was written down.
 */
@Component
public class RollFile {

  /** Bumped only if the format changes in a way a reader would notice. Old files keep their own. */
  static final String FORMAT = "CSP-ROLL/1";

  /**
   * Rows per round trip while rendering.
   *
   * <p>Without a fetch size the Postgres driver materialises the whole result set before the first
   * row is handed over, so a federal schedule arrives as one very large array in the heap — which
   * is the thing streaming to a file was supposed to avoid. Streaming also requires the connection
   * not to be in autocommit, which inside the job's transaction it is not.
   */
  private static final int FETCH = 10_000;

  private final JdbcTemplate jdbc;

  public RollFile(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** A rendered file on local disk, with the digest of exactly the bytes that were written. */
  public record Rendered(Path file, String sha256, long byteSize) {}

  /**
   * Render the batch to a temporary file.
   *
   * <p>The caller owns the file and must delete it. It is a temporary because the destination is
   * object storage and the upload wants a length up front — holding a million rows in memory to
   * have one would defeat the streaming above.
   */
  public Rendered render(UUID batchId, Instant generatedAt) {
    Path file;
    try {
      file = Files.createTempFile("roll-" + batchId + "-", ".txt");
    } catch (IOException e) {
      throw new UncheckedIOException("Could not open a temporary file for the roll file", e);
    }

    var digest = sha256();
    try (OutputStream out = Files.newOutputStream(file);
        var digested = new DigestOutputStream(out, digest);
        var writer = new BufferedWriter(new OutputStreamWriter(digested, StandardCharsets.UTF_8))) {

      header(writer, batchId, generatedAt);
      rows(writer, batchId);

    } catch (IOException e) {
      deleteQuietly(file);
      throw new UncheckedIOException("Could not render the roll file for batch " + batchId, e);
    }

    try {
      return new Rendered(file, HexFormat.of().formatHex(digest.digest()), Files.size(file));
    } catch (IOException e) {
      deleteQuietly(file);
      throw new UncheckedIOException("Could not measure the roll file for batch " + batchId, e);
    }
  }

  /**
   * The header: everything needed to know what this file is, without our database.
   *
   * <p>Names rather than only ids, because a UUID identifies a sponsor to this system and to nobody
   * else. A file that says {@code 8f3a-…} is one whose meaning depends on a database still
   * existing, which is precisely the dependency a stored record is supposed to remove.
   */
  private void header(BufferedWriter out, UUID batchId, Instant generatedAt) throws IOException {
    var head =
        jdbc.queryForMap(
            """
            SELECT b.id, b.filename, b.row_count, b.staged_count, b.loaded_count,
                   b.started_at, b.finished_at,
                   c.id AS cycle_id, c.period, c.rail_ref,
                   s.id AS sponsor_id, s.name AS sponsor_name, s.rail_code,
                   (SELECT count(*) FROM schedule_rows r
                     WHERE r.batch_id = b.id AND r.state = 'rejected') AS rejected_count,
                   (SELECT COALESCE(sum(amount_minor), 0) FROM schedule_rows r
                     WHERE r.batch_id = b.id AND r.state = 'loaded') AS loaded_minor,
                   (SELECT COALESCE(sum(amount_minor), 0) FROM schedule_rows r
                     WHERE r.batch_id = b.id) AS submitted_minor
              FROM schedule_batches b
              JOIN collection_cycles c ON c.id = b.cycle_id
              JOIN sponsors s ON s.id = c.sponsor_id
             WHERE b.id = ?
            """,
            batchId);

    out.write(FORMAT);
    out.write('\n');
    field(out, "batch", head.get("id"));
    field(out, "sponsor", head.get("sponsor_id"));
    field(out, "sponsor-name", head.get("sponsor_name"));
    field(out, "rail-code", head.get("rail_code"));
    field(out, "cycle", head.get("cycle_id"));
    field(out, "period", head.get("period"));
    field(out, "rail-ref", head.get("rail_ref"));
    field(out, "filename", head.get("filename"));
    field(out, "load-started", head.get("started_at"));
    field(out, "load-finished", head.get("finished_at"));
    field(out, "generated", generatedAt);
    field(out, "rows-submitted", head.get("staged_count"));
    field(out, "rows-loaded", head.get("loaded_count"));
    field(out, "rows-rejected", head.get("rejected_count"));
    /*
     * Both totals, because they answer different questions and the gap between
     * them is the interesting number: what the payroll believed it was sending,
     * and what the scheme actually took. A file that reports only one of them
     * makes the discrepancy invisible, which is the discrepancy somebody is
     * looking for.
     */
    field(out, "submitted-minor", head.get("submitted_minor"));
    field(out, "loaded-minor", head.get("loaded_minor"));
    out.write('\n');
    out.write("line\tservice-no\tname\tamount-minor\tstate\treason\n");
  }

  private void rows(BufferedWriter out, UUID batchId) {
    jdbc.query(
        connection -> {
          var ps =
              connection.prepareStatement(
                  """
                  SELECT line_no, service_no, full_name, amount_minor, state, reason
                    FROM schedule_rows
                   WHERE batch_id = ?
                   ORDER BY line_no
                  """);
          ps.setObject(1, batchId);
          ps.setFetchSize(FETCH);
          return ps;
        },
        (ResultSet rs) -> {
          try {
            out.write(Integer.toString(rs.getInt("line_no")));
            out.write('\t');
            out.write(escape(rs.getString("service_no")));
            out.write('\t');
            out.write(escape(rs.getString("full_name")));
            out.write('\t');
            // Minor units, as an integer, never formatted. A thousands
            // separator or a decimal point is a locale's opinion, and a file
            // that renders differently in two places is not a canonical file.
            out.write(Long.toString(rs.getLong("amount_minor")));
            out.write('\t');
            out.write(escape(rs.getString("state")));
            out.write('\t');
            out.write(escape(rs.getString("reason")));
            out.write('\n');
          } catch (IOException e) {
            // RowCallbackHandler cannot throw IOException; the transaction and
            // the temp file are both cleaned up by render()'s caller.
            throw new UncheckedIOException(e);
          }
        });
  }

  private static void field(BufferedWriter out, String name, Object value) throws IOException {
    out.write(name);
    out.write(": ");
    out.write(escape(render(value)));
    out.write('\n');
  }

  /**
   * One rendering per kind of value, and every instant in UTC with its offset on it.
   *
   * <p>The driver hands timestamps back as {@link java.sql.Timestamp}, whose {@code toString} is a
   * space-separated local time with no zone — so the file said {@code 2026-09-18 04:07:44} and left
   * a reader to guess which four in the morning that was, next to a {@code generated} field that
   * was correctly {@code …Z}. Two formats and one of them ambiguous, in a document whose entire
   * purpose is to be unambiguous later.
   */
  private static String render(Object value) {
    return switch (value) {
      case null -> "";
      case java.sql.Timestamp timestamp -> timestamp.toInstant().toString();
      case Instant instant -> instant.toString();
      // java.sql.Date and LocalDate both render as yyyy-MM-dd, which is what a
      // period wants: a month has no time and no zone.
      default -> String.valueOf(value);
    };
  }

  /**
   * Backslash first, then the three characters that would change the shape of the file.
   *
   * <p>Order matters: escaping the tab before the backslash would turn a literal {@code \} followed
   * by {@code t} into something a reader unescapes as a tab.
   */
  static String escape(String value) {
    if (value == null) {
      return "";
    }
    return value
        .replace("\\", "\\\\")
        .replace("\t", "\\t")
        .replace("\r", "\\r")
        .replace("\n", "\\n");
  }

  private static MessageDigest sha256() {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 is required and this JVM does not have it", e);
    }
  }

  private static void deleteQuietly(Path file) {
    try {
      Files.deleteIfExists(file);
    } catch (IOException ignored) {
      // Already failing; a leftover temp file is not the thing to report.
    }
  }
}
