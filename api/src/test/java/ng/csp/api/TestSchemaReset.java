package ng.csp.api;

import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Every test run starts from an empty schema.
 *
 * <p>{@code application-test.yml} has always said it did, and it did not. It asked for
 * {@code spring.flyway.clean-on-validation-error}, which Spring Boot 4 does not have — unknown keys
 * under {@code spring.flyway} are ignored, so the line sat there reading like a guarantee and doing
 * nothing. The cost showed up whenever a migration was edited before it had shipped: Flyway found a
 * checksum it did not recognise, refused to start, and every test in the suite failed with a Spring
 * context error that says nothing about migrations. Twice in one afternoon.
 *
 * <p>It is also worth having on its own. A migration that only works against a schema some earlier
 * run left behind passes forever on a developer's machine and fails the first time it meets an empty
 * database, which is a deployment. Cleaning first means the suite exercises the migrations the way
 * production will meet them — and it is what CI already does, because CI gets a fresh container.
 *
 * <p>Lives in test sources. A bean that calls {@code flyway.clean()} has no business being in a
 * shippable artefact, whatever profile guards it.
 */
@Configuration
@Profile("test")
public class TestSchemaReset {

  private static final Logger log = LoggerFactory.getLogger(TestSchemaReset.class);

  /**
   * Clean, then migrate.
   *
   * <p>With a check on the database's own name first. The profile is the real guard and this is the
   * second one: a `test` profile activated against the wrong URL — a copied run configuration, an
   * environment variable inherited from a shell — would otherwise drop whatever it was pointed at,
   * and dropping a database is not a mistake anybody gets to undo.
   */
  @Bean
  FlywayMigrationStrategy freshSchema(DataSource dataSource) {
    return flyway -> {
      var url = urlOf(dataSource);
      var name = databaseName(url);
      /*
       * The name has to end in `_test`, not merely contain "test".
       *
       * The first version of this asked `url.contains("test")` and I proved it
       * useless by accident: a scratch database called `csp_notatest` sailed
       * through it. `csp_latest` would too, and that is a plausible name for
       * something somebody would mind losing.
       */
      if (!name.endsWith("_test")) {
        throw new IllegalStateException(
            """
            Refusing to clean '%s': this strategy drops every table before each run, and only a \
            database whose name ends in _test is assumed to be disposable.

            Point the tests at one, or do not run with --spring.profiles.active=test."""
                .formatted(name.isEmpty() ? url : name));
      }

      log.info("test run: cleaning {} and re-applying every migration", name);
      flyway.clean();
      flyway.migrate();
    };
  }

  /** The last path segment of a JDBC URL, without any query string. */
  private static String databaseName(String url) {
    var withoutQuery = url.split("[?;]", 2)[0];
    var slash = withoutQuery.lastIndexOf('/');
    return slash < 0 ? "" : withoutQuery.substring(slash + 1);
  }

  private static String urlOf(DataSource dataSource) {
    try (var connection = dataSource.getConnection()) {
      var url = connection.getMetaData().getURL();
      return url == null ? "" : url;
    } catch (Exception e) {
      // Cannot read the URL, so cannot prove this is safe to drop.
      throw new IllegalStateException("Could not identify the test database before cleaning it", e);
    }
  }
}
