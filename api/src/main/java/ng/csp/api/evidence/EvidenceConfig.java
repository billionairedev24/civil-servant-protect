package ng.csp.api.evidence;

import java.nio.file.Path;
import ng.csp.api.config.CspProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Picks where evidence goes, and says so in the log.
 *
 * <p>Announced at startup on purpose. "Which bucket did that certificate land in" is a question
 * asked during an incident, and the answer should already be in the log rather than assembled from
 * environment variables afterwards.
 */
@Configuration
public class EvidenceConfig {

  private static final Logger log = LoggerFactory.getLogger(EvidenceConfig.class);

  @Bean
  Evidence evidence(CspProperties props) {
    var settings = props.evidence();
    Evidence store =
        settings.isLocal()
            ? new LocalEvidence(Path.of(settings.root()), settings.baseUrl())
            : new S3Evidence(
                settings.endpoint(),
                settings.region(),
                required(settings.bucket(), "csp.evidence.bucket"),
                required(settings.accessKey(), "csp.evidence.access-key"),
                required(settings.secretKey(), "csp.evidence.secret-key"));

    log.info("Claim evidence: {}", store.describe());
    return store;
  }

  /*
   * Checked here rather than on the record, because these are required only in
   * s3 mode and a @NotBlank would stop a local developer from starting at all.
   */
  private static String required(String value, String name) {
    if (value == null || value.isBlank()) {
      throw new IllegalStateException(
          name + " must be set when csp.evidence.mode is 's3'. See SETUP.md.");
    }
    return value;
  }
}
