package ng.csp.api.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import ng.csp.api.config.CspProperties;
import ng.csp.api.crypto.KeyVault;
import org.springframework.security.oauth2.jwt.Jwt;
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


  private final com.nimbusds.jose.JWSSigner signer;
  private final com.nimbusds.jose.JWSHeader header;
  private final Duration accessTtl;
  private final Duration refreshTtl;
  private final String issuer;

  /**
   * The algorithm is the vault's decision, not a setting.
   *
   * <p>A config-derived vault signs HS256 because its key is in an environment variable anyway; an
   * HSM-backed one signs ES256 because that is the only algorithm whose private key can stay inside
   * the device. Making this a property would let the two disagree — {@code ES256} configured against
   * a vault holding only a secret is a service that cannot mint a token, discovered at the first
   * sign-in rather than at startup.
   *
   * <p>Signed through Nimbus rather than Spring's {@code NimbusJwtEncoder}, which offers no way to
   * set the JCA provider. The HSM's private key is a handle belonging to the PKCS#11 provider, and
   * {@code Signature.getInstance("SHA256withECDSA")} without being told where to look picks whatever
   * provider comes first and then rejects the key.
   */
  public TokenService(CspProperties props, KeyVault keys) {
    try {
      switch (keys.signing()) {
        case KeyVault.Signing.Hmac(byte[] secret) -> {
          this.signer = new com.nimbusds.jose.crypto.MACSigner(secret);
          this.header = new com.nimbusds.jose.JWSHeader.Builder(
                  com.nimbusds.jose.JWSAlgorithm.HS256)
              .build();
        }
        case KeyVault.Signing.Ecdsa(var privateKey, var publicKey, var keyId, var provider) -> {
          var ecdsa = new com.nimbusds.jose.crypto.ECDSASigner(
              privateKey, com.nimbusds.jose.jwk.Curve.P_256);
          if (provider != null) {
            ecdsa.getJCAContext().setProvider(provider);
          }
          this.signer = ecdsa;
          // The key id travels in the header so a verifier can pick the right
          // public key across a rotation — see /v1/auth/jwks.
          this.header = new com.nimbusds.jose.JWSHeader.Builder(
                  com.nimbusds.jose.JWSAlgorithm.ES256)
              .keyID(keyId)
              .build();
        }
      }
    } catch (com.nimbusds.jose.JOSEException e) {
      throw new IllegalStateException("Could not build the token signer", e);
    }
    this.accessTtl = props.accessTokenTtl();
    this.refreshTtl = props.refreshTokenTtl();
    this.issuer = props.tokenIssuer();
  }

  public record Tokens(String accessToken, String refreshToken, long expiresIn) {}

  public Tokens issue(SessionUser user) {
    return new Tokens(
        mint(user, "access", accessTtl), mint(user, "refresh", refreshTtl), accessTtl.toSeconds());
  }

  private String mint(SessionUser user, String kind, Duration ttl) {
    var now = Instant.now();
    var claims =
        new com.nimbusds.jwt.JWTClaimsSet.Builder()
            .issuer(issuer)
            .subject(user.userId().toString())
            .issueTime(java.util.Date.from(now))
            .expirationTime(java.util.Date.from(now.plus(ttl)))
            .claim(CLAIM_KIND, kind)
            .claim(CLAIM_ROLE, user.role().wire());

    // Absent rather than null. A member has no sponsor and a browser has no
    // device, and a null claim is a claim that is present and empty.
    putIfPresent(claims, CLAIM_MEMBER_ID, str(user.memberId()));
    putIfPresent(claims, CLAIM_SPONSOR_ID, str(user.sponsorId()));
    putIfPresent(claims, CLAIM_DEVICE_ID, user.deviceId());

    try {
      var jwt = new com.nimbusds.jwt.SignedJWT(header, claims.build());
      jwt.sign(signer);
      return jwt.serialize();
    } catch (com.nimbusds.jose.JOSEException e) {
      throw new IllegalStateException("Could not sign a token", e);
    }
  }

  private static void putIfPresent(
      com.nimbusds.jwt.JWTClaimsSet.Builder builder, String name, String value) {
    if (value != null) {
      builder.claim(name, value);
    }
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
