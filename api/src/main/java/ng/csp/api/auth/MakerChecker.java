package ng.csp.api.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks an operation that one person proposes and a different person commits.
 *
 * <p>The build spec asks for maker–checker in one aspect layer, and that is worth insisting on: the
 * control is only as good as its least careful implementation, and a rule re-typed into fifteen
 * handlers is fifteen chances to type it wrong. Here it is one annotation, one aspect, and a
 * database constraint underneath that refuses a row where the checker is the maker.
 *
 * <p>The aspect enforces three things:
 *
 * <ol>
 *   <li>the caller holds the committing permission, not merely the proposing one;
 *   <li>a proposal exists to commit — an approver cannot skip the maker and act alone;
 *   <li>the caller is not the person who proposed it.
 * </ol>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface MakerChecker {

  /** The permission a committer must hold, e.g. {@code EXCEPTION_RESOLVE}. */
  Permission commits();

  /**
   * What is being committed, for the audit entry and the error message: "exception", "cycle".
   */
  String subject();

  /**
   * Whether an unproposed subject may be committed directly.
   *
   * <p>Closing a cycle is a checker-only act — there is no separate proposal, the month's work is
   * the proposal — so it sets this false. Resolving an exception does not.
   */
  boolean requiresProposal() default true;
}
