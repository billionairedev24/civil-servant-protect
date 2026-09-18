package ng.csp.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import ng.csp.api.auth.Role;
import ng.csp.api.auth.TokenRoles;
import ng.csp.api.auth.TokenService;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Sets the database scope for the request from whoever is authenticated.
 *
 * <p>Runs after the security filter chain, so the token has already been verified — the scope is
 * derived from a checked signature, never from a header the caller controls.
 *
 * <p>Always clears afterwards. Leaving a scope on a thread that goes back to the pool would hand one
 * member's rows to the next request on that thread, which is the precise failure row-level security
 * exists to prevent.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class RlsScopeFilter extends OncePerRequestFilter {

  private final String ourIssuer;

  public RlsScopeFilter(CspProperties props) {
    this.ourIssuer = props.tokenIssuer();
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    try {
      RlsScope.set(isAuthBootstrap(request) ? RlsScope.system() : scopeOf());
      chain.doFilter(request, response);
    } finally {
      RlsScope.clear();
    }
  }

  /**
   * Signing in is the one path that must read {@code users} before a scope can exist — the row that
   * says which member you are is the row being looked up. These handlers touch only users and
   * devices, and each one re-checks the caller by other means: a hashed OTP, or a verified token.
   */
  private static boolean isAuthBootstrap(HttpServletRequest request) {
    var path = request.getRequestURI();
    return path.startsWith("/v1/auth/");
  }

  private RlsScope scopeOf() {
    var auth = SecurityContextHolder.getContext().getAuthentication();
    if (!(auth instanceof JwtAuthenticationToken token)) {
      return RlsScope.none();
    }
    var jwt = token.getToken();
    var role = TokenRoles.of(jwt, ourIssuer);
    if (role == null) {
      return RlsScope.none();
    }

    if (role == Role.ASSESSOR) {
      return RlsScope.forAssessor();
    }
    // CSP operations legitimately crosses sponsors; the permission set is what
    // limits them, not the row policies.
    if (role == Role.CSP_ADMIN) {
      return RlsScope.system();
    }

    if (role.isMemberSide()) {
      var memberId = jwt.getClaimAsString(TokenService.CLAIM_MEMBER_ID);
      if (memberId == null) {
        return RlsScope.none();
      }
      /*
       * Both carry a member id and they do not mean the same thing.
       *
       * A member's id is who they are. A relative's is who died — so the scope
       * it opens is the claim about that person, not that person's record. The
       * same claim on a token, read two different ways, is exactly the kind of
       * thing to make explicit rather than let a shared branch decide.
       */
      return role == Role.NEXT_OF_KIN
          ? RlsScope.forNextOfKin(UUID.fromString(memberId))
          : RlsScope.forMember(UUID.fromString(memberId));
    }

    // A console token from Keycloak does not carry our sponsor id — it carries
    // the rail code the realm knows. CurrentUser resolves that, so the scope is
    // set there instead, once we know which sponsor it maps to.
    var sponsorId = jwt.getClaimAsString(TokenService.CLAIM_SPONSOR_ID);
    return sponsorId == null ? RlsScope.none() : RlsScope.forSponsor(UUID.fromString(sponsorId));
  }
}
