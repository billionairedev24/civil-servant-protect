package ng.csp.api.crypto;

/**
 * Where the keys are, and — more to the point — where they are not.
 *
 * <p>The build spec puts key material in Vault and an in-country HSM. The distinguishing property of
 * an HSM is not that it stores keys securely; it is that the key never comes out. Operations happen
 * inside the device and the caller gets an answer, not a secret.
 *
 * <p>So this interface exposes <em>operations</em> and never returns key bytes. That constraint is
 * the whole design: an interface with {@code byte[] hmacKey()} on it can be implemented by an HSM
 * only by extracting the key, which is the one thing an HSM is for not doing. Getting this shape
 * wrong is how systems end up "HSM-backed" with the keys in a pod's heap.
 *
 * <p>A purpose is a name, not a key. Callers ask for "nin-hmac" and the vault decides what that
 * means — a derived key here, a PKCS#11 handle in production — so moving to the HSM changes one
 * bean and nothing else.
 */
public interface KeyVault {

  /** Purposes, so a typo is a compile error rather than a silently different key. */
  enum Purpose {
    /** Deterministic, for matching one NIN to one member. Never reversible without the key. */
    NIN_HMAC("nin-hmac"),
    /** AES-GCM, for the rare path that must re-transmit a NIN to NIMC. */
    NIN_ENCRYPTION("nin-enc"),
    /** The member tokens this service mints. See {@link #signingSecret}. */
    TOKEN_SIGNING("token-signing");

    private final String label;

    Purpose(String label) {
      this.label = label;
    }

    public String label() {
      return label;
    }
  }

  /** A keyed MAC, computed wherever the key lives. */
  byte[] hmac(Purpose purpose, byte[] data);

  /** AES-GCM. The implementation owns the IV and prepends it — it must be unique per record. */
  byte[] encrypt(Purpose purpose, byte[] plaintext);

  byte[] decrypt(Purpose purpose, byte[] ciphertext);

  /**
   * How this vault signs a member token.
   *
   * <p>Two shapes, because there are two honest answers rather than one compromise.
   *
   * <p>HS256 needs the key bytes in the signer, so a key that stays inside an HSM cannot produce
   * one — symmetric signing and hardware custody are incompatible, and the only way to have both is
   * to generate the token key as extractable, which is the same as not having an HSM while telling
   * an auditor that you do.
   *
   * <p>ES256 is the way out. PKCS#11 hands back a {@link java.security.PrivateKey} that is a
   * <em>handle</em>: signing happens inside the device and the object in this process holds no key
   * material. So an HSM-backed vault signs ES256 and a config-derived one signs HS256, and neither
   * has to pretend to be the other.
   */
  sealed interface Signing {

    /** A symmetric secret. Development and CI, where the key is in an environment variable anyway. */
    record Hmac(byte[] secret) implements Signing {}

    /**
     * An EC key pair, where the private half may be a handle rather than a value.
     *
     * @param provider the JCA provider that can use {@code privateKey} — SunPKCS11 for the HSM, and
     *     null for an ordinary software key.
     */
    record Ecdsa(
        java.security.PrivateKey privateKey,
        java.security.interfaces.ECPublicKey publicKey,
        String keyId,
        java.security.Provider provider)
        implements Signing {}
  }

  Signing signing();

  /**
   * Every key a token may legitimately have been signed with, newest first.
   *
   * <p>Usually just {@link #signing()}. It is a list because moving to the HSM changes the
   * algorithm, and a deploy that only accepts the new one signs out every member holding a token
   * minted a minute earlier — an eight-hour refresh token becomes worthless at the moment of
   * cutover. Accepting the old key for one token lifetime turns a migration into a deploy.
   */
  default java.util.List<Signing> verifying() {
    return java.util.List.of(signing());
  }

  /** For the startup banner and {@code /actuator/info}: where the keys actually are. */
  String describe();
}
