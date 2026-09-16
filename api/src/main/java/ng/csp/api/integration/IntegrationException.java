package ng.csp.api.integration;

/**
 * What went wrong with an external system, in the only three shapes that change what anyone does
 * about it.
 *
 * <p>The distinction is not academic. It decides whether the call is retried, whether the circuit
 * breaker counts it, and whether the replay log marks the row as something a human should look at.
 * Collapsing them into one exception — which is what a bare {@code RuntimeException} does — means
 * retrying a refusal forever and giving up on a timeout.
 */
public abstract class IntegrationException extends RuntimeException {

  private final String system;

  protected IntegrationException(String system, String message, Throwable cause) {
    super(message, cause);
    this.system = system;
  }

  public String system() {
    return system;
  }

  /**
   * No answer, or a broken one.
   *
   * <p>Worth retrying, counts against the breaker, and leaves a row in the replay log that a human
   * may need to act on — because a timeout does not say whether the other side did the thing.
   */
  public static final class Transient extends IntegrationException {
    public Transient(String system, String message, Throwable cause) {
      super(system, message, cause);
    }
  }

  /**
   * The other side answered, and said no.
   *
   * <p>"That NIN does not exist." "That account number is not valid." Retrying asks the same
   * question and gets the same answer, so it does not, and it does not count against the breaker
   * either: the system is working exactly as it should.
   */
  public static final class Refused extends IntegrationException {
    private final String code;

    public Refused(String system, String code, String message) {
      super(system, message, null);
      this.code = code;
    }

    public String code() {
      return code;
    }
  }

  /**
   * We did not call, because the breaker is open.
   *
   * <p>Nothing was sent, so there is nothing to reconcile — which makes this the one failure that is
   * genuinely safe.
   */
  public static final class Unavailable extends IntegrationException {
    public Unavailable(String system, String message, Throwable cause) {
      super(system, message, cause);
    }
  }
}
