package ng.csp.api.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.util.List;
import javax.crypto.spec.SecretKeySpec;
import ng.csp.api.auth.Role;
import ng.csp.api.auth.TokenService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authorization.method.AuthorizationAdvisorProxyFactory;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

  private final CspProperties props;

  public SecurityConfig(CspProperties props) {
    this.props = props;
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
                auth
                    // Liveness and readiness must answer before anything else works.
                    .requestMatchers("/actuator/health/**", "/actuator/info")
                    .permitAll()
                    // Signing in cannot require being signed in.
                    .requestMatchers(HttpMethod.POST, "/v1/auth/otp", "/v1/auth/verify", "/v1/auth/refresh")
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(converter())))
        .build();
  }

  /**
   * HS256 with a shared secret, because this service both mints and verifies.
   *
   * <p>If a second service ever needs to verify these tokens, this becomes an asymmetric key and a
   * JWKS endpoint — a verifier should never hold something that lets it mint.
   */
  @Bean
  JwtDecoder jwtDecoder() {
    var key = new SecretKeySpec(props.jwtSecret().getBytes(), "HmacSHA256");
    return NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
  }

  /** Turns the role claim into one authority per permission, so rules read as capabilities. */
  private JwtAuthenticationConverter converter() {
    var converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(
        jwt -> {
          // A refresh token is not an access token. Presenting one here grants nothing.
          if (!"access".equals(jwt.getClaimAsString(TokenService.CLAIM_KIND))) {
            return List.of();
          }
          var role = Role.fromWire(jwt.getClaimAsString(TokenService.CLAIM_ROLE));
          return role.authorities().stream().map(SimpleGrantedAuthority::new).map(a -> (org.springframework.security.core.GrantedAuthority) a).toList();
        });
    return converter;
  }

  @Bean
  CorsConfigurationSource corsSource() {
    var config = new CorsConfiguration();
    config.setAllowedOrigins(props.corsOrigins());
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
    config.setMaxAge(3600L);
    var source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return source;
  }

  /** Lets {@code @PreAuthorize} work on records returned from services. */
  @Bean
  static AuthorizationAdvisorProxyFactory.TargetVisitor targetVisitor() {
    return AuthorizationAdvisorProxyFactory.TargetVisitor.defaultsSkipValueTypes();
  }
}
