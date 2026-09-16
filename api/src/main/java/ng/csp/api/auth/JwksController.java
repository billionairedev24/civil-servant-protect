package ng.csp.api.auth;

import java.util.List;
import java.util.Map;
import ng.csp.api.crypto.KeyVault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The public half of the member token key.
 *
 * <p>Only meaningful once tokens are ES256. Under HS256 there is no public half — verifying a token
 * needs the same secret that signs one, which is why every service that wants to check a member's
 * session has to be trusted to mint sessions too. That is the practical argument for asymmetric
 * signing here, separate from the HSM one: the USSD gateway and the claims service need to verify
 * tokens and have no business being able to issue them.
 *
 * <p>Served unauthenticated, as a JWKS must be. A public key is public; the endpoint exists so
 * nobody has to copy it into four config maps and then fail to update three of them at the next
 * rotation.
 */
@RestController
@RequestMapping("/v1/auth")
public class JwksController {

  private final KeyVault keys;

  public JwksController(KeyVault keys) {
    this.keys = keys;
  }

  @GetMapping("/jwks")
  public Map<String, List<Map<String, Object>>> jwks() {
    var published =
        keys.verifying().stream()
            // An HMAC secret has no public half, and a JWKS is not the place to
            // discover that: it is simply absent. A verifier finding an empty
            // set learns that this service does not publish keys, which is true.
            .filter(key -> key instanceof KeyVault.Signing.Ecdsa)
            .map(KeyVault.Signing.Ecdsa.class::cast)
            .map(
                key -> {
                  var jwk =
                      new com.nimbusds.jose.jwk.ECKey.Builder(
                              com.nimbusds.jose.jwk.Curve.P_256, key.publicKey())
                          .keyID(key.keyId())
                          .keyUse(com.nimbusds.jose.jwk.KeyUse.SIGNATURE)
                          .algorithm(com.nimbusds.jose.JWSAlgorithm.ES256)
                          .build();
                  // toPublicJWK, belt and braces: the builder was given only a
                  // public key, and this guarantees it even if that changes.
                  return jwk.toPublicJWK().toJSONObject();
                })
            .toList();

    return Map.of("keys", published);
  }
}
