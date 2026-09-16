package ng.csp.api.config;

import javax.sql.DataSource;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Configuration;

/**
 * Wraps the connection pool so every connection carries the caller's scope.
 *
 * <p>A {@link BeanPostProcessor} rather than a {@code @Bean} that takes a {@code DataSource}: the
 * latter would ask the context for the bean it is defining.
 */
@Configuration
public class DataSourceConfig implements BeanPostProcessor {

  @Override
  public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {
    if (bean instanceof DataSource dataSource && !(bean instanceof ScopedDataSource)) {
      return new ScopedDataSource(dataSource);
    }
    return bean;
  }
}
