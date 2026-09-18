package ng.csp.api.rollfile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.Security;
import java.util.Iterator;
import org.bouncycastle.bcpg.ArmoredOutputStream;
import org.bouncycastle.bcpg.HashAlgorithmTags;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.openpgp.PGPException;
import org.bouncycastle.openpgp.PGPPrivateKey;
import org.bouncycastle.openpgp.PGPPublicKey;
import org.bouncycastle.openpgp.PGPSecretKey;
import org.bouncycastle.openpgp.PGPPublicKeyRing;
import org.bouncycastle.openpgp.PGPSecretKeyRing;
import org.bouncycastle.openpgp.PGPSecretKeyRingCollection;
import org.bouncycastle.openpgp.PGPSignature;
import org.bouncycastle.openpgp.PGPSignatureGenerator;
import org.bouncycastle.openpgp.PGPUtil;
import org.bouncycastle.openpgp.operator.jcajce.JcaKeyFingerprintCalculator;
import org.bouncycastle.openpgp.operator.jcajce.JcaPGPContentSignerBuilder;
import org.bouncycastle.openpgp.operator.jcajce.JcePBESecretKeyDecryptorBuilder;

/**
 * OpenPGP signing, with BouncyCastle.
 *
 * <p>The key is read once at startup and the private key is held unlocked for the life of the
 * process. That is a deliberate trade and worth naming: the alternative is decrypting it per
 * signature, which means the passphrase stays reachable in memory anyway and adds a key
 * derivation to every load. Neither is what the spec really wants, which is the key in an HSM —
 * see {@link RollFileSigner} for why that is a different implementation rather than a setting.
 */
public class PgpRollFileSigner implements RollFileSigner {

  static {
    // Registered once. BouncyCastle's OpenPGP operators are built with the JCA
    // builders below and look the provider up by name.
    if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
      Security.addProvider(new BouncyCastleProvider());
    }
  }

  /** Bytes per read while signing. The file is on local disk and may be tens of megabytes. */
  private static final int CHUNK = 64 * 1024;

  private final PGPSecretKey secretKey;
  private final PGPPublicKeyRing publicRing;
  private final PGPPrivateKey privateKey;
  private final String describe;

  /**
   * @param publicRing what {@link #publicKeyArmored} publishes — the whole ring, not just the key
   *     that signs. A signing subkey on its own is a key packet with no user id and no self
   *     signature, which {@code gpg --import} refuses, and "verify it with gpg" is the entire
   *     argument for using PGP here rather than a JWS.
   */
  public PgpRollFileSigner(
      PGPSecretKey secretKey, PGPPublicKeyRing publicRing, char[] passphrase, String describe) {
    this.secretKey = secretKey;
    this.publicRing = publicRing;
    this.describe = describe;
    try {
      this.privateKey =
          secretKey.extractPrivateKey(
              new JcePBESecretKeyDecryptorBuilder()
                  .setProvider(BouncyCastleProvider.PROVIDER_NAME)
                  .build(passphrase));
    } catch (PGPException e) {
      throw new IllegalStateException(
          "The roll-file signing key could not be unlocked — check csp.roll-file.passphrase", e);
    }
  }

  @Override
  public byte[] sign(Path file) {
    try {
      var generator =
          new PGPSignatureGenerator(
              new JcaPGPContentSignerBuilder(
                      secretKey.getPublicKey().getAlgorithm(), HashAlgorithmTags.SHA256)
                  .setProvider(BouncyCastleProvider.PROVIDER_NAME),
              secretKey.getPublicKey());
      generator.init(PGPSignature.BINARY_DOCUMENT, privateKey);

      try (var in = Files.newInputStream(file)) {
        var buffer = new byte[CHUNK];
        int read;
        while ((read = in.read(buffer)) > 0) {
          generator.update(buffer, 0, read);
        }
      }

      var out = new ByteArrayOutputStream();
      try (var armoured = new ArmoredOutputStream(out)) {
        generator.generate().encode(armoured);
      }
      return out.toByteArray();
    } catch (IOException e) {
      throw new UncheckedIOException("Could not read the roll file to sign it", e);
    } catch (PGPException e) {
      throw new IllegalStateException("Could not sign the roll file", e);
    }
  }

  @Override
  public String publicKeyArmored() {
    var out = new ByteArrayOutputStream();
    try (var armoured = new ArmoredOutputStream(out)) {
      publicRing.encode(armoured);
    } catch (IOException e) {
      throw new UncheckedIOException("Could not export the roll-file public key", e);
    }
    return out.toString(StandardCharsets.UTF_8);
  }

  @Override
  public String describe() {
    return describe;
  }

  /** The key id as gpg prints it, for the log and for whoever has to find it in a keyring. */
  public static String keyId(PGPPublicKey key) {
    return "%016X".formatted(key.getKeyID());
  }

  /** The key that signs, and the public ring it belongs to. */
  public record Keys(PGPSecretKey signing, PGPPublicKeyRing publish) {}

  /**
   * The first key in an armoured secret keyring that can actually sign, with its ring.
   *
   * <p>"First key" is not good enough: a keyring exported from gpg leads with the primary key,
   * which on a modern default is certification-only, and its signing subkey comes after. Taking
   * the first would mean a key that cannot sign — a failure at the first roll file rather than at
   * startup.
   *
   * <p>The ring comes back too, because that is what gets published. Exporting the signing subkey
   * alone would produce a key packet with no user id and no self signature, which gpg will not
   * import.
   */
  public static Keys signingKeyIn(String armoured) {
    try (InputStream in =
        PGPUtil.getDecoderStream(
            new java.io.ByteArrayInputStream(armoured.getBytes(StandardCharsets.UTF_8)))) {

      var rings = new PGPSecretKeyRingCollection(in, new JcaKeyFingerprintCalculator());
      for (Iterator<PGPSecretKeyRing> ringIt = rings.getKeyRings(); ringIt.hasNext(); ) {
        var ring = ringIt.next();
        for (Iterator<PGPSecretKey> keyIt = ring.getSecretKeys(); keyIt.hasNext(); ) {
          var key = keyIt.next();
          if (key.isSigningKey()) {
            var publicKeys = new java.util.ArrayList<PGPPublicKey>();
            ring.getPublicKeys().forEachRemaining(publicKeys::add);
            return new Keys(key, new PGPPublicKeyRing(publicKeys));
          }
        }
      }
      throw new IllegalStateException(
          "csp.roll-file.signing-key holds no key that can sign. A certification-only primary key "
              + "is not enough — export the signing subkey too.");
    } catch (IOException | PGPException e) {
      throw new IllegalStateException(
          "csp.roll-file.signing-key is not a readable armoured PGP secret key", e);
    }
  }
}
