package ng.csp.api.auth;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import javax.crypto.spec.SecretKeySpec;
import ng.csp.api.config.CspProperties;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;

/** Mints the access and refresh tokens. Verification is Spring Security's resource server. */
@Service
public class TokenService {

  public static final String CLAIM_ROLE = "role";
  public static final String CLAIM_MEMBER_ID = "memberId";
  public static final String CLAIM_SPONSOR_ID = "sponsorId";
  public static final String CLAIM_DEVICE_ID = "deviceId";
  /**
   * Access and refresh tokens are distinguished by a claim and checked on use. A refresh token is
   * long-lived on purpose, and accepting one wherever an access token is expected quietly turns a
   * 20-minute window into eight hours.
   */
  public static final String CLAIM_KIND = "kind";

  public static final String ISSUER = "csp";

  private final NimbusJwtEncoder encoder;
  private final Duration accessTtl;
  private final Duration refreshTtl;

  public TokenService(CspProperties props) {
    var key = new SecretKeySpec(props.jwtSecret().getBytes(), "HmacSHA256");
    this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
    this.accessTtl = props.accessTokenTtl();
    this.refreshTtl = props.refreshTokenTtl();
  }

  public record Tokens(String accessToken, String refreshToken, long expiresIn) {}

  public Tokens issue(SessionUser user) {
    return new Tokens(
        mint(user, "access", accessTtl), mint(user, "refresh", refreshTtl), accessTtl.toSeconds());
  }

  private String mint(SessionUser user, String kind, Duration ttl) {
    var now = Instant.now();
    var claims =
        JwtClaimsSet.builder()
            .issuer(ISSUER)
            .subject(user.userId().toString())
            .issuedAt(now)
            .expiresAt(now.plus(ttl))
            .claim(CLAIM_KIND, kind)
            .claim(CLAIM_ROLE, user.role().wire())
            .claim(CLAIM_MEMBER_ID, str(user.memberId()))
            .claim(CLAIM_SPONSOR_ID, str(user.sponsorId()))
            .claim(CLAIM_DEVICE_ID, user.deviceId())
            .build();
    var header = JwsHeader.with(MacAlgorithm.HS256).build();
    return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
  }

  private static String str(UUID id) {
    return id == null ? null : id.toString();
  }

  /** Reads a verified token back into a session, rejecting the wrong kind. */
  public static SessionUser sessionOf(Jwt jwt, String expectedKind) {
    if (!expectedKind.equals(jwt.getClaimAsString(CLAIM_KIND))) {
      return null;
    }
    return new SessionUser(
        UUID.fromString(jwt.getSubject()),
        Role.fromWire(jwt.getClaimAsString(CLAIM_ROLE)),
        uuid(jwt.getClaimAsString(CLAIM_MEMBER_ID)),
        uuid(jwt.getClaimAsString(CLAIM_SPONSOR_ID)),
        jwt.getClaimAsString(CLAIM_DEVICE_ID));
  }

  private static UUID uuid(String value) {
    return value == null || value.isBlank() ? null : UUID.fromString(value);
  }
}
