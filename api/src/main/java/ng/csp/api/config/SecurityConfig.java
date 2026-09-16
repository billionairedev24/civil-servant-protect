package ng.csp.api.config;

import com.nimbusds.jwt.JWTParser;
import java.util.List;
import javax.crypto.spec.SecretKeySpec;
import ng.csp.api.auth.TokenRoles;
import ng.csp.api.crypto.KeyVault;
import ng.csp.api.auth.TokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Two ways in, on purpose.
 *
 * <p>Console roles authenticate against Keycloak — OIDC with TOTP, eight realm roles, SSO-ready for
 * OAGF later. Members and next of kin get NIN+DOB and an SMS OTP, and a token this service mints
 * itself. A finance officer has an MDA account; a civil servant on a Tecno has a phone number and
 * nothing else, and forcing either through the other's mechanism makes it worse for them.
 *
 * <p>Both arrive as bearer JWTs, so one decoder dispatches on the issuer: ours are HS256 signed with
 * the shared secret, Keycloak's are RS256 verified against the realm's JWKS.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

  private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

  private final CspProperties props;
  private final KeyVault keys;
  private final String keycloakIssuer;

  public SecurityConfig(
      CspProperties props,
      KeyVault keys,
      @Value("${csp.keycloak.issuer-uri:}") String keycloakIssuer) {
    this.props = props;
    this.keys = keys;
    this.keycloakIssuer = keycloakIssuer;
  }

  @Bean
  SecurityFilterChain api(HttpSecurity http) throws Exception {
    return http
        // No cookies, no sessions, no browser form posts — so CSRF has nothing
        // to protect. Every call carries a bearer token or it is anonymous.
        .csrf(csrf -> csrf.disable())
        .cors(cors -> cors.configurationSource(corsSource()))
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            auth ->
                auth.requestMatchers("/actuator/health/**", "/actuator/info", "/actuator/prometheus")
                    .permitAll()
                    // Signing in cannot require being signed in.
                    .requestMatchers(
                        HttpMethod.POST, "/v1/auth/otp", "/v1/auth/verify", "/v1/auth/refresh")
                    .permitAll()
                    // A public key is public. The point of publishing it is that
                    // no service has to be handed one out of band.
                    .requestMatchers(HttpMethod.GET, "/v1/auth/jwks")
                    .permitAll()
                    .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html")
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .oauth2ResourceServer(
            oauth -> oauth.jwt(jwt -> jwt.decoder(dispatchingDecoder()).jwtAuthenticationConverter(converter())))
        .build();
  }

  /**
   * One decoder, two issuers.
   *
   * <p>Dispatching on the unverified issuer claim is safe because it only picks which verifier runs;
   * the token still has to pass that verifier's signature check. Choosing by trying both in turn
   * would work too, and would log a spurious failure for every console request.
   */
  @Bean
  JwtDecoder dispatchingDecoder() {
    var ours = memberTokenDecoder();
    JwtDecoder keycloak = keycloakIssuer.isBlank() ? null : NimbusJwtDecoder.withIssuerLocation(keycloakIssuer).build();

    if (keycloak == null) {
      log.warn(
          "csp.keycloak.issuer-uri is not set — console sign-in is unavailable and only member "
              + "tokens will be accepted. Fine for local work on the member apps; not for a console.");
      return ours;
    }

    return token -> {
      String issuer;
      try {
        var claims = JWTParser.parse(token).getJWTClaimsSet();
        issuer = claims.getIssuer();
      } catch (Exception e) {
        throw new JwtException("Malformed token", e);
      }
      return props.tokenIssuer().equals(issuer) ? ours.decode(token) : keycloak.decode(token);
    };
  }

  /** The tokens this service mints, under whichever key signed them. See TokenKeys. */
  private JwtDecoder memberTokenDecoder() {
    return ng.csp.api.crypto.TokenKeys.decoder(keys.verifying());
  }

  /**
   * Turns whichever token arrived into one authority per permission, so rules read as capabilities
   * rather than as role names.
   */
  private JwtAuthenticationConverter converter() {
    var converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(
        jwt -> {
          var role = TokenRoles.of(jwt, props.tokenIssuer());
          if (role == null) {
            return List.of();
          }
          return role.authorities().stream()
              .map(SimpleGrantedAuthority::new)
              .map(a -> (GrantedAuthority) a)
              .toList();
        });
    return converter;
  }

  /**
   * Who may call this API from a browser.
   *
   * <p>All three frontends are served from different hosts than the API — the spec puts the member
   * web, the console and this service behind separate names — so every call a browser makes is
   * cross-origin and none of them work without this. It is an allowlist, not a wildcard: a token
   * that unlocks a payroll's roster must not be usable from any page that asks.
   *
   * <p>Patterns rather than exact origins, because an exact origin has to name the port, and local
   * work does not have one port. {@code npm run dev} serves 5173, {@code npm run preview} serves
   * 4173, and the browser tests take whatever is free. The default below covers loopback on any
   * port and nothing else; {@code CORS_ORIGINS} replaces it with the real names in deployment,
   * where an exact origin is still an exact origin.
   *
   * <p>Credentials stay off. Tokens travel in the Authorization header, so nothing here should ever
   * be allowed to ride along on a cookie.
   */
  @Bean
  CorsConfigurationSource corsSource() {
    var config = new CorsConfiguration();
    config.setAllowedOriginPatterns(props.corsOrigins());
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
    config.setAllowCredentials(false);
    config.setMaxAge(3600L);
    var source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return source;
  }
}
