package ng.csp.api.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import ng.csp.api.config.CspProperties;
import ng.csp.api.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

  private static final Logger log = LoggerFactory.getLogger(AuthService.class);

  /** Three attempts per challenge, then a fifteen-minute lock — straight from the spec. */
  private static final int MAX_ATTEMPTS = 3;
  private static final Duration LOCK = Duration.ofMinutes(15);
  private static final Duration CHALLENGE_TTL = Duration.ofMinutes(5);

  private final JdbcClient db;
  private final CspProperties props;
  private final SecureRandom random = new SecureRandom();

  public AuthService(JdbcClient db, CspProperties props) {
    this.db = db;
    this.props = props;
  }

  public record Challenge(UUID challengeId, long expiresIn, String devCode) {}

  /**
   * Start a sign-in.
   *
   * <p>Answers identically whether or not the number is known. Telling an unknown caller "no such
   * member" turns this endpoint into a way to find out who is enrolled, which for an insurance
   * scheme is a privacy leak.
   */
  @Transactional
  public Challenge startChallenge(String rawMsisdn) {
    var msisdn = Msisdn.normalise(rawMsisdn);

    var locked =
        db.sql(
                """
                SELECT 1 FROM auth_challenges
                 WHERE msisdn = :msisdn AND locked_at > now() - :lock::interval
                 LIMIT 1
                """)
            .param("msisdn", msisdn)
            .param("lock", LOCK.toMinutes() + " minutes")
            .query(Integer.class)
            .optional();
    if (locked.isPresent()) {
      throw ApiException.tooManyRequests(
          "Too many wrong codes. Try again in %d minutes.".formatted(LOCK.toMinutes()));
    }

    var code = props.otp().fixedCode() != null ? props.otp().fixedCode() : randomCode();
    var id =
        db.sql(
                """
                INSERT INTO auth_challenges (msisdn, code_hash, expires_at)
                VALUES (:msisdn, :hash, now() + :ttl::interval)
                RETURNING id
                """)
            .param("msisdn", msisdn)
            .param("hash", sha256(code))
            .param("ttl", CHALLENGE_TTL.toSeconds() + " seconds")
            .query(UUID.class)
            .single();

    var known =
        db.sql("SELECT 1 FROM users WHERE msisdn = :m AND disabled_at IS NULL")
            .param("m", msisdn)
            .query(Integer.class)
            .optional();
    if (known.isPresent()) {
      // Where an SMS provider would be called.
      log.info("otp issued for {}", msisdn);
    }

    return new Challenge(id, CHALLENGE_TTL.toSeconds(), props.otp().echo() ? code : null);
  }

  /** Exchange a code for a session. */
  @Transactional
  public SessionUser verify(UUID challengeId, String code) {
    var row =
        db.sql(
                """
                SELECT id, msisdn, code_hash, attempts, consumed_at IS NOT NULL AS consumed,
                       expires_at < now() AS expired
                  FROM auth_challenges WHERE id = :id FOR UPDATE
                """)
            .param("id", challengeId)
            .query(
                (rs, n) ->
                    new ChallengeRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("msisdn"),
                        rs.getString("code_hash"),
                        rs.getInt("attempts"),
                        rs.getBoolean("consumed"),
                        rs.getBoolean("expired")))
            .optional()
            .orElseThrow(() -> ApiException.unauthorized("That sign-in has expired. Ask for a new code."));

    if (row.consumed()) {
      throw ApiException.unauthorized("That code has already been used.");
    }
    if (row.expired()) {
      throw ApiException.unauthorized("That code has expired. Ask for a new one.");
    }

    if (!constantTimeEquals(row.codeHash(), sha256(code))) {
      var attempts = row.attempts() + 1;
      var lockNow = attempts >= MAX_ATTEMPTS;
      db.sql(
              """
              UPDATE auth_challenges
                 SET attempts = :attempts,
                     locked_at = CASE WHEN :lock THEN now() ELSE locked_at END
               WHERE id = :id
              """)
          .param("attempts", attempts)
          .param("lock", lockNow)
          .param("id", row.id())
          .update();
      throw lockNow
          ? ApiException.tooManyRequests(
              "Too many wrong codes. Try again in %d minutes.".formatted(LOCK.toMinutes()))
          : ApiException.unauthorized(
              "Wrong code. %d attempt(s) left.".formatted(MAX_ATTEMPTS - attempts));
    }

    db.sql("UPDATE auth_challenges SET consumed_at = now() WHERE id = :id").param("id", row.id()).update();

    var user =
        db.sql(
                """
                SELECT id, role, member_id, sponsor_id
                  FROM users WHERE msisdn = :m AND disabled_at IS NULL
                """)
            .param("m", row.msisdn())
            .query(
                (rs, n) ->
                    new SessionUser(
                        rs.getObject("id", UUID.class),
                        Role.fromWire(rs.getString("role")),
                        rs.getObject("member_id", UUID.class),
                        rs.getObject("sponsor_id", UUID.class),
                        null))
            .optional()
            // The number passed the code check but belongs to nobody. Same
            // generic answer as a wrong code, for the same reason.
            .orElseThrow(() -> ApiException.unauthorized("We could not sign you in with that number."));

    db.sql("UPDATE users SET last_seen_at = now() WHERE id = :id").param("id", user.userId()).update();
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

  public void attestDevice(SessionUser session, String deviceId, String platform, String publicKey, String label) {
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

  public record Profile(String name, String email) {}

  public Optional<Profile> profileOf(UUID userId) {
    return db.sql("SELECT full_name, email FROM users WHERE id = :id")
        .param("id", userId)
        .query((rs, n) -> new Profile(rs.getString("full_name"), rs.getString("email")))
        .optional();
  }

  private record ChallengeRow(
      UUID id, String msisdn, String codeHash, int attempts, boolean consumed, boolean expired) {}

  private String randomCode() {
    return "%06d".formatted(random.nextInt(1_000_000));
  }

  private static String sha256(String value) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException("SHA-256 unavailable", e);
    }
  }

  /** So a wrong code cannot be found by timing the reply. */
  private static boolean constantTimeEquals(String a, String b) {
    return MessageDigest.isEqual(
        a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
  }
}
