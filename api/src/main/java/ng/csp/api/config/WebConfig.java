package ng.csp.api.config;

import java.util.List;
import ng.csp.api.auth.CurrentUser;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

  private final CurrentUser currentUser;

  public WebConfig(CurrentUser currentUser) {
    this.currentUser = currentUser;
  }

  @Override
  public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
    resolvers.add(currentUser);
  }
}
