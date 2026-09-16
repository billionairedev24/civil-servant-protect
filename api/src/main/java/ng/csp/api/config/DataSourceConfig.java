package ng.csp.api.config;

import java.sql.SQLException;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.ConnectionHolder;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Wraps the connection pool so every connection carries the caller's scope.
 *
 * <p>A {@link BeanPostProcessor} rather than a {@code @Bean} that takes a {@code DataSource}: the
 * latter would ask the context for the bean it is defining.
 */
@Configuration
public class DataSourceConfig implements BeanPostProcessor {

  private static final Logger log = LoggerFactory.getLogger(DataSourceConfig.class);

  /** SQLSTATE 25P02, {@code in_failed_sql_transaction}: every statement refused until a rollback. */
  private static final String ABORTED_TRANSACTION = "25P02";

  @Override
  public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {
    if (bean instanceof DataSource dataSource && !(bean instanceof ScopedDataSource)) {
      var scoped = new ScopedDataSource(dataSource);

      /*
       * Let a scope change reach a connection that is already in use.
       *
       * Checkout is the normal path and covers a request from its first query
       * onwards. It does not cover a scope changed *during* a transaction —
       * which is what RlsScope.runUnscoped does, and which silently did nothing
       * until this existed. See the note on that method.
       */
      RlsScope.onScopeChange(
          scope -> {
            var holder = (ConnectionHolder) TransactionSynchronizationManager.getResource(scoped);
            if (holder == null) {
              // No transaction open, so the next checkout will carry the scope.
              return;
            }
            try {
              ScopedDataSource.write(holder.getConnection(), scope);
            } catch (IllegalStateException e) {
              // The holder exists but has released its connection. Nothing to
              // re-scope, and the next checkout will do it.
              log.trace("no connection bound to re-scope", e);
            } catch (SQLException e) {
              if (!ABORTED_TRANSACTION.equals(e.getSQLState())) {
                throw new IllegalStateException("Could not apply the row-level scope", e);
              }
              /*
               * The transaction has already failed, so Postgres is refusing
               * every statement until it is rolled back — including this one.
               *
               * Quiet because it is not the danger this guard is for: a
               * connection that will not run a query cannot run one under the
               * wrong scope, and the rollback that follows returns it to the
               * pool to be scoped afresh at the next checkout. Left loud, it
               * replaced whatever error aborted the transaction in the first
               * place, which is the error somebody actually needs to read.
               */
              log.trace("transaction already aborted, nothing to re-scope", e);
            } catch (Exception e) {
              // Loud, because the alternative is a query silently running under
              // the wrong scope — which is either an empty result or a leak.
              throw new IllegalStateException("Could not apply the row-level scope", e);
            }
          });

      log.debug("row-level scoping wrapped around {}", beanName);
      return scoped;
    }
    return bean;
  }
}
