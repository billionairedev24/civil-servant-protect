package ng.csp.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.Map;
import javax.imageio.ImageIO;
import ng.csp.api.member.CardQr;
import ng.csp.api.member.CardService;
import ng.csp.api.config.CspProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The card's QR, read back the way a gate reads it.
 *
 * <p>Every assertion here goes through the PNG. An encoder checked against its own matrix proves
 * the matrix is self-consistent and nothing about whether a scanner pointed at the picture gets the
 * token we signed — which is the only property the card has to have.
 */
class CardQrTest {

  private final CardQr qr = new CardQr();

  /** The same secret shape the test profile uses; the QR does not care what signed the payload. */
  private final CardService cards =
      new CardService(
          new CspProperties(
              "test-secret-that-is-at-least-32-characters-long",
              null, null, null, null, null, null, null));

  @Test
  @DisplayName("a scanner pointed at the card gets back exactly the signed token")
  void roundTrips() throws Exception {
    var signed = cards.sign("CSP-114-88214", "standard", LocalDate.of(2025, 8, 1));

    var decoded = decode(qr.png(signed.qrPayload()));

    assertThat(decoded).isEqualTo(signed.qrPayload());
    // And the thing that came off the screen is a card this service will vouch
    // for — which is the whole point of putting a signature in it.
    assertThat(cards.verify(decoded)).isTrue();
  }

  @Test
  @DisplayName("the data URI is a PNG a browser and an <Image> will both take")
  void dataUriIsAPng() throws Exception {
    var signed = cards.sign("CSP-114-88214", "standard", LocalDate.of(2025, 8, 1));
    var uri = qr.dataUri(signed.qrPayload());

    assertThat(uri).startsWith("data:image/png;base64,");

    var bytes = java.util.Base64.getDecoder().decode(uri.substring("data:image/png;base64,".length()));
    // The eight-byte PNG signature. A data URI that claims image/png and is not
    // one renders as a broken image and says nothing about why.
    assertThat(java.util.Arrays.copyOf(bytes, 8))
        .containsExactly(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A);
    assertThat(decode(bytes)).isEqualTo(signed.qrPayload());
  }

  @Test
  @DisplayName("it stays small enough to sit in the card response and be cached with it")
  void staysSmall() {
    var signed = cards.sign("CSP-114-88214", "standard", LocalDate.of(2025, 8, 1));
    var uri = qr.dataUri(signed.qrPayload());

    /*
     * Two kilobytes, with the real figure around one.
     *
     * Not an arbitrary limit: this rides in every card response and is cached
     * on the handset beside it, and the members this is for buy data in ₦100
     * bundles. A change that made the image ten times larger — a bigger module
     * size, a colour depth, an SVG fallback — should have to argue for itself
     * here rather than arrive unnoticed.
     */
    assertThat(uri.length()).isLessThan(2048);
  }

  @Test
  @DisplayName("a different member gets a different code")
  void differsByMember() {
    var one = qr.dataUri(cards.sign("CSP-114-88214", "standard", LocalDate.of(2025, 8, 1)).qrPayload());
    var two = qr.dataUri(cards.sign("CSP-114-88215", "standard", LocalDate.of(2025, 8, 1)).qrPayload());
    assertThat(one).isNotEqualTo(two);
  }

  /** What a scanner does: read the picture, find the code, return the text. */
  private static String decode(byte[] png) throws Exception {
    var image = ImageIO.read(new ByteArrayInputStream(png));
    assertThat(image).as("the bytes are a readable image").isNotNull();

    var bitmap = new BinaryBitmap(new HybridBinarizer(new BufferedImageLuminanceSource(image)));
    var result =
        new QRCodeReader()
            .decode(bitmap, Map.of(DecodeHintType.CHARACTER_SET, "ISO-8859-1"));
    return result.getText();
  }
}
