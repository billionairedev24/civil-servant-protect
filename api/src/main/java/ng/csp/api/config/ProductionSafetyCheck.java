package ng.csp.api.config;

import ng.csp.api.crypto.KeyVault;
import ng.csp.api.crypto.Pkcs11KeyVault;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * A development convenience that would be a credential leak in production.
 *
 * <p>Refusing to start is deliberate. A warning in a log nobody reads is how {@code otp.echo} ends
 * up live, and an endpoint that hands out sign-in codes gives away every account to anyone who knows
 * a phone number.
 */
@Component
@Profile("prod")
public class ProductionSafetyCheck implements InitializingBean {

  private final CspProperties props;
  private final KeyVault keys;

  public ProductionSafetyCheck(CspProperties props, KeyVault keys) {
    this.props = props;
    this.keys = keys;
  }

  @Override
  public void afterPropertiesSet() {
    if (props.otp().isRelaxed()) {
      throw new IllegalStateException(
          """
          Refusing to start: csp.otp.echo / csp.otp.fixed-code are set under the prod profile.
          They return or pin the sign-in code, which hands every account to anyone who knows a \
          phone number. Unset both, or do not run with --spring.profiles.active=prod.""");
    }

    if (props.integrations().isStubbed()) {
      throw new IllegalStateException(
          """
          Refusing to start: csp.integrations.mode is 'stub' under the prod profile.
          Stubbed adapters answer locally — no SMS is sent, no NIN is checked against NIMC and no \
          payout reaches NIBSS — while every screen reports success. A scheme that silently stops \
          telling its members anything is worse than one that is plainly down. Set \
          INTEGRATIONS_MODE=http and configure the endpoints.""");
    }

    if (!(keys instanceof Pkcs11KeyVault)) {
      throw new IllegalStateException(
          """
          Refusing to start: the NIN keys are derived from csp.jwt-secret under the prod profile.
          The build spec puts L3 key material in an in-country HSM, and a derived key lives in the \
          same environment variable as the token secret — one leak is both. Set \
          csp.crypto.hsm.enabled=true with the PKCS#11 config and PIN.

          Note that HS256 member tokens cannot be signed inside an HSM; move them to ES256 at the \
          same time. See KeyVault#signingSecret.""");
    }
  }
}
