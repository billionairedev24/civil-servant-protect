package ng.csp.api.config;

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

  public ProductionSafetyCheck(CspProperties props) {
    this.props = props;
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
  }
}
