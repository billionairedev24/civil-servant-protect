package ng.csp.api.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Sign-in challenges, in Redis.
 *
 * <p>The build spec puts OTP challenges, rate limits and console sessions in Redis rather than
 * Postgres, and it is the right call for more than speed: a challenge is worthless five minutes
 * after it is made, and the ledger database should not be accumulating a row per sign-in attempt
 * for 1.3m members — nor replicating them to the DR site.
 *
 * <p>Expiry is the store's job. A challenge key carries a TTL, so an abandoned sign-in cleans itself
 * up and there is no sweeper job to forget to run.
 */
@Component
public class OtpStore {

  /** Three attempts per challenge, then a fifteen-minute lock — straight from the spec. */
  public static final int MAX_ATTEMPTS = 3;
  public static final Duration LOCK = Duration.ofMinutes(15);
  public static final Duration CHALLENGE_TTL = Duration.ofMinutes(5);

  private static final String CHALLENGE = "csp:otp:challenge:";
  private static final String LOCKOUT = "csp:otp:lock:";

  private final StringRedisTemplate redis;

  public OtpStore(StringRedisTemplate redis) {
    this.redis = redis;
  }

  /**
   * @param aboutMemberId set only on a next-of-kin sign-in: the member who has died.
   *     Pinned when the challenge is made rather than worked out at verify time, because one
   *     number can be named by two members — a woman on her husband's record and her brother's —
   *     and "which of them is this code for" is not a question to answer by guessing.
   */
  public record Challenge(
      UUID id, String msisdn, String codeHash, int attempts, UUID aboutMemberId) {}

  public UUID create(String msisdn, String code) {
    return create(msisdn, code, null);
  }

  public UUID create(String msisdn, String code, UUID aboutMemberId) {
    var id = UUID.randomUUID();
    var fields = new java.util.HashMap<String, String>();
    fields.put("msisdn", msisdn);
    fields.put("codeHash", sha256(code));
    fields.put("attempts", "0");
    if (aboutMemberId != null) {
      fields.put("about", aboutMemberId.toString());
    }
    redis.opsForHash().putAll(CHALLENGE + id, fields);
    redis.expire(CHALLENGE + id, CHALLENGE_TTL);
    return id;
  }

  public Optional<Challenge> find(UUID id) {
    var hash = redis.opsForHash().entries(CHALLENGE + id);
    if (hash.isEmpty()) {
      return Optional.empty();
    }
    var about = (String) hash.get("about");
    return Optional.of(
        new Challenge(
            id,
            (String) hash.get("msisdn"),
            (String) hash.get("codeHash"),
            Integer.parseInt((String) hash.getOrDefault("attempts", "0")),
            about == null ? null : UUID.fromString(about)));
  }

  /** A used challenge is gone, not flagged — there is nothing to replay. */
  public void consume(UUID id) {
    redis.delete(CHALLENGE + id);
  }

  /** Returns the new attempt count. */
  public int recordFailure(UUID id) {
    var attempts = redis.opsForHash().increment(CHALLENGE + id, "attempts", 1L);
    return attempts == null ? MAX_ATTEMPTS : attempts.intValue();
  }

  public void lock(String msisdn) {
    redis.opsForValue().set(LOCKOUT + msisdn, "1", LOCK);
  }

  public boolean isLocked(String msisdn) {
    return Boolean.TRUE.equals(redis.hasKey(LOCKOUT + msisdn));
  }

  /** Constant-time, so a wrong code cannot be found by timing the reply. */
  public static boolean matches(String storedHash, String code) {
    if (storedHash == null) {
      return false;
    }
    return MessageDigest.isEqual(
        storedHash.getBytes(StandardCharsets.UTF_8), sha256(code).getBytes(StandardCharsets.UTF_8));
  }

  private static String sha256(String value) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException("SHA-256 unavailable", e);
    }
  }
}
