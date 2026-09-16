package ng.csp.api.integration;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.micrometer.tagged.TaggedCircuitBreakerMetrics;
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import io.github.resilience4j.retry.RetryRegistry;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * The circuit breakers, in one place where they can be read.
 *
 * <p>Resilience4j publishes a Spring Boot starter, and this does not use it. The starter is built
 * for Boot 3 and depends on {@code spring-boot-starter-aop}, which Boot 4 no longer publishes; more
 * to the point, its annotations put the policy on the method and the configuration in a YAML file
 * three directories away, so nobody reading an adapter can tell what happens when the other side
 * stops answering. There are four external systems. Four explicit decorators fit on one screen.
 *
 * <p>The settings differ per system because the systems differ. NIMC is a SOAP service over an IPsec
 * tunnel that is slow on a good day; a retry there is usually worth it. NIBSS moves money and a
 * retry can pay twice, so it gets one attempt and a long timeout, and recovery is a human reading
 * the replay log. The SMS gateway is cheap to retry and nobody is harmed by a duplicate.
 */
@Component
public class Resilient {

  private static final Logger log = LoggerFactory.getLogger(Resilient.class);

  private final CircuitBreakerRegistry breakers;
  private final RetryRegistry retries;

  public Resilient(MeterRegistry meters) {
    this.breakers = CircuitBreakerRegistry.ofDefaults();
    this.retries = RetryRegistry.ofDefaults();

    /*
     * NIMC. Verification is a read, so retrying is safe, and the tunnel drops
     * often enough that half the failures clear on a second attempt. The window
     * is wide because call volume is low: ten calls an hour means a 50%
     * threshold over five calls trips on noise.
     */
    register(
        "nimc",
        CircuitBreakerConfig.custom()
            .failureRateThreshold(60)
            .slowCallRateThreshold(70)
            .slowCallDurationThreshold(Duration.ofSeconds(8))
            .waitDurationInOpenState(Duration.ofSeconds(60))
            .permittedNumberOfCallsInHalfOpenState(3)
            .minimumNumberOfCalls(20)
            .slidingWindowSize(50)
            .build(),
        RetryConfig.custom()
            .maxAttempts(3)
            .waitDuration(Duration.ofMillis(500))
            .retryExceptions(IntegrationException.Transient.class)
            .build());

    /*
     * The SMS and USSD gateway. A member is standing there waiting for a code,
     * so the breaker opens quickly and reopens quickly — a minute of failed
     * sign-ins is a queue at an HR desk. A duplicate SMS costs a few naira.
     */
    register(
        "comms",
        CircuitBreakerConfig.custom()
            .failureRateThreshold(50)
            .slowCallRateThreshold(60)
            .slowCallDurationThreshold(Duration.ofSeconds(4))
            .waitDurationInOpenState(Duration.ofSeconds(20))
            .permittedNumberOfCallsInHalfOpenState(5)
            .minimumNumberOfCalls(10)
            .slidingWindowSize(50)
            .build(),
        RetryConfig.custom()
            .maxAttempts(3)
            .waitDuration(Duration.ofMillis(300))
            .retryExceptions(IntegrationException.Transient.class)
            .build());

    /*
     * NIBSS. One attempt.
     *
     * A retried payout is a second payment, and a timeout does not tell you
     * which side of the transfer it happened on. The recovery here is
     * deliberately not automatic: the call is in the replay log, somebody looks
     * at it, and somebody decides. That is slower and it is correct.
     */
    register(
        "payout",
        CircuitBreakerConfig.custom()
            .failureRateThreshold(40)
            .slowCallRateThreshold(50)
            .slowCallDurationThreshold(Duration.ofSeconds(20))
            .waitDurationInOpenState(Duration.ofMinutes(2))
            .permittedNumberOfCallsInHalfOpenState(2)
            .minimumNumberOfCalls(10)
            .slidingWindowSize(30)
            .build(),
        RetryConfig.custom().maxAttempts(1).build());

    /*
     * The payroll SFTP endpoints. A file that is not there is not a failure —
     * it is a file that has not been sent, which is most of the month. Only a
     * connection or an auth error counts against the breaker.
     */
    register(
        "sftp",
        CircuitBreakerConfig.custom()
            .failureRateThreshold(70)
            .waitDurationInOpenState(Duration.ofMinutes(5))
            .permittedNumberOfCallsInHalfOpenState(2)
            .minimumNumberOfCalls(5)
            .slidingWindowSize(20)
            .build(),
        RetryConfig.custom()
            .maxAttempts(2)
            .waitDuration(Duration.ofSeconds(5))
            .retryExceptions(IntegrationException.Transient.class)
            .build());

    // Breaker state lands in /actuator/prometheus, so "NIMC is down" is a
    // dashboard line rather than a support call.
    TaggedCircuitBreakerMetrics.ofCircuitBreakerRegistry(breakers).bindTo(meters);

    breakers
        .getAllCircuitBreakers()
        .forEach(
            breaker ->
                breaker
                    .getEventPublisher()
                    .onStateTransition(
                        event ->
                            log.warn(
                                "circuit breaker {} {} -> {}",
                                event.getCircuitBreakerName(),
                                event.getStateTransition().getFromState(),
                                event.getStateTransition().getToState())));
  }

  private void register(String name, CircuitBreakerConfig breaker, RetryConfig retry) {
    breakers.circuitBreaker(name, breaker);
    retries.retry(name, retry);
  }

  /** What the breaker is doing right now, for the replay log's record of the attempt. */
  public String stateOf(String system) {
    return breakers.circuitBreaker(system).getState().name();
  }

  /**
   * Runs a call through that system's breaker and retry policy.
   *
   * <p>An open breaker throws {@link IntegrationException.Unavailable} rather than attempting the
   * call, which is the whole point: when NIMC has been timing out for a minute, the enrolment queue
   * should be told immediately instead of every request waiting eight seconds to find out.
   */
  public <T> T call(String system, Supplier<T> work) {
    var breaker = breakers.circuitBreaker(system);
    var retry = retries.retry(system);
    try {
      return Retry.decorateSupplier(retry, CircuitBreaker.decorateSupplier(breaker, work)).get();
    } catch (io.github.resilience4j.circuitbreaker.CallNotPermittedException e) {
      throw new IntegrationException.Unavailable(
          system, "%s is not answering, so we are not calling it. Try again shortly.".formatted(system), e);
    }
  }
}
