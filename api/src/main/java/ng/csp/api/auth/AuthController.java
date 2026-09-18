package ng.csp.api.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import ng.csp.api.web.ApiException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
public class AuthController {

  private final AuthService auth;
  private final TokenService tokens;
  private final JwtDecoder decoder;

  public AuthController(AuthService auth, TokenService tokens, JwtDecoder decoder) {
    this.auth = auth;
    this.tokens = tokens;
    this.decoder = decoder;
  }

  public record OtpRequest(@NotBlank @Size(min = 7, max = 20) String msisdn) {}

  public record OtpResponse(UUID challengeId, long expiresIn, String devCode) {}

  @PostMapping("/auth/otp")
  public OtpResponse otp(@Valid @RequestBody OtpRequest body) {
    var challenge = auth.startChallenge(body.msisdn());
    return new OtpResponse(challenge.challengeId(), challenge.expiresIn(), challenge.devCode());
  }

  public record VerifyRequest(
      @NotNull UUID challengeId,
      @NotBlank @Pattern(regexp = "^\\d{6}$", message = "The code is six digits") String code) {}

  public record TokenResponse(
      String accessToken,
      String refreshToken,
      long expiresIn,
      String role,
      UUID memberId,
      UUID sponsorId) {}

  @PostMapping("/auth/verify")
  public TokenResponse verify(@Valid @RequestBody VerifyRequest body) {
    var session = auth.verify(body.challengeId(), body.code());
    var issued = tokens.issue(session);
    return new TokenResponse(
        issued.accessToken(),
        issued.refreshToken(),
        issued.expiresIn(),
        session.role().wire(),
        session.memberId(),
        session.sponsorId());
  }

  public record KinOtpRequest(
      @NotBlank @Size(min = 6, max = 24) String cspId,
      @NotBlank @Size(min = 7, max = 20) String msisdn) {}

  /**
   * The other door: somebody claiming on a member who has died.
   *
   * <p>Separate from {@code /auth/otp} rather than a flag on it, because it authenticates a
   * different person against different facts and issues a session that sees different things. A
   * branch inside one endpoint is how the wrong one gets issued.
   */
  @PostMapping("/auth/kin/otp")
  public OtpResponse kinOtp(@Valid @RequestBody KinOtpRequest body) {
    var challenge = auth.startKinChallenge(body.cspId(), body.msisdn());
    return new OtpResponse(challenge.challengeId(), challenge.expiresIn(), challenge.devCode());
  }

  @PostMapping("/auth/kin/verify")
  public TokenResponse kinVerify(@Valid @RequestBody VerifyRequest body) {
    var session = auth.verifyKin(body.challengeId(), body.code());
    var issued = tokens.issue(session);
    return new TokenResponse(
        issued.accessToken(),
        issued.refreshToken(),
        issued.expiresIn(),
        session.role().wire(),
        session.memberId(),
        session.sponsorId());
  }

  public record RefreshRequest(@NotBlank String refreshToken) {}

  @PostMapping("/auth/refresh")
  public TokenResponse refresh(@Valid @RequestBody RefreshRequest body) {
    Jwt jwt;
    try {
      jwt = decoder.decode(body.refreshToken());
    } catch (Exception e) {
      throw ApiException.unauthorized("Your session has expired. Sign in again.");
    }
    var session = TokenService.sessionOf(jwt, "refresh");
    if (session == null) {
      throw ApiException.unauthorized("That token cannot be used to refresh.");
    }
    var checked = auth.revalidate(session);
    var issued = tokens.issue(checked);
    return new TokenResponse(
        issued.accessToken(),
        issued.refreshToken(),
        issued.expiresIn(),
        checked.role().wire(),
        checked.memberId(),
        checked.sponsorId());
  }

  public record AttestRequest(
      @NotBlank @Size(min = 8) String deviceId,
      @NotBlank @Pattern(regexp = "android|ios") String platform,
      @NotBlank @Size(min = 32) String publicKey,
      String label) {}

  /** Phone only. A browser has no device to attest. */
  @PostMapping("/devices/attest")
  public Map<String, Boolean> attest(SessionUser session, @Valid @RequestBody AttestRequest body) {
    auth.attestDevice(session, body.deviceId(), body.platform(), body.publicKey(), body.label());
    return Map.of("trusted", true, "revocable", true);
  }

  public record SessionResponse(
      UUID userId,
      String name,
      String email,
      String role,
      String roleLabel,
      List<String> permissions,
      UUID memberId,
      UUID sponsorId) {}

  /** Who am I — what every surface calls on load to paint its chrome. */
  @GetMapping("/auth/session")
  public SessionResponse session(SessionUser session) {
    var profile = auth.profileOf(session.userId()).orElse(new AuthService.Profile(null, null));
    return new SessionResponse(
        session.userId(),
        profile.name(),
        profile.email(),
        session.role().wire(),
        session.role().label(),
        // The console greys out what a role cannot do rather than hiding it, so
        // it needs the list rather than inferring from the role name.
        session.role().permissions().stream().map(Enum::name).sorted().toList(),
        session.memberId(),
        session.sponsorId());
  }
}
