package ng.csp.api.auth;

import java.util.UUID;
import ng.csp.api.config.CspProperties;
import ng.csp.api.config.RlsScope;
import ng.csp.api.web.ApiException;
import org.springframework.core.MethodParameter;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * Resolves a {@link SessionUser} argument on a controller method, so handlers take the caller as a
 * parameter rather than reaching into the security context.
 *
 * <p>Both token shapes land here. A member token already carries everything a session needs. A
 * Keycloak token carries an identity and realm roles, so the sponsor binding is looked up — and
 * provisioned on first sign-in, which is what lets an officer added to the realm start work without
 * a second admin step nobody remembers to do.
 */
@Component
public class CurrentUser implements HandlerMethodArgumentResolver {

  private final AuthService auth;
  private final SponsorDirectory sponsors;
  private final String ourIssuer;

  public CurrentUser(AuthService auth, SponsorDirectory sponsors, CspProperties props) {
    this.auth = auth;
    this.sponsors = sponsors;
    this.ourIssuer = props.tokenIssuer();
  }

  @Override
  public boolean supportsParameter(MethodParameter parameter) {
    return SessionUser.class.equals(parameter.getParameterType());
  }

  @Override
  public Object resolveArgument(
      MethodParameter parameter,
      ModelAndViewContainer mav,
      NativeWebRequest request,
      WebDataBinderFactory binderFactory) {

    var principal = request.getUserPrincipal();
    if (!(principal instanceof JwtAuthenticationToken token)) {
      throw ApiException.unauthorized("Sign in to continue.");
    }
    var jwt = token.getToken();

    if (ourIssuer.equals(issuerOf(jwt))) {
      var session = TokenService.sessionOf(jwt, "access");
      if (session == null) {
        throw ApiException.unauthorized("That token cannot be used here.");
      }
      return session;
    }

    return fromKeycloak(jwt);
  }

  private SessionUser fromKeycloak(Jwt jwt) {
    var role = TokenRoles.of(jwt, ourIssuer);
    if (role == null) {
      throw ApiException.forbidden(
          "Your account holds no Civil Servant Protect role. Ask an administrator to assign one.");
    }

    // Which sponsor this officer works for. Keycloak carries it as a claim the
    // realm sets, because the realm is where an MDA's staff are administered.
    var sponsorRef = jwt.getClaimAsString("sponsor_ref");
    UUID sponsorId = sponsorRef == null ? null : sponsors.idForRef(sponsorRef);

    // Resolving the account has to look at `users` before the sponsor scope is
    // known, so it runs unscoped — then the scope is set for the rest of the
    // request from what it found.
    var session =
        RlsScope.runUnscoped(
            () ->
                auth.resolveOidcUser(
                    jwt.getSubject(),
                    jwt.getClaimAsString("name") != null ? jwt.getClaimAsString("name") : jwt.getSubject(),
                    jwt.getClaimAsString("email"),
                    role,
                    sponsorId));

    if (session.sponsorId() != null) {
      RlsScope.set(RlsScope.forSponsor(session.sponsorId()));
    }
    return session;
  }

  private static String issuerOf(Jwt jwt) {
    return jwt.getIssuer() == null ? null : jwt.getIssuer().toString();
  }
}
