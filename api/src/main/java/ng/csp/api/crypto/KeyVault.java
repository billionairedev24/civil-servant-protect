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
   * The raw secret for HS256 token signing.
   *
   * <p>The one method that breaks this interface's own rule, and it is here rather than hidden
   * because the reason matters: Nimbus's {@code MACSigner} takes key bytes, so an HS256 token cannot
   * be signed by a key that stays inside an HSM. Symmetric signing and hardware key custody are
   * genuinely incompatible through this library.
   *
   * <p>An HSM-backed vault therefore refuses this, with a message saying what to do instead — move
   * member tokens to ES256, where PKCS#11 hands out a {@code Signature} over a private key that
   * never leaves the device. That is a deliberate deploy-time decision, not something to discover
   * from a stack trace.
   */
  byte[] signingSecret();

  /** For the startup banner and {@code /actuator/info}: where the keys actually are. */
  String describe();
}
