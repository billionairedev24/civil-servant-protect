package ng.csp.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jwt.JWTParser;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import ng.csp.api.auth.Role;
import ng.csp.api.auth.SessionUser;
import ng.csp.api.auth.TokenService;
import ng.csp.api.config.CspProperties;
import ng.csp.api.crypto.KeyVault;
import ng.csp.api.crypto.TokenKeys;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.JwtException;

/**
 * Signing and verifying a member token, under both algorithms.
 *
 * <p>No Spring context and no database: this is about the crypto, and a test that needed Postgres to
 * check a signature would not be run often enough to be worth having.
 *
 * <p>The EC key here is a software one. An HSM's key is a PKCS#11 handle rather than a value, which
 * changes where the signature is computed and nothing about the token — so everything below is the
 * real path except the JCA provider, which cannot be exercised without the hardware. That is the one
 * part of the ES256 work this suite does not cover, and it is said here rather than left implied.
 */
class TokenSigningTest {

  private static final byte[] SECRET =
      "a-development-secret-that-is-long-enough".getBytes(java.nio.charset.StandardCharsets.UTF_8);

  private static final SessionUser MEMBER =
      new SessionUser(UUID.randomUUID(), Role.MEMBER, UUID.randomUUID(), null, "device-1");

  @Test
  @DisplayName("a config-derived vault signs HS256")
  void hmacVaultSignsHs256() throws Exception {
    var tokens = serviceFor(new KeyVault.Signing.Hmac(SECRET));
    var token = tokens.issue(MEMBER).accessToken();

    assertThat(JWTParser.parse(token).getHeader().getAlgorithm().getName()).isEqualTo("HS256");
  }

  @Test
  @DisplayName("an HSM-shaped vault signs ES256, and names the key it used")
  void ecdsaVaultSignsEs256() throws Exception {
    var key = ecdsaKey("kid-1");
    var token = serviceFor(key).issue(MEMBER).accessToken();

    var header = (com.nimbusds.jose.JWSHeader) JWTParser.parse(token).getHeader();
    assertThat(header.getAlgorithm().getName()).isEqualTo("ES256");
    // The kid is what lets a verifier pick the right public key across a
    // rotation. Without it, rolling the key means every holder guessing.
    assertThat(header.getKeyID()).isEqualTo("kid-1");
  }

  @Test
  @DisplayName("an ES256 token verifies against the public key alone")
  void es256VerifiesWithoutThePrivateKey() {
    var key = ecdsaKey("kid-1");
    var token = serviceFor(key).issue(MEMBER).accessToken();

    /*
     * The decoder is built from the same Signing record, but only its public
     * half is ever read — see TokenKeys. That is the practical argument for
     * asymmetric signing here, separate from the HSM one: the USSD gateway and
     * the claims service need to check a member's session and have no business
     * being able to mint one.
     */
    var decoded = TokenKeys.decoder(List.of(key)).decode(token);

    assertThat(decoded.getSubject()).isEqualTo(MEMBER.userId().toString());
    assertThat(decoded.getClaimAsString("role")).isEqualTo("member");
    assertThat(decoded.getClaimAsString("deviceId")).isEqualTo("device-1");
    // A member has no sponsor, and the claim is absent rather than null.
    assertThat(decoded.getClaimAsString("sponsorId")).isNull();
  }

  @Test
  @DisplayName("a token signed by one key does not verify against another")
  void aDifferentKeyIsRefused() {
    var token = serviceFor(ecdsaKey("kid-1")).issue(MEMBER).accessToken();
    var somebodyElse = TokenKeys.decoder(List.of(ecdsaKey("kid-2")));

    assertThatThrownBy(() -> somebodyElse.decode(token)).isInstanceOf(JwtException.class);
  }

  @Test
  @DisplayName("a service that accepts only ES256 refuses an HS256 token, and the reverse")
  void algorithmsAreNotInterchangeable() {
    var hmacToken = serviceFor(new KeyVault.Signing.Hmac(SECRET)).issue(MEMBER).accessToken();
    var ecdsaKey = ecdsaKey("kid-1");
    var ecdsaToken = serviceFor(ecdsaKey).issue(MEMBER).accessToken();

    /*
     * The decoder dispatches on the unverified `alg` header, which is only safe
     * because it picks a verifier rather than a trust level. A caller must not
     * be able to choose the weaker check by writing it in the header of a token
     * they made themselves.
     */
    assertThatThrownBy(() -> TokenKeys.decoder(List.of(ecdsaKey)).decode(hmacToken))
        .isInstanceOf(JwtException.class)
        .hasMessageContaining("does not accept HS256");

    assertThatThrownBy(
            () -> TokenKeys.decoder(List.of(new KeyVault.Signing.Hmac(SECRET))).decode(ecdsaToken))
        .isInstanceOf(JwtException.class)
        .hasMessageContaining("does not accept ES256");
  }

