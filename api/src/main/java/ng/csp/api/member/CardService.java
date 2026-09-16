package ng.csp.api.member;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import ng.csp.api.config.CspProperties;
import org.springframework.stereotype.Service;

/**
 * The protection card's offline token.
 *
 * <p>A hospital gate somewhere with no signal has to tell a real card from a screenshot of one. So
 * the QR carries a payload signed by us and valid for 90 days: the gate verifies the signature
 * against a key it already holds and never calls the network.
 *
 * <p>HMAC keeps the demo self-contained. A deployment that hands the key to hospitals needs an
 * asymmetric signature instead — they must be able to verify without holding anything that lets them
 * mint a card. That swap is this class.
 */
@Service
public class CardService implements MemberService.CardSigner {

  private static final int VALID_DAYS = 90;
  private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

  private final byte[] key;

  public CardService(CspProperties props) {
    this.key = props.jwtSecret().getBytes(StandardCharsets.UTF_8);
  }

  @Override
  public MemberService.SignedCard sign(String cspId, String tier, LocalDate inForceSince) {
    var expiresAt = Instant.now().plus(VALID_DAYS, ChronoUnit.DAYS);
    var payload =
        "{\"v\":1,\"id\":\"%s\",\"t\":\"%s\",\"f\":\"%s\",\"x\":%d}"
            .formatted(cspId, tier, inForceSince, expiresAt.getEpochSecond());
    var encoded = B64.encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    var signature = hmac(encoded);
    return new MemberService.SignedCard("CSP1." + encoded + "." + signature, signature, expiresAt);
  }

  /** What a gate-side verifier does. Public so a test can prove it round-trips. */
  public boolean verify(String token) {
    var parts = token.split("\\.");
    if (parts.length != 3 || !"CSP1".equals(parts[0])) {
      return false;
    }
    if (!java.security.MessageDigest.isEqual(
        hmac(parts[1]).getBytes(StandardCharsets.UTF_8), parts[2].getBytes(StandardCharsets.UTF_8))) {
      return false;
    }
    var json = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
    var marker = "\"x\":";
    var at = json.indexOf(marker);
    if (at < 0) {
      return false;
    }
    var end = json.indexOf('}', at);
    var expiry = Long.parseLong(json.substring(at + marker.length(), end).trim());
    return Instant.ofEpochSecond(expiry).isAfter(Instant.now());
  }

  private String hmac(String value) {
    try {
      var mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(key, "HmacSHA256"));
      return B64.encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException("could not sign card payload", e);
    }
  }
}
