package ng.csp.api.integration;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The adapters, as stubs.
 *
 * <p>Active unless {@code csp.integrations.mode} says otherwise, which means a developer with
 * Postgres and Redis running has a working system: enrolment verifies, sign-in sends a code, a claim
 * pays out. None of it leaves the machine.
 *
 * <p>These are not mocks in the test sense. They go through the same replay log and the same circuit
 * breakers as the real ones, so the row in {@code integration_calls} after a stubbed payout looks
 * exactly like the row after a real one. That is the point: the thing being demonstrated is the
 * system's behaviour, and behaviour that only exists when NIBSS is reachable has not been
 * demonstrated at all.
 *
 * <p>They also refuse where the real systems refuse. A NIN of the wrong length is rejected here
 * because it would be rejected by NIMC, and an enrolment flow that only ever sees success is one
 * nobody has tested the failure path of.
 */
@Configuration
@ConditionalOnProperty(name = "csp.integrations.mode", havingValue = "stub", matchIfMissing = true)
public class StubIntegrations {

  private static final Logger log = LoggerFactory.getLogger(StubIntegrations.class);

  @Bean
  Comms stubComms(ReplayLog replay) {
    return new Comms() {
      @Override
      public Accepted sendOtp(String msisdn, String code, String subject) {
        // The code is not written down, here or anywhere: see Redacted. It is
        // in Redis for five minutes and that is the only copy.
        return replay.around(
            ReplayLog.Call.once("comms", "send_otp", subject, "otp:" + subject),
            Redacted.of("channel", "sms").msisdn("to", msisdn).withheld("code").build(),
            () -> {
              log.info("SMS (stub) to {}: your code is {}", Redacted.maskMsisdn(msisdn), code);
              return new Accepted("stub-" + UUID.randomUUID(), "accepted");
            });
      }

      @Override
      public Accepted notify(String msisdn, String template, Map<String, String> values, String subject) {
        return replay.around(
            ReplayLog.Call.once("comms", "notify", subject, "notify:%s:%s".formatted(template, subject)),
            Redacted.of("template", template).msisdn("to", msisdn).plain("values", values).build(),
            () -> {
              log.info("SMS (stub) to {}: [{}] {}", Redacted.maskMsisdn(msisdn), template, values);
              return new Accepted("stub-" + UUID.randomUUID(), "accepted");
            });
      }

      @Override
      public String ussdReply(String sessionId, String msisdn, String input) {
        log.info("USSD (stub) {} from {}: {}", sessionId, Redacted.maskMsisdn(msisdn), input);
        return "CON Civil Servant Protect\n1. My cover\n2. Last deduction\n3. Who gets paid";
      }
    };
  }

  @Bean
  Nimc stubNimc(ReplayLog replay) {
    return (nin, fullName, dateOfBirth, subject) ->
        replay.around(
            ReplayLog.Call.repeatable("nimc", "verify", subject),
            // The NIN is what the call is about and is still not recorded.
            Redacted.of("name", fullName).withheld("nin").plain("dob", String.valueOf(dateOfBirth)).build(),
            () -> {
              /*
               * NIMC rejects a malformed NIN outright, and so does this. An
               * enrolment path that has only ever been exercised against a
               * stub that says yes is a path whose failure branch is
               * theoretical.
               */
              if (nin == null || !nin.matches("\\d{11}")) {
                throw new IntegrationException.Refused(
                    "nimc", "INVALID_NIN", "That NIN is not an 11-digit number.");
              }
              // A NIN ending 0 stands in for "no such person", so the not-found
              // branch is reachable in a demo without inventing a second stub.
              if (nin.endsWith("0")) {
                return new Nimc.Verification(false, 0, false, "stub-" + UUID.randomUUID());
              }
              return new Nimc.Verification(true, 100, true, "stub-" + UUID.randomUUID());
            });
  }

  @Bean
  Payout stubPayout(ReplayLog replay) {
    return new Payout() {
      @Override
      public String resolveAccountName(String bankCode, String accountNumber, String subject) {
        return replay.around(
            ReplayLog.Call.repeatable("payout", "resolve_name", subject),
            Redacted.of("bank", bankCode).account("account", accountNumber).build(),
            () -> {
              if (accountNumber == null || !accountNumber.matches("\\d{10}")) {
                throw new IntegrationException.Refused(
                    "payout", "INVALID_ACCOUNT", "A NUBAN account number is ten digits.");
              }
              return "STUB ACCOUNT HOLDER";
            });
      }

      @Override
      public Transferred transfer(Account to, long amountMinor, String narration, String claimRef) {
        return replay.around(
            // The claim reference is the idempotency key, so a second
            // instruction for the same claim is refused by the index rather
            // than by anyone remembering to check.
            ReplayLog.Call.once("payout", "transfer", claimRef, "transfer:" + claimRef),
            Redacted.of("bank", to.bankCode())
                .account("account", to.accountNumber())
                .plain("amountMinor", amountMinor)
                .plain("narration", narration)
                .build(),
            () -> {
              log.info("NIBSS (stub): {} kobo to {} for {}", amountMinor, Redacted.lastFour(to.accountNumber()), claimRef);
              return new Transferred("stub-" + UUID.randomUUID(), "successful", amountMinor);
            });
      }
    };
  }

  @Bean
  ReturnFiles stubReturnFiles() {
    return new ReturnFiles() {
      @Override
      public List<Remote> list(String sponsorRef) {
        // Empty, which is what the endpoint looks like on twenty-nine days of
        // the month. The console's "file overdue" state is the common one.
        log.debug("SFTP (stub): nothing waiting for {}", sponsorRef);
        return List.of();
      }

      @Override
      public byte[] fetch(String sponsorRef, String path) {
        throw new IntegrationException.Refused("sftp", "NO_SUCH_FILE", "No file at " + path);
      }
    };
  }

  /** Marker so the startup log says plainly that nothing is really being called. */
  @Bean
  Object stubIntegrationsNotice() {
    log.warn(
        "Integrations are stubbed (csp.integrations.mode=stub). No SMS is sent, no NIN is "
            + "verified against NIMC, and no money moves. Set it to 'http' with the endpoints "
            + "configured to change that.");
    return new Object();
  }
}
