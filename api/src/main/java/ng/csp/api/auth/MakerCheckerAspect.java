package ng.csp.api.auth;

import java.util.UUID;
import ng.csp.api.web.ApiException;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The maker–checker layer.
 *
 * <p>Runs in front of every method annotated {@link MakerChecker}, so the rule exists once. See that
 * annotation for why it is worth a layer of its own.
 */
@Aspect
@Component
public class MakerCheckerAspect {

  private final JdbcClient db;

  public MakerCheckerAspect(JdbcClient db) {
    this.db = db;
  }

  @Around("@annotation(rule)")
  public Object check(ProceedingJoinPoint call, MakerChecker rule) throws Throwable {
    var session = sessionArg(call);
    var subjectId = subjectArg(call);

    if (!session.role().can(rule.commits())) {
      throw ApiException.forbidden(
          // Naming the role that can do it turns a dead end into a next step:
          // "ask an approver" is actionable, "forbidden" is not.
          "A %s cannot commit this. %s needs an approver."
              .formatted(session.role().label().toLowerCase(), capitalise(rule.subject())));
    }

    if (rule.requiresProposal() && "exception".equals(rule.subject()) && subjectId != null) {
      var proposedBy =
          db.sql("SELECT proposed_by FROM reconciliation_exceptions WHERE id = :id")
              .param("id", subjectId)
              .query(UUID.class)
              .optional()
              .orElse(null);

      if (proposedBy == null) {
        throw ApiException.conflict(
            "no_proposal",
            "Nobody has proposed what to do with this exception yet. A preparer works it first.");
      }
      if (proposedBy.equals(session.userId())) {
        // The database refuses this too. Both, because the constraint is the
        // guarantee and this is the message a person can act on.
        throw ApiException.conflict(
            "maker_is_checker",
            "You proposed this. Someone else has to approve it — that is the whole point of the check.");
      }
    }

    return call.proceed();
  }

  private static SessionUser sessionArg(ProceedingJoinPoint call) {
    for (var arg : call.getArgs()) {
      if (arg instanceof SessionUser user) {
        return user;
      }
    }
    throw new IllegalStateException(
        "@MakerChecker on %s but it takes no SessionUser — the aspect cannot tell who is acting."
            .formatted(call.getSignature()));
  }

  /** The first UUID argument, which by convention is what is being committed. */
  private static UUID subjectArg(ProceedingJoinPoint call) {
    for (var arg : call.getArgs()) {
      if (arg instanceof UUID id) {
        return id;
      }
    }
    return null;
  }

  private static String capitalise(String value) {
    return value.substring(0, 1).toUpperCase() + value.substring(1);
  }
}
