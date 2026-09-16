package ng.csp.api.auth;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Resolves the sponsor reference Keycloak carries into our sponsor id.
 *
 * <p>The realm knows an MDA by its rail code — IPPIS deduction code CSP-114, schedule CSP-LA-07 —
 * because that is what an administrator setting up an officer's account actually has in front of
 * them. A UUID in a realm attribute would be copied wrong.
 */
@Component
public class SponsorDirectory {

  private final JdbcClient db;

  public SponsorDirectory(JdbcClient db) {
    this.db = db;
  }

  public UUID idForRef(String railCode) {
    return db.sql("SELECT id FROM sponsors WHERE rail_code = :ref")
        .param("ref", railCode)
        .query(UUID.class)
        .optional()
        .orElse(null);
  }
}
