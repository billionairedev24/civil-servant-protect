package ng.csp.api.integration;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import ng.csp.api.config.CspProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

/**
 * The adapters, against real endpoints.
 *
 * <p>Only one of the four is written. That is stated here rather than discovered from a stack trace,
 * because the difference between "not configured" and "not implemented" is the difference between a
 * deploy that needs a URL and one that needs a fortnight.
 *
 * <ul>
 *   <li><b>comms</b> — written. A JSON POST with a bearer token, which is the shape every Nigerian
 *       SMS aggregator offers; the field names are the common ones and the URL is configuration.
 *   <li><b>nimc</b> — not written. JAX-WS SOAP over an IPsec tunnel, against a WSDL that is not
 *       public and credentials that are issued per-integrator. Guessing at it would produce a client
 *       that compiles and has never spoken to NIMC.
 *   <li><b>payout</b> — not written. NIBSS requires an onboarded institution code and a signing
 *       certificate, and this is the one adapter where a plausible-looking wrong implementation
 *       moves money.
 *   <li><b>sftp</b> — not written. Needs Apache MINA and per-sponsor host keys.
 * </ul>
 *
 * <p>The three that are not written construct anyway, and refuse when used. A context that will not
 * start hides every other misconfiguration behind one missing bean; one that starts and says exactly
 * which integration is missing, when something reaches for it, is more use to whoever is deploying
 * it.
 */
@Configuration
@ConditionalOnProperty(name = "csp.integrations.mode", havingValue = "http")
public class HttpIntegrations {

  private static final Logger log = LoggerFactory.getLogger(HttpIntegrations.class);

  private final HttpClient http =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

  @Bean
  Comms httpComms(CspProperties props, ReplayLog replay, ObjectMapper json) {
    var config = props.integrations();
    if (config.commsUrl() == null || config.commsUrl().isBlank()) {
      throw new IllegalStateException(
          "csp.integrations.mode is 'http' but COMMS_URL is not set. Members would never be sent "
              + "a sign-in code, and nothing would say so.");
    }
    log.info("comms adapter pointed at {}", config.commsUrl());

    return new Comms() {
      @Override
      public Accepted sendOtp(String msisdn, String code, String subject) {
        return replay.around(
            ReplayLog.Call.once("comms", "send_otp", subject, "otp:" + subject),
            Redacted.of("channel", "sms").msisdn("to", msisdn).withheld("code").build(),
            () -> post(config, json, msisdn, "Your Civil Servant Protect code is " + code));
      }

      @Override
      public Accepted notify(String msisdn, String template, Map<String, String> values, String subject) {
        return replay.around(
            ReplayLog.Call.once("comms", "notify", subject, "notify:%s:%s".formatted(template, subject)),
            Redacted.of("template", template).msisdn("to", msisdn).plain("values", values).build(),
            // Templated at the gateway: the aggregators require pre-registered
            // templates for bulk traffic, and a template id survives a
            // translation change without a deploy.
            () -> post(config, json, msisdn, template, values));
      }

      @Override
      public String ussdReply(String sessionId, String msisdn, String input) {
        // Inbound, not outbound: the aggregator posts to us and we answer in
        // the response body. There is no call to make here.
        throw new UnsupportedOperationException(
            "USSD sessions arrive as webhooks; this method is the wrong side of that.");
      }
    };
  }

  private Comms.Accepted post(
      CspProperties.Integrations config, ObjectMapper json, String msisdn, String text) {
    return post(config, json, msisdn, text, null);
  }

  private Comms.Accepted post(
      CspProperties.Integrations config,
      ObjectMapper json,
      String msisdn,
      String textOrTemplate,
      Map<String, String> values) {
    var body =
        values == null
            ? Map.<String, Object>of("to", msisdn, "from", config.commsSender(), "text", textOrTemplate)
            : Map.<String, Object>of(
                "to", msisdn, "from", config.commsSender(), "template", textOrTemplate, "data", values);

    try {
      var request =
          HttpRequest.newBuilder(URI.create(config.commsUrl()))
              .timeout(Duration.ofSeconds(10))
              .header("Content-Type", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body), StandardCharsets.UTF_8))
              .build();

      var response = http.send(request, HttpResponse.BodyHandlers.ofString());

      /*
       * 4xx is the gateway saying no — a malformed number, an unregistered
       * template, an empty account. Retrying asks the same question, so it is
       * Refused and does not count against the breaker. 5xx and timeouts are
       * Transient: the same request may well work in three hundred
       * milliseconds. Collapsing the two is how a system retries a rejection
       * forever and gives up on a blip.
       */
      if (response.statusCode() >= 400 && response.statusCode() < 500) {
        throw new IntegrationException.Refused(
            "comms", "HTTP_" + response.statusCode(), "The SMS gateway refused that message.");
      }
      if (response.statusCode() >= 500) {
        throw new IntegrationException.Transient(
            "comms", "The SMS gateway returned " + response.statusCode(), null);
      }

      var parsed = json.readValue(response.body(), Map.class);
      return new Comms.Accepted(
          String.valueOf(parsed.getOrDefault("messageId", parsed.getOrDefault("id", "unknown"))),
          String.valueOf(parsed.getOrDefault("status", "accepted")));
    } catch (IntegrationException e) {
      throw e;
    } catch (java.io.InterruptedIOException e) {
      Thread.currentThread().interrupt();
      throw new IntegrationException.Transient("comms", "The SMS gateway did not answer in time.", e);
    } catch (Exception e) {
      throw new IntegrationException.Transient("comms", "Could not reach the SMS gateway.", e);
    }
  }

  @Bean
  Nimc httpNimc() {
    return (nin, fullName, dateOfBirth, subject) -> {
      throw notWritten(
          "nimc",
          "NIMC verification is JAX-WS SOAP over an IPsec tunnel, against a WSDL that is not public "
              + "and credentials issued per-integrator. Enrolment cannot verify an identity until "
              + "that client exists.");
    };
  }

  @Bean
  Payout httpPayout() {
    return new Payout() {
      @Override
      public String resolveAccountName(String bankCode, String accountNumber, String subject) {
        throw notWritten("payout", NIBSS_NOTE);
      }

      @Override
      public Transferred transfer(Account to, long amountMinor, String narration, String claimRef) {
        throw notWritten("payout", NIBSS_NOTE);
      }
    };
  }

  private static final String NIBSS_NOTE =
      "NIBSS requires an onboarded institution code and a signing certificate. This is the one "
          + "adapter where a plausible-looking wrong implementation moves money, so it is not "
          + "guessed at.";

  @Bean
  ReturnFiles httpReturnFiles() {
    return new ReturnFiles() {
      @Override
      public List<Remote> list(String sponsorRef) {
        throw notWritten("sftp", SFTP_NOTE);
      }

      @Override
      public byte[] fetch(String sponsorRef, String path) {
        throw notWritten("sftp", SFTP_NOTE);
      }
    };
  }

  private static final String SFTP_NOTE =
      "The payroll SFTP poller needs Apache MINA and per-sponsor host keys, and each MDA names its "
          + "files differently. Return files are uploaded through the console until it exists.";

  private static IntegrationException notWritten(String system, String why) {
    return new IntegrationException.Unavailable(
        system, "The %s adapter is not implemented. %s".formatted(system, why), null);
  }
}
