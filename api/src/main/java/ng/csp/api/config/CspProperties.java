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
    Integrations integrations,
    Otp otp) {

  public CspProperties {
    accessTokenTtl = accessTokenTtl == null ? Duration.ofMinutes(20) : accessTokenTtl;
    refreshTokenTtl = refreshTokenTtl == null ? Duration.ofHours(8) : refreshTokenTtl;
    corsOrigins =
        corsOrigins == null || corsOrigins.isEmpty()
            ? List.of("http://localhost:[*]", "http://127.0.0.1:[*]")
            : corsOrigins;
    tokenIssuer = tokenIssuer == null || tokenIssuer.isBlank() ? "https://member-auth.csp.local" : tokenIssuer;
    integrations = integrations == null ? new Integrations("stub", null, null, null, null) : integrations;
    otp = otp == null ? new Otp(false, null) : otp;
  }

  /**
   * Where the four external systems live, and whether we are really calling them.
   *
   * <p>{@code stub} is the default because a working checkout should be a working system: a
   * developer with Postgres and Redis can enrol, sign in and pay a claim without an account at an
   * SMS aggregator. It is refused under the {@code prod} profile — see {@link
   * ProductionSafetyCheck} — because a production deploy that silently stops sending SMS is a
   * scheme whose members are never told anything.
   */
  public record Integrations(
      @Pattern(regexp = "stub|http", message = "csp.integrations.mode is 'stub' or 'http'")
          String mode,
      String nimcUrl,
      String commsUrl,
      String commsSender,
      String payoutUrl) {
    public boolean isStubbed() {
      return !"http".equals(mode);
    }
  }

  /**
   * With no SMS provider wired up, the demo needs a way in.
   *
   * <p>{@code echo} returns the code in the response and {@code fixedCode} pins it. Both are refused
   * when the {@code prod} profile is active — see {@link ProductionSafetyCheck}, which stops the
   * context rather than trusting a deploy to have unset them.
   */
  public record Otp(boolean echo, @Pattern(regexp = "^\\d{6}$") String fixedCode) {

    /*
     * An empty value means unset.
     *
     * `OTP_FIXED_CODE: ""` is what a Helm values file or a Kubernetes env block
     * produces for a variable somebody chose not to set, and it arrives here as
     * an empty string rather than as null. Treated literally it fails the
     * six-digit pattern — so the context would not start at all — and if it got
     * past that, `fixedCode != null` would read an unset variable as a pinned
     * code and refuse a perfectly good production deploy.
     */
    public Otp {
      fixedCode = fixedCode == null || fixedCode.isBlank() ? null : fixedCode;
    }

    public boolean isRelaxed() {
      return echo || fixedCode != null;
    }
  }
}
