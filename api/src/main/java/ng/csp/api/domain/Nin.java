package ng.csp.api.domain;

import java.nio.charset.StandardCharsets;
import ng.csp.api.crypto.KeyVault;
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
 * <p>The cryptography is not here. It is behind {@link KeyVault}, which either derives keys from
 * configuration for local work or reaches an in-country HSM where the key never leaves the device.
 * This class owns the two things that are about NINs rather than about keys: that a NIN is
 * normalised before it is matched, and that nothing else in the system touches one.
 *
 * <p>That second part is why this is one small class. Every read and write of a NIN goes through
 * these four methods, so "where could a NIN leak from" has a short answer.
 */
@Component
public class Nin {

  private final KeyVault keys;

  public Nin(KeyVault keys) {
    this.keys = keys;
  }

  /** Normalised first, so 1234 5678 901 and 12345678901 are the same person. */
  public byte[] hmac(String nin) {
    if (nin == null || nin.isBlank()) {
      return null;
    }
    return keys.hmac(KeyVault.Purpose.NIN_HMAC, bytes(nin));
  }

  public byte[] encrypt(String nin) {
    if (nin == null || nin.isBlank()) {
      return null;
    }
    return keys.encrypt(KeyVault.Purpose.NIN_ENCRYPTION, bytes(nin));
  }

  /** Reading a NIN back is rare and should be audited by the caller. */
  public String decrypt(byte[] stored) {
    if (stored == null) {
      return null;
    }
    return new String(keys.decrypt(KeyVault.Purpose.NIN_ENCRYPTION, stored), StandardCharsets.UTF_8);
  }

  private static byte[] bytes(String nin) {
    return normalise(nin).getBytes(StandardCharsets.UTF_8);
  }

  private static String normalise(String nin) {
    return nin.replaceAll("\\D", "");
  }
}
