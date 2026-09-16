package ng.csp.api.domain;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import ng.csp.api.config.CspProperties;
import org.springframework.stereotype.Component;

/**
 * The NIN, which is never stored in the clear.
 *
 * <p>Level 3 under the cloud policy, so two representations with different jobs:
 *
 * <ul>
 *   <li>{@link #hmac} — deterministic, for matching and deduplication. One NIN is one member, and
 *       the unique index on this column is what enforces it. Reversing it needs the key.
 *   <li>{@link #encrypt} — the value itself, for the rare path that must re-transmit it to NIMC.
 * </ul>
 *
 * <p><b>The keys belong in the HSM.</b> They are derived from configuration here so the thing runs
 * locally and in CI; the build spec is explicit that keys never leave Nigeria and live in Vault plus
 * an in-country HSM. Swapping this class for HSM-backed operations is the whole change — nothing
 * else touches a NIN, which is why it is one class.
 */
@Component
public class Nin {

  private static final int GCM_TAG_BITS = 128;
  private static final int IV_BYTES = 12;

  private final byte[] hmacKey;
  private final SecretKeySpec encryptionKey;
  private final SecureRandom random = new SecureRandom();

  public Nin(CspProperties props) {
    // Separate keys from one secret, so the matching key and the reading key are
    // not the same value even before an HSM is in front of them.
    this.hmacKey = derive(props.jwtSecret(), "nin-hmac");
    this.encryptionKey = new SecretKeySpec(derive(props.jwtSecret(), "nin-enc"), "AES");
  }

  private static byte[] derive(String secret, String label) {
    try {
      var mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return Arrays.copyOf(mac.doFinal(label.getBytes(StandardCharsets.UTF_8)), 32);
    } catch (Exception e) {
      throw new IllegalStateException("could not derive NIN keys", e);
    }
  }

  /** Normalised first, so 1234 5678 901 and 12345678901 are the same person. */
  public byte[] hmac(String nin) {
    if (nin == null || nin.isBlank()) {
      return null;
    }
    try {
      var mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(hmacKey, "HmacSHA256"));
      return mac.doFinal(normalise(nin).getBytes(StandardCharsets.UTF_8));
    } catch (Exception e) {
      throw new IllegalStateException("could not hash NIN", e);
    }
  }

  /** AES-GCM. The IV is prepended, because it must be unique per record and is not secret. */
  public byte[] encrypt(String nin) {
    if (nin == null || nin.isBlank()) {
      return null;
    }
    try {
      var iv = new byte[IV_BYTES];
      random.nextBytes(iv);
      var cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, encryptionKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
      var body = cipher.doFinal(normalise(nin).getBytes(StandardCharsets.UTF_8));
      var out = new byte[iv.length + body.length];
      System.arraycopy(iv, 0, out, 0, iv.length);
      System.arraycopy(body, 0, out, iv.length, body.length);
      return out;
    } catch (Exception e) {
      throw new IllegalStateException("could not encrypt NIN", e);
    }
  }

  /** Reading a NIN back is rare and should be audited by the caller. */
  public String decrypt(byte[] stored) {
    if (stored == null) {
      return null;
    }
    try {
      var iv = Arrays.copyOfRange(stored, 0, IV_BYTES);
      var body = Arrays.copyOfRange(stored, IV_BYTES, stored.length);
      var cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, encryptionKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
      return new String(cipher.doFinal(body), StandardCharsets.UTF_8);
    } catch (Exception e) {
      throw new IllegalStateException("could not decrypt NIN", e);
    }
  }

  private static String normalise(String nin) {
    return nin.replaceAll("\\D", "");
  }
}
