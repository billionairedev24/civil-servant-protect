package ng.csp.api.crypto;

import java.security.KeyStore;
import java.security.Provider;
import java.security.SecureRandom;
import java.security.Security;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Keys inside the in-country HSM, reached over PKCS#11.
 *
 * <p>The keys are generated in the device and marked non-extractable there; what this class holds is
 * a handle. {@code Mac.init(key)} and {@code Cipher.init(key)} send the operation to the hardware
 * and get an answer back, and at no point does the key exist in this process's memory. That is the
 * property the build spec is buying, and it is why {@link KeyVault} exposes operations instead of
 * bytes — an interface shaped the other way can only be implemented by extracting the key.
 *
 * <p>Enabled with {@code csp.crypto.hsm.enabled=true}, which needs a PKCS#11 configuration file for
 * the vendor's library and a PIN. The keys must already exist in the token under the labels in
 * {@link KeyVault.Purpose}; this deliberately does not create them. Key ceremony is a witnessed
 * procedure with custodians and a signed record, not something an application does on first boot
 * because it found none.
 */
@Component("hsmKeyVault")
@ConditionalOnProperty(name = "csp.crypto.hsm.enabled", havingValue = "true")
public class Pkcs11KeyVault implements KeyVault {

  private static final Logger log = LoggerFactory.getLogger(Pkcs11KeyVault.class);
  private static final int GCM_TAG_BITS = 128;
  private static final int IV_BYTES = 12;

  private final KeyStore keyStore;
  private final Provider provider;
  private final char[] pin;
  private final String previousHmac;
  private final SecureRandom random = new SecureRandom();

  public Pkcs11KeyVault(
      @Value("${csp.crypto.hsm.config}") String configPath,
      @Value("${csp.crypto.hsm.pin}") String pin,
      /*
       * The secret this service signed with before the HSM.
       *
       * Set it for one deploy so tokens minted by the previous version keep
       * working, then unset it. Without that window, cutting over signs out
       * every member at once — including the ones mid-claim.
       */
      @Value("${csp.crypto.previous-hmac-secret:}") String previousHmac) {
    this.previousHmac = previousHmac;
    this.pin = pin.toCharArray();
    try {
      // SunPKCS11 is configured from a file naming the vendor's shared library
      // and the slot. Vendors differ enough that this stays configuration.
      var base = Security.getProvider("SunPKCS11");
      if (base == null) {
        throw new IllegalStateException(
            "SunPKCS11 is not available in this JVM, so the HSM cannot be reached.");
      }
      this.provider = base.configure(configPath);
      Security.addProvider(provider);
      this.keyStore = KeyStore.getInstance("PKCS11", provider);
      this.keyStore.load(null, this.pin);
      log.info("HSM keys available through {}", provider.getName());
    } catch (Exception e) {
      // Refuse to start rather than fall back. A service that silently reverts
      // to software keys when the HSM is unreachable is one whose compliance
      // posture depends on nobody unplugging anything.
      throw new IllegalStateException(
          "Could not open the HSM at " + configPath + ". Refusing to start with software keys.", e);
    }
  }

  @Override
  public byte[] hmac(Purpose purpose, byte[] data) {
    try {
      var mac = Mac.getInstance("HmacSHA256", provider);
      mac.init(key(purpose));
      return mac.doFinal(data);
    } catch (Exception e) {
      throw new IllegalStateException("HSM could not compute a MAC for " + purpose.label(), e);
    }
  }

  @Override
  public byte[] encrypt(Purpose purpose, byte[] plaintext) {
    try {
      var iv = new byte[IV_BYTES];
      random.nextBytes(iv);
      var cipher = Cipher.getInstance("AES/GCM/NoPadding", provider);
      cipher.init(Cipher.ENCRYPT_MODE, key(purpose), new GCMParameterSpec(GCM_TAG_BITS, iv));
      var body = cipher.doFinal(plaintext);
      var out = new byte[iv.length + body.length];
      System.arraycopy(iv, 0, out, 0, iv.length);
      System.arraycopy(body, 0, out, iv.length, body.length);
      return out;
    } catch (Exception e) {
      throw new IllegalStateException("HSM could not encrypt for " + purpose.label(), e);
    }
  }

