package ng.csp.api.config;

import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.jdbc.datasource.DelegatingDataSource;

/**
 * Applies the current {@link RlsScope} to every connection as it is checked out.
 *
 * <p>Doing it here rather than at each call site is the point: a query cannot forget, and adding a
 * new repository method cannot accidentally bypass the policies.
 *
 * <p>The settings are session-level rather than transaction-level, because reads here are not all
 * inside a transaction and {@code SET LOCAL} outside one does nothing silently. Session-level on a
 * pooled connection would be a leak — so every checkout writes all four values, including the empty
 * ones. A connection returning to the pool carrying a stale scope cannot hand it to the next
 * borrower, because the next borrower overwrites it before running anything.
 */
public class ScopedDataSource extends DelegatingDataSource {

  public ScopedDataSource(DataSource target) {
    super(target);
  }

  @Override
  public Connection getConnection() throws SQLException {
    return apply(super.getConnection());
  }

  @Override
  public Connection getConnection(String username, String password) throws SQLException {
    return apply(super.getConnection(username, password));
  }

  private static Connection apply(Connection connection) throws SQLException {
    var scope = RlsScope.current();
    try (var statement = connection.prepareStatement(
        """
        SELECT set_config('csp.member_id',  ?, false),
               set_config('csp.sponsor_id', ?, false),
               set_config('csp.assessor',   ?, false),
               set_config('csp.unscoped',   ?, false)
        """)) {
      statement.setString(1, scope.memberId() == null ? "" : scope.memberId().toString());
      statement.setString(2, scope.sponsorId() == null ? "" : scope.sponsorId().toString());
      statement.setString(3, scope.assessor() ? "on" : "off");
      statement.setString(4, scope.unscoped() ? "on" : "off");
      statement.execute();
    } catch (SQLException e) {
      // A connection we could not scope is more dangerous than no connection.
      connection.close();
      throw e;
    }
    return connection;
  }
}
