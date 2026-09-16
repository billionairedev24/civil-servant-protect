package ng.csp.api.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Configuration, validated at startup.
 *
 * <p>A missing or malformed value stops the context here with a readable message rather than
 * surfacing as a confusing 500 on the first request that needs it. That matters most in Kubernetes,
 * where a pod that starts and then fails every request looks healthy to everything except the people
 * using it.
 */
@Validated
@ConfigurationProperties(prefix = "csp")
public record CspProperties(
    @NotBlank
        @Size(min = 32, message = "csp.jwt-secret must be at least 32 characters")
        String jwtSecret,
    Duration accessTokenTtl,
    Duration refreshTokenTtl,
    List<String> corsOrigins,
    /**
     * Issuer for the tokens this service mints.
     *
     * <p>Must be a URL: Spring converts the {@code iss} claim to one while decoding, and a bare word
     * fails conversion and comes back as a flat 401 with nothing in the log to explain it. OIDC
     * requires a URL issuer in any case.
     */
    String tokenIssuer,
    Otp otp) {

  public CspProperties {
    accessTokenTtl = accessTokenTtl == null ? Duration.ofMinutes(20) : accessTokenTtl;
    refreshTokenTtl = refreshTokenTtl == null ? Duration.ofHours(8) : refreshTokenTtl;
    corsOrigins =
        corsOrigins == null || corsOrigins.isEmpty()
            ? List.of("http://localhost:[*]", "http://127.0.0.1:[*]")
            : corsOrigins;
    tokenIssuer = tokenIssuer == null || tokenIssuer.isBlank() ? "https://member-auth.csp.local" : tokenIssuer;
    otp = otp == null ? new Otp(false, null) : otp;
  }

  /**
   * With no SMS provider wired up, the demo needs a way in.
   *
   * <p>{@code echo} returns the code in the response and {@code fixedCode} pins it. Both are refused
   * when the {@code prod} profile is active — see {@link ProductionSafetyCheck}, which stops the
   * context rather than trusting a deploy to have unset them.
   */
  public record Otp(boolean echo, @Pattern(regexp = "^\\d{6}$") String fixedCode) {
    public boolean isRelaxed() {
      return echo || fixedCode != null;
    }
  }
}