  @Override
  public byte[] decrypt(Purpose purpose, byte[] ciphertext) {
    try {
      var iv = Arrays.copyOfRange(ciphertext, 0, IV_BYTES);
      var body = Arrays.copyOfRange(ciphertext, IV_BYTES, ciphertext.length);
      var cipher = Cipher.getInstance("AES/GCM/NoPadding", provider);
      cipher.init(Cipher.DECRYPT_MODE, key(purpose), new GCMParameterSpec(GCM_TAG_BITS, iv));
      return cipher.doFinal(body);
    } catch (Exception e) {
      throw new IllegalStateException("HSM could not decrypt for " + purpose.label(), e);
    }
  }

  /**
   * ES256, signed inside the device.
   *
   * <p>What comes back from the keystore is a handle: the {@code PrivateKey} object holds no key
   * material, and {@code Signature.sign()} on it is a round trip to the hardware. That is the whole
   * reason member tokens are ES256 and not HS256 — an HMAC signer needs the bytes, so the only way
   * to sign one with an HSM key is to have generated it extractable, which is the same as not
   * having an HSM.
   *
   * <p>The key id goes in the token header so a verifier can pick the right public key across a
   * rotation, and the public half is published at {@code /v1/auth/jwks}.
   */
  @Override
  public Signing signing() {
    try {
      var privateKey = (java.security.PrivateKey) keyStore.getKey(Purpose.TOKEN_SIGNING.label(), pin);
      if (privateKey == null) {
        throw new IllegalStateException(
            "No key labelled '%s' in the HSM. Keys are created by a witnessed ceremony, not by "
                    .formatted(Purpose.TOKEN_SIGNING.label())
                + "this service.");
      }
      var certificate = keyStore.getCertificate(Purpose.TOKEN_SIGNING.label());
      if (certificate == null) {
        throw new IllegalStateException(
            "The HSM holds a private key for '%s' with no certificate, so there is no public key "
                    .formatted(Purpose.TOKEN_SIGNING.label())
                + "to publish. Verifiers would have nothing to check a token against.");
      }
      var publicKey = certificate.getPublicKey();
      if (!(publicKey instanceof java.security.interfaces.ECPublicKey ec)) {
        throw new IllegalStateException(
            "The token-signing key in the HSM is %s, not EC. ES256 needs a P-256 key."
                .formatted(publicKey.getAlgorithm()));
      }
      // Fingerprint rather than a name, so rotating the key rotates the kid
      // without anybody having to remember to change a string.
      var kid = java.util.HexFormat.of().formatHex(
          java.security.MessageDigest.getInstance("SHA-256").digest(ec.getEncoded()), 0, 8);
      return new Signing.Ecdsa(privateKey, ec, kid, provider);
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      throw new IllegalStateException("Could not read the token-signing key from the HSM", e);
    }
  }

  @Override
  public java.util.List<Signing> verifying() {
    if (previousHmac == null || previousHmac.isBlank()) {
      return java.util.List.of(signing());
    }
    log.warn(
        "Still accepting tokens signed with the previous HMAC secret. Unset "
            + "csp.crypto.previous-hmac-secret once every token minted before the cutover has "
            + "expired — until then, a leak of that secret still mints valid sessions.");
    return java.util.List.of(
        signing(), new Signing.Hmac(previousHmac.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
  }

  @Override
  public String describe() {
    return "PKCS#11 (" + provider.getName() + ") — keys are non-extractable";
  }

  private SecretKey key(Purpose purpose) throws Exception {
    var key = keyStore.getKey(purpose.label(), pin);
    if (key == null) {
      throw new IllegalStateException(
          "No key labelled '%s' in the HSM. Keys are created by a witnessed ceremony, not by this "
              .formatted(purpose.label())
              + "service.");
    }
    return (SecretKey) key;
  }
}
