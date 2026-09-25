package ng.csp.api.member;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Base64;
import java.util.Map;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Component;

/**
 * The picture on the protection card.
 *
 * <p>The card exists for one moment: a member at a hospital gate, on a handset with one bar and no
 * data left, showing that cover is in force. {@link CardService} has signed a payload for exactly
 * that — verifiable offline, valid for ninety days — and until now nothing drew it, so the card
 * carried a token nobody could scan.
 *
 * <h2>Why the server draws it</h2>
 *
 * <p>The obvious place is the client, and for the web it would be: a QR library, no native code, a
 * few kilobytes. React Native is the constraint. The token is about 150 characters, which is a
 * 45-by-45 code — some two thousand modules — far too many to draw as React Native views, and the
 * usual answer, {@code react-native-svg}, is a native module compiled once per ABI. The APK is
 * already 12.2 MB against a spec budget of 8 MB, and {@code @react-navigation} was removed for
 * precisely this reason; adding a native module to draw one square would be an odd thing to do
 * immediately afterwards.
 *
 * <p>So it is drawn once, here, and both surfaces show an image. One implementation rather than two,
 * and the phone pays nothing for it.
 *
 * <h2>Offline</h2>
 *
 * <p>A data URI rather than a URL, because a URL is a network call and the gate has no network. The
 * card is already cached — {@code rememberedCard()} on the phone, MMKV — so the picture caches with
 * it and is there when the signal is not. That costs about a kilobyte in the card response, which
 * is the right trade for a screen whose entire purpose is working offline.
 *
 * <h2>A note for whoever shrinks the runtime</h2>
 *
 * <p>This is the only thing in the service that needs {@code java.desktop}, for {@code ImageIO} and
 * {@code BufferedImage}. The Dockerfile runs a full {@code eclipse-temurin:25-jre} so it is there;
 * a jlinked runtime that trims modules would break this and nothing else, which is a failure that
 * would show up as a blank card rather than as a startup error.
 */
@Component
public class CardQr {

  /**
   * Module size, in pixels.
   *
   * <p>Six rather than four: a 45-module code at four pixels is 180 across, which a cheap scanner
   * at a gate reads badly off a scratched screen in daylight. At six it is 270 and the PNG is still
   * under a kilobyte, because a two-colour image of large flat squares compresses to almost
   * nothing.
   */
  private static final int MODULE_PIXELS = 6;

  /**
   * A quiet zone of four modules, which the QR specification requires.
   *
   * <p>ZXing's default is four and it is set explicitly because it is not decoration: a code butted
   * against a dark background does not scan, and on a card that means a member turned away at a
   * gate with no way to tell why.
   */
  private static final int QUIET_ZONE = 4;

  /** A {@code data:} URI holding a PNG of this payload, ready to put in an {@code <img>}. */
  public String dataUri(String payload) {
    return "data:image/png;base64," + Base64.getEncoder().encodeToString(png(payload));
  }

  /** The PNG bytes. Separate so a test can decode them rather than trust them. */
  public byte[] png(String payload) {
    BitMatrix matrix;
    try {
      matrix =
          new QRCodeWriter()
              .encode(
                  payload,
                  BarcodeFormat.QR_CODE,
                  0, // Let the writer size it from the data rather than scaling to a target.
                  0,
                  Map.of(
                      /*
                       * Medium correction, about 15%.
                       *
                       * Higher would survive a more scratched screen, and would
                       * also make the code denser for the same payload — which
                       * on a cracked ₦40,000 handset is the opposite of help.
                       * M is the level most scanners are tuned for.
                       */
                      EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M,
                      EncodeHintType.MARGIN, QUIET_ZONE,
                      // The payload is base64url, so it is all ASCII; saying so
                      // stops the encoder guessing and picking a wider mode.
                      EncodeHintType.CHARACTER_SET, "ISO-8859-1"));
    } catch (WriterException e) {
      throw new IllegalStateException("Could not encode the card's QR payload", e);
    }

    var image =
        new BufferedImage(
            matrix.getWidth() * MODULE_PIXELS,
            matrix.getHeight() * MODULE_PIXELS,
            BufferedImage.TYPE_BYTE_BINARY);

    var graphics = image.createGraphics();
    try {
      graphics.setColor(java.awt.Color.WHITE);
      graphics.fillRect(0, 0, image.getWidth(), image.getHeight());
      graphics.setColor(java.awt.Color.BLACK);
      for (int x = 0; x < matrix.getWidth(); x++) {
        for (int y = 0; y < matrix.getHeight(); y++) {
          if (matrix.get(x, y)) {
            graphics.fillRect(x * MODULE_PIXELS, y * MODULE_PIXELS, MODULE_PIXELS, MODULE_PIXELS);
          }
        }
      }
    } finally {
      graphics.dispose();
    }

    var out = new ByteArrayOutputStream();
    try {
      ImageIO.write(image, "PNG", out);
    } catch (IOException e) {
      throw new UncheckedIOException("Could not write the card's QR image", e);
    }
    return out.toByteArray();
  }
}
