package ng.csp.api.auth;

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
 */
@Component
public class CurrentUser implements HandlerMethodArgumentResolver {

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

    var auth = request.getUserPrincipal();
    if (!(auth instanceof JwtAuthenticationToken token) || !(token.getToken() instanceof Jwt jwt)) {
      throw ApiException.unauthorized("Sign in to continue.");
    }
    var session = TokenService.sessionOf(jwt, "access");
    if (session == null) {
      throw ApiException.unauthorized("That token cannot be used here.");
    }
    return session;
  }
}
