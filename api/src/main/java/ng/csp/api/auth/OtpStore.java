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

  public record Challenge(UUID id, String msisdn, String codeHash, int attempts) {}

  public UUID create(String msisdn, String code) {
    var id = UUID.randomUUID();
    redis
        .opsForHash()
        .putAll(
            CHALLENGE + id,
            Map.of("msisdn", msisdn, "codeHash", sha256(code), "attempts", "0"));
    redis.expire(CHALLENGE + id, CHALLENGE_TTL);
    return id;
  }

  public Optional<Challenge> find(UUID id) {
    var hash = redis.opsForHash().entries(CHALLENGE + id);
    if (hash.isEmpty()) {
      return Optional.empty();
    }
    return Optional.of(
        new Challenge(
            id,
            (String) hash.get("msisdn"),
            (String) hash.get("codeHash"),
            Integer.parseInt((String) hash.getOrDefault("attempts", "0"))));
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
