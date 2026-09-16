package ng.csp.api.auth;

import java.security.SecureRandom;
import java.util.Optional;
import java.util.UUID;
import ng.csp.api.config.CspProperties;
import ng.csp.api.integration.Comms;
import ng.csp.api.integration.ReplayLog;
import ng.csp.api.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Member sign-in: NIN+DOB lookup, SMS OTP, device-bound refresh token.
 *
 * <p>This path is only ever for members and next of kin. Console roles authenticate against Keycloak
 * — see {@code SecurityConfig} — because a finance officer has an MDA account and TOTP, while a
 * civil servant on a Tecno in a village has a phone number and nothing else. Trying to serve both
 * with one mechanism makes one of them worse.
 */
@Service
public class AuthService {

  private static final Logger log = LoggerFactory.getLogger(AuthService.class);

  private final JdbcClient db;
  private final OtpStore otp;
  private final CspProperties props;
  private final Comms comms;
  private final SecureRandom random = new SecureRandom();

  public AuthService(JdbcClient db, OtpStore otp, CspProperties props, Comms comms) {
    this.db = db;
    this.otp = otp;
    this.props = props;
    this.comms = comms;
  }

  public record Challenge(UUID challengeId, long expiresIn, String devCode) {}

  /**
   * Start a sign-in.
   *
   * <p>Answers identically whether or not the number is known. Telling an unknown caller "no such
   * member" turns this endpoint into a way to find out who is enrolled, which for an insurance
   * scheme covering named civil servants is a privacy leak.
   */
  public Challenge startChallenge(String rawMsisdn) {
    var msisdn = Msisdn.normalise(rawMsisdn);

    if (otp.isLocked(msisdn)) {
      throw ApiException.tooManyRequests(
          "Too many wrong codes. Try again in %d minutes.".formatted(OtpStore.LOCK.toMinutes()));
    }

    var code = props.otp().fixedCode() != null ? props.otp().fixedCode() : randomCode();
    var id = otp.create(msisdn, code);

    /*
     * The code goes out only to a number we know.
     *
     * The response above is identical either way — see this method's contract —
     * so an unknown caller learns nothing, and we do not pay to text a stranger
     * or let someone use this endpoint as a free SMS gun pointed at a number
     * they do not own.
     *
     * A failure here does not fail the sign-in. The challenge is already in
     * Redis, `OTP_ECHO` may be on for a demo, and a member who never receives
     * the SMS is better served by "resend" than by a 500 — the attempt is in
     * the replay log either way, which is where an operator would look.
     */
    if (isKnown(msisdn)) {
      try {
        comms.sendOtp(msisdn, code, id.toString());
      } catch (ReplayLog.AlreadyDone e) {
        log.info("otp for challenge {} was already sent", id);
      } catch (RuntimeException e) {
        log.warn("could not send the sign-in code for challenge {}: {}", id, e.getMessage());
      }
    }

    return new Challenge(
        id, OtpStore.CHALLENGE_TTL.toSeconds(), props.otp().echo() ? code : null);
  }

  /** Exchange a code for a session. */
  @Transactional
  public SessionUser verify(UUID challengeId, String code) {
    var challenge =
        otp.find(challengeId)
            .orElseThrow(
                () -> ApiException.unauthorized("That sign-in has expired. Ask for a new code."));

    if (!OtpStore.matches(challenge.codeHash(), code)) {
      var attempts = otp.recordFailure(challengeId);
      if (attempts >= OtpStore.MAX_ATTEMPTS) {
        otp.lock(challenge.msisdn());
        otp.consume(challengeId);
        throw ApiException.tooManyRequests(
            "Too many wrong codes. Try again in %d minutes.".formatted(OtpStore.LOCK.toMinutes()));
      }
      throw ApiException.unauthorized(
          "Wrong code. %d attempt(s) left.".formatted(OtpStore.MAX_ATTEMPTS - attempts));
    }

    // Used, so it is gone rather than flagged — there is nothing left to replay.
    otp.consume(challengeId);

    var user =
        db.sql(
                """
                SELECT id, role, member_id, sponsor_id
                  FROM users
                 WHERE msisdn = :m AND disabled_at IS NULL
                   AND role IN ('member', 'next_of_kin')
                """)
            .param("m", challenge.msisdn())
            .query(
                (rs, n) ->
                    new SessionUser(
                        rs.getObject("id", UUID.class),
                        Role.fromWire(rs.getString("role")),
                        rs.getObject("member_id", UUID.class),
                        rs.getObject("sponsor_id", UUID.class),
                        null))
            .optional()
            // The number passed the code check but belongs to nobody, or belongs
            // to a console account that must come through Keycloak. Same generic
            // answer either way, for the same reason as above.
            .orElseThrow(() -> ApiException.unauthorized("We could not sign you in with that number."));

    touch(user.userId());
    return user;
  }

