package ng.csp.api.crypto;

import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jwt.JWTParser;
import java.util.LinkedHashMap;
import java.util.List;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Verifying a member token, under whichever key signed it.
 *
 * <p>Its own class rather than a method on SecurityConfig, because this is the piece worth testing
 * on its own: a decoder that accepts the wrong algorithm is a security hole with no symptoms, and
 * one that accepts too few signs everybody out at a deploy.
 */
public final class TokenKeys {

  private TokenKeys() {}

  /**
   * One decoder per acceptable key, chosen by the {@code alg} header.
   *
   * <p>The list is normally one long. It is two during an HSM cutover, when tokens signed with the
   * old HMAC are still in people's hands and ought to keep working until they expire.
   *
   * <p>Dispatching on the unverified header is safe because it only picks which verifier runs — the
   * token still has to pass that verifier's signature check. What it must not do is let a caller
   * <em>choose</em> a weaker check, so HS256 is only ever tried when this service is configured to
   * accept an HMAC, and a token naming an algorithm nothing here accepts is rejected rather than
   * falling through to anything.
   */
  public static JwtDecoder decoder(List<KeyVault.Signing> keys) {
    var byAlgorithm = new LinkedHashMap<String, JwtDecoder>();

    for (var key : keys) {
      switch (key) {
        case KeyVault.Signing.Hmac(byte[] secret) ->
            byAlgorithm.putIfAbsent(
                "HS256",
                NimbusJwtDecoder.withSecretKey(new SecretKeySpec(secret, "HmacSHA256"))
                    .macAlgorithm(MacAlgorithm.HS256)
                    .build());

        /*
         * withPublicKey takes an RSA key only, so the EC key goes in as a JWK.
         * Verification needs the public half and nothing else, which is the
         * point of having moved off a shared secret: the USSD gateway and the
         * claims service can check a member's session without being able to
         * mint one.
         */
        case KeyVault.Signing.Ecdsa(var ignored, var publicKey, var keyId, var ignoredProvider) ->
            byAlgorithm.putIfAbsent(
                "ES256",
                NimbusJwtDecoder.withJwkSource(
                        new ImmutableJWKSet<>(
                            new JWKSet(
                                new ECKey.Builder(Curve.P_256, publicKey).keyID(keyId).build())))
                    .jwsAlgorithm(SignatureAlgorithm.ES256)
                    .build());
      }
    }

    return token -> {
      String algorithm;
      try {
        algorithm = JWTParser.parse(token).getHeader().getAlgorithm().getName();
      } catch (Exception e) {
        throw new JwtException("Malformed token", e);
      }
      var decoder = byAlgorithm.get(algorithm);
      if (decoder == null) {
        throw new JwtException("This service does not accept " + algorithm + " tokens.");
      }
      return decoder.decode(token);
    };
  }
}
