package ng.csp.api.crypto;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import ng.csp.api.config.CspProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

/**
 * Keys derived from configuration, for a laptop and for CI.
 *
 * <p>Every key is HKDF-style derived from {@code csp.jwt-secret} with a per-purpose label, so the
 * key that matches NINs and the key that reads them are different values even before hardware is
 * involved. That is worth having on its own: a leaked matching key does not decrypt anything.
 *
 * <p>It is still one secret in an environment variable. Under the {@code prod} profile the context
 * refuses to start — see ProductionSafetyCheck — because a deployment that quietly kept the
 * development key would be indistinguishable from one that did not until somebody read a config map.
 */
@Component
@ConditionalOnMissingBean(name = "hsmKeyVault")
public class DerivedKeyVault implements KeyVault {

  private static final int GCM_TAG_BITS = 128;
  private static final int IV_BYTES = 12;

  private final String secret;
  private final SecureRandom random = new SecureRandom();

  public DerivedKeyVault(CspProperties props) {
    this.secret = props.jwtSecret();
  }

  @Override
  public byte[] hmac(Purpose purpose, byte[] data) {
    try {
      var mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(keyFor(purpose), "HmacSHA256"));
      return mac.doFinal(data);
    } catch (Exception e) {
      throw new IllegalStateException("could not compute a MAC for " + purpose.label(), e);
    }
  }

  @Override
  public byte[] encrypt(Purpose purpose, byte[] plaintext) {
    try {
      // A fresh IV per record. Reusing one under GCM does not merely weaken it,
      // it reveals the XOR of the plaintexts — and these plaintexts are NINs.
      var iv = new byte[IV_BYTES];
      random.nextBytes(iv);
      var cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, aesKey(purpose), new GCMParameterSpec(GCM_TAG_BITS, iv));
      var body = cipher.doFinal(plaintext);
      var out = new byte[iv.length + body.length];
      System.arraycopy(iv, 0, out, 0, iv.length);
      System.arraycopy(body, 0, out, iv.length, body.length);
      return out;
    } catch (Exception e) {
      throw new IllegalStateException("could not encrypt for " + purpose.label(), e);
    }
  }

  @Override
  public byte[] decrypt(Purpose purpose, byte[] ciphertext) {
    try {
      var iv = Arrays.copyOfRange(ciphertext, 0, IV_BYTES);
      var body = Arrays.copyOfRange(ciphertext, IV_BYTES, ciphertext.length);
      var cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, aesKey(purpose), new GCMParameterSpec(GCM_TAG_BITS, iv));
      return cipher.doFinal(body);
    } catch (Exception e) {
      throw new IllegalStateException("could not decrypt for " + purpose.label(), e);
    }
  }

  /**
   * HS256, from the configured secret.
   *
   * <p>Not a compromise here: a vault whose keys are already derived from one environment variable
   * gains nothing from asymmetric signing, and would only add a key pair nobody rotates. Production
   * runs the HSM vault, which signs ES256 — see Pkcs11KeyVault.
   */
  @Override
  public Signing signing() {
    return new Signing.Hmac(secret.getBytes(StandardCharsets.UTF_8));
  }

  @Override
  public String describe() {
    return "derived from csp.jwt-secret (development only — not an HSM)";
  }

  private SecretKeySpec aesKey(Purpose purpose) {
    return new SecretKeySpec(keyFor(purpose), "AES");
  }

  /** One secret, one label, one 256-bit key. Deterministic, so a restart reads what it wrote. */
  private byte[] keyFor(Purpose purpose) {
    try {
      var mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return Arrays.copyOf(mac.doFinal(purpose.label().getBytes(StandardCharsets.UTF_8)), 32);
    } catch (Exception e) {
      throw new IllegalStateException("could not derive a key for " + purpose.label(), e);
    }
  }
}
