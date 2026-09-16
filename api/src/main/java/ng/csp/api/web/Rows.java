package ng.csp.api.web;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;

/**
 * Small ResultSet helpers.
 *
 * <p>{@code getObject(col, Instant.class)} is not supported by the PostgreSQL driver for
 * {@code timestamptz} — it throws at runtime rather than failing to compile, so it reads as correct
 * until the first request touches that column. Going through {@code OffsetDateTime} is the
 * supported path and keeps the offset explicit.
 */
public final class Rows {

  private Rows() {}

  public static Instant instant(ResultSet rs, String column) throws SQLException {
    var value = rs.getObject(column, java.time.OffsetDateTime.class);
    return value == null ? null : value.toInstant();
  }
}
