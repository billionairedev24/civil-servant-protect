package ng.csp.api.rollfile;

import java.security.KeyPairGenerator;
import java.security.Security;
import java.util.Date;
import org.bouncycastle.bcpg.HashAlgorithmTags;
import org.bouncycastle.bcpg.PublicKeyAlgorithmTags;
import org.bouncycastle.bcpg.SymmetricKeyAlgorithmTags;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.openpgp.PGPSecretKey;
import org.bouncycastle.openpgp.PGPSignature;
import org.bouncycastle.openpgp.operator.jcajce.JcaPGPContentSignerBuilder;
import org.bouncycastle.openpgp.operator.jcajce.JcaPGPDigestCalculatorProviderBuilder;
import org.bouncycastle.openpgp.operator.jcajce.JcaPGPKeyPair;
import org.bouncycastle.openpgp.operator.jcajce.JcePBESecretKeyEncryptorBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Where the roll-file signing key comes from, and what happens when there is none.
 *
 * <p>Configured: an armoured PGP secret key in {@code csp.roll-file.signing-key}, unlocked with
 * {@code csp.roll-file.passphrase}. That is the deployment answer, and the key belongs in Vault
 * rather than in a values file.
 *
 * <p>Not configured: a key generated at startup, used for this process and lost when it exits. That
 * makes the whole path — render, sign, store, serve, verify — work on a laptop with nothing
 * installed, which is the only way it gets exercised before a real key exists. It is also a lie if
 * left unsaid, because signatures from a previous run stop verifying the moment the pod restarts,
 * so it is logged as a warning every time and refused outright under the prod profile: see {@code
 * ProductionSafetyCheck}.
 */
@Configuration
public class RollFileConfig {

  private static final Logger log = LoggerFactory.getLogger(RollFileConfig.class);

  @Bean
  RollFileSigner rollFileSigner(
      @Value("${csp.roll-file.signing-key:}") String armouredKey,
      @Value("${csp.roll-file.passphrase:}") String passphrase) {

    if (!armouredKey.isBlank()) {
      var keys = PgpRollFileSigner.signingKeyIn(armouredKey);
      var signer =
          new PgpRollFileSigner(
              keys.signing(),
              keys.publish(),
              passphrase.toCharArray(),
              "PGP key " + PgpRollFileSigner.keyId(keys.signing().getPublicKey()));
      log.info("Roll files signed by {}", signer.describe());
      return signer;
    }

    var signer = ephemeral();
    log.warn(
        """
        csp.roll-file.signing-key is not set — roll files will be signed with a key generated just \
        now and thrown away when this process exits.

        Signatures made by an earlier run cannot be verified after a restart. Fine on a laptop; \
        the prod profile refuses to start this way.""");
    log.info("Roll files signed by {}", signer.describe());
    return signer;
  }

  /**
   * A signing key for this process only.
   *
   * <p>RSA rather than an elliptic curve, chosen for the one property that matters in a throwaway
   * key: every version of gpg somebody might verify with can read it. Key generation costs a
   * fraction of a second once at startup.
   */
  private static RollFileSigner ephemeral() {
    if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
      Security.addProvider(new BouncyCastleProvider());
    }
    try {
      var generator = KeyPairGenerator.getInstance("RSA", BouncyCastleProvider.PROVIDER_NAME);
      generator.initialize(2048);

      var pair = new JcaPGPKeyPair(PublicKeyAlgorithmTags.RSA_SIGN, generator.generateKeyPair(), new Date());
      var checksum =
          new JcaPGPDigestCalculatorProviderBuilder().build().get(HashAlgorithmTags.SHA1);
      var passphrase = "ephemeral".toCharArray();

      var secretKey =
          new PGPSecretKey(
              PGPSignature.DEFAULT_CERTIFICATION,
              pair,
              "Civil Servant Protect roll files (ephemeral, development only)",
              checksum,
              null,
              null,
              new JcaPGPContentSignerBuilder(
                  pair.getPublicKey().getAlgorithm(), HashAlgorithmTags.SHA256),
              new JcePBESecretKeyEncryptorBuilder(SymmetricKeyAlgorithmTags.AES_256, checksum)
                  .setProvider(BouncyCastleProvider.PROVIDER_NAME)
                  .build(passphrase));

      return new PgpRollFileSigner(
          secretKey,
          new org.bouncycastle.openpgp.PGPPublicKeyRing(java.util.List.of(secretKey.getPublicKey())),
          passphrase,
          "ephemeral PGP key " + PgpRollFileSigner.keyId(secretKey.getPublicKey()));
    } catch (Exception e) {
      throw new IllegalStateException("Could not generate a roll-file signing key", e);
    }
  }
}
