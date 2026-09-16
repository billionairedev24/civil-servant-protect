package ng.csp.api.auth;

import java.util.List;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Reads the role out of whichever kind of token arrived.
 *
 * <p>Lives beside the roles rather than in the security configuration, because it is a fact about
 * the token format and both the filter chain and the argument resolver need it.
 */
public final class TokenRoles {

  private TokenRoles() {}

  /**
   * Ours puts the role in a {@code role} claim. Keycloak puts realm roles in {@code
   * realm_access.roles}, where a user may hold several — including realm defaults like {@code
   * offline_access} that mean nothing here. So the most capable CSP role present wins, rather than
   * the first, which would depend on Keycloak's ordering.
   */
  public static Role of(Jwt jwt, String ourIssuer) {
    var issuer = jwt.getIssuer() == null ? null : jwt.getIssuer().toString();

    if (ourIssuer.equals(issuer)) {
      // A refresh token is not an access token. Presenting one here grants nothing.
      if (!"access".equals(jwt.getClaimAsString(TokenService.CLAIM_KIND))) {
        return null;
      }
      return Role.fromWire(jwt.getClaimAsString(TokenService.CLAIM_ROLE));
    }

    var realmAccess = jwt.getClaimAsMap("realm_access");
    if (realmAccess == null || !(realmAccess.get("roles") instanceof List<?> roles)) {
      return null;
    }
    Role best = null;
    for (var raw : roles) {
      Role candidate;
      try {
        candidate = Role.fromWire(String.valueOf(raw));
      } catch (IllegalArgumentException ignored) {
        continue; // a realm role that is not one of ours
      }
      if (best == null || candidate.permissions().size() > best.permissions().size()) {
        best = candidate;
      }
    }
    return best;
  }
}