  /**
   * Re-check a session before reissuing tokens.
   *
   * <p>This is where a revoked handset is turned away — not at the next screen, so a stolen phone
   * stops working within one token lifetime rather than on whatever screen happens to look.
   */
  public SessionUser revalidate(SessionUser session) {
    var live =
        db.sql("SELECT 1 FROM users WHERE id = :id AND disabled_at IS NULL")
            .param("id", session.userId())
            .query(Integer.class)
            .optional();
    if (live.isEmpty()) {
      throw ApiException.unauthorized("That account is no longer active.");
    }
    if (session.deviceId() != null) {
      var device =
          db.sql(
                  """
                  SELECT 1 FROM devices
                   WHERE user_id = :u AND device_id = :d AND revoked_at IS NULL
                  """)
              .param("u", session.userId())
              .param("d", session.deviceId())
              .query(Integer.class)
              .optional();
      if (device.isEmpty()) {
        throw ApiException.unauthorized("This device has been signed out.");
      }
    }
    return session;
  }

  public void attestDevice(
      SessionUser session, String deviceId, String platform, String publicKey, String label) {
    if (session.memberId() == null) {
      throw ApiException.badRequest("Only a member app attests a device.");
    }
    db.sql(
            """
            INSERT INTO devices (user_id, device_id, platform, public_key, label)
            VALUES (:u, :d, :p, :k, :l)
            ON CONFLICT (user_id, device_id)
            DO UPDATE SET public_key = EXCLUDED.public_key, revoked_at = NULL
            """)
        .param("u", session.userId())
        .param("d", deviceId)
        .param("p", platform)
        .param("k", publicKey)
        .param("l", label)
        .update();
  }

  /**
   * Resolve a Keycloak subject to our user row, creating it on first sign-in.
   *
   * <p>Keycloak owns who a console user is and what realm roles they hold; this table owns the
   * mapping to a sponsor and the audit identity. Provisioning on first sign-in means an officer
   * added to the realm can work immediately, without a second admin step nobody remembers.
   */
  @Transactional
  public SessionUser resolveOidcUser(String subject, String name, String email, Role role, UUID sponsorId) {
    var existing =
        db.sql("SELECT id, sponsor_id FROM users WHERE oidc_subject = :s AND disabled_at IS NULL")
            .param("s", subject)
            .query((rs, n) -> new Object[] {rs.getObject("id", UUID.class), rs.getObject("sponsor_id", UUID.class)})
            .optional();

    if (existing.isPresent()) {
      var id = (UUID) existing.get()[0];
      // The realm is the source of truth for the role, so a change there takes
      // effect on the next sign-in rather than needing a database edit.
      db.sql("UPDATE users SET role = CAST(:r AS user_role), last_seen_at = now() WHERE id = :id")
          .param("r", role.wire())
          .param("id", id)
          .update();
      return new SessionUser(id, role, null, (UUID) existing.get()[1], null);
    }

    if (sponsorId == null && role.isSponsorSide()) {
      throw ApiException.forbidden(
          "Your account has no sponsor assigned. Ask an administrator to set one.");
    }

    var id =
        db.sql(
                """
                INSERT INTO users (oidc_subject, full_name, email, role, sponsor_id, last_seen_at)
                VALUES (:s, :n, :e, CAST(:r AS user_role), :sp, now())
                RETURNING id
                """)
            .param("s", subject)
            .param("n", name)
            .param("e", email)
            .param("r", role.wire())
            .param("sp", sponsorId)
            .query(UUID.class)
            .single();
    return new SessionUser(id, role, null, sponsorId, null);
  }

  public record Profile(String name, String email) {}

  public Optional<Profile> profileOf(UUID userId) {
    return db.sql("SELECT full_name, email FROM users WHERE id = :id")
        .param("id", userId)
        .query((rs, n) -> new Profile(rs.getString("full_name"), rs.getString("email")))
        .optional();
  }

  private boolean isKnown(String msisdn) {
    return db.sql("SELECT 1 FROM users WHERE msisdn = :m AND disabled_at IS NULL")
        .param("m", msisdn)
        .query(Integer.class)
        .optional()
        .isPresent();
  }

  private void touch(UUID userId) {
    db.sql("UPDATE users SET last_seen_at = now() WHERE id = :id").param("id", userId).update();
  }

  private String randomCode() {
    return "%06d".formatted(random.nextInt(1_000_000));
  }
}
