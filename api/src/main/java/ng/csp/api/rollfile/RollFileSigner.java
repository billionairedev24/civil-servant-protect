package ng.csp.api.rollfile;

import java.nio.file.Path;

/**
 * Who says this roll file is ours.
 *
 * <p>A detached OpenPGP signature, over the bytes as stored. Detached rather than wrapped so the
 * roll file stays a plain text file that anyone can open — a clearsigned or wrapped file is one
 * more step between an auditor and the thing they wanted to read, and the point of the format is
 * that no step is needed.
 *
 * <p>An interface for the same reason {@code KeyVault} is one: the signing key belongs in an HSM,
 * and the day it moves there this is the seam that changes. The difference is that PGP signing with
 * a PKCS#11 key is not merely a swapped implementation — OpenPGP packet construction needs the
 * signature computed over a specific serialisation — so the shape here keeps the private key inside
 * the implementation and never hands it out, which is the property that makes the swap possible at
 * all.
 */
public interface RollFileSigner {

  /** The armoured detached signature over the file's bytes — a {@code .asc}, as gpg makes it. */
  byte[] sign(Path file);

  /**
   * The public key, armoured.
   *
   * <p>Published, because a signature nobody can check is decoration. See the endpoint that serves
   * it: verifying should not require asking us for anything out of band.
   */
  String publicKeyArmored();

  /** Named in the startup log, so nobody has to guess which key is signing. */
  String describe();
}