  @Test
  @DisplayName("a cutover accepts both, so nobody is signed out mid-deploy")
  void cutoverAcceptsBoth() {
    var hmacToken = serviceFor(new KeyVault.Signing.Hmac(SECRET)).issue(MEMBER).accessToken();
    var ecdsaKey = ecdsaKey("kid-1");
    var ecdsaToken = serviceFor(ecdsaKey).issue(MEMBER).accessToken();

    /*
     * Moving to the HSM changes the algorithm. A deploy that only accepted the
     * new one would invalidate every token minted a minute earlier — an
     * eight-hour refresh token worthless at the moment of cutover, including
     * for the member halfway through a claim.
     */
    var duringCutover = TokenKeys.decoder(List.of(ecdsaKey, new KeyVault.Signing.Hmac(SECRET)));

    assertThat(duringCutover.decode(ecdsaToken).getSubject()).isEqualTo(MEMBER.userId().toString());
    assertThat(duringCutover.decode(hmacToken).getSubject()).isEqualTo(MEMBER.userId().toString());
  }

  @Test
  @DisplayName("a refresh token is not an access token, whichever algorithm signed it")
  void kindSurvivesTheAlgorithm() {
    for (var key : List.of(new KeyVault.Signing.Hmac(SECRET), ecdsaKey("kid-1"))) {
      var issued = serviceFor(key).issue(MEMBER);
      var decoder = TokenKeys.decoder(List.of(key));

      // Accepting a refresh token where an access token is expected quietly
      // turns a 20-minute window into eight hours.
      assertThat(TokenService.sessionOf(decoder.decode(issued.accessToken()), "access")).isNotNull();
      assertThat(TokenService.sessionOf(decoder.decode(issued.accessToken()), "refresh")).isNull();
      assertThat(TokenService.sessionOf(decoder.decode(issued.refreshToken()), "refresh")).isNotNull();
      assertThat(TokenService.sessionOf(decoder.decode(issued.refreshToken()), "access")).isNull();
    }
  }

  @Test
  @DisplayName("the JWKS publishes the public key and nothing that could sign with it")
  void jwksPublishesOnlyThePublicHalf() {
    var key = ecdsaKey("kid-1");
    var published = new ng.csp.api.auth.JwksController(fixedVault(key)).jwks().get("keys");

    assertThat(published).hasSize(1);
    var jwk = published.getFirst();
    assertThat(jwk).containsEntry("kty", "EC").containsEntry("crv", "P-256");
    assertThat(jwk).containsEntry("kid", "kid-1").containsEntry("alg", "ES256");
    // `d` is the private scalar. Publishing it would hand every reader the
    // ability to mint sessions, which is the opposite of the point.
    assertThat(jwk).doesNotContainKey("d");
  }

  @Test
  @DisplayName("an HMAC vault publishes no keys, because a shared secret has no public half")
  void jwksIsEmptyUnderHmac() {
    var published =
        new ng.csp.api.auth.JwksController(fixedVault(new KeyVault.Signing.Hmac(SECRET)))
            .jwks()
            .get("keys");

    // Empty rather than absent or an error: a verifier learns that this service
    // does not publish keys, which is true and is the thing worth knowing.
    assertThat(published).isEmpty();
  }

  private static TokenService serviceFor(KeyVault.Signing key) {
    var props =
        new CspProperties(
            "a-development-secret-that-is-long-enough",
            Duration.ofMinutes(20),
            Duration.ofHours(8),
            List.of("http://localhost:[*]"),
            "https://member-auth.csp.test",
            null,
            null,
            null);
    return new TokenService(props, fixedVault(key));
  }

  /** A vault that holds exactly one key and is asked for nothing else. */
  private static KeyVault fixedVault(KeyVault.Signing key) {
    return new KeyVault() {
      @Override
      public byte[] hmac(Purpose purpose, byte[] data) {
        throw new UnsupportedOperationException();
      }

      @Override
      public byte[] encrypt(Purpose purpose, byte[] plaintext) {
        throw new UnsupportedOperationException();
      }

      @Override
      public byte[] decrypt(Purpose purpose, byte[] ciphertext) {
        throw new UnsupportedOperationException();
      }

      @Override
      public Signing signing() {
        return key;
      }

      @Override
      public String describe() {
        return "test";
      }
    };
  }

  /**
   * A P-256 key pair in software.
   *
   * <p>The HSM's private key is a handle rather than a value; what changes is where the signature is
   * computed, not what comes out. Everything above is therefore the real path except the provider.
   */
  private static KeyVault.Signing.Ecdsa ecdsaKey(String keyId) {
    try {
      var generator = KeyPairGenerator.getInstance("EC");
      generator.initialize(new ECGenParameterSpec("secp256r1"));
      var pair = generator.generateKeyPair();
      return new KeyVault.Signing.Ecdsa(
          pair.getPrivate(), (ECPublicKey) pair.getPublic(), keyId, null);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
