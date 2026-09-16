package ng.csp.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class CspApiApplication {

  public static void main(String[] args) {
    SpringApplication.run(CspApiApplication.class, args);
  }
}
