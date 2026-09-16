package ng.csp.api.auth;

import java.util.Set;

/** A capability a role either has or does not. Method security rules name these, never roles. */
public enum Permission {
  // Member side
  MEMBER_READ,
  MEMBER_WRITE_BENEFICIARIES,
  MEMBER_WRITE_DEPENDANTS,
  CLAIM_CREATE,
  CLAIM_READ_OWN,

  // Sponsor side
  SPONSOR_READ,
  SCHEDULE_UPLOAD,
  EXCEPTION_PROPOSE,
  EXCEPTION_RESOLVE,
  CYCLE_CLOSE,
  MEMBERS_MANAGE,
  ROLES_MANAGE,

  // Insurer side
  CLAIM_READ_ANY,
  CLAIM_ASSESS,
  /**
   * Sending an approved claim's money.
   *
   * Separate from {@link #CLAIM_ASSESS} on purpose. The assessor decides a claim is good;
   * operations makes the payment. One account holding both can approve a payout and then make it,
   * which is the two-person rule with one person in it — and the DB says the same thing with
   * {@code payer_is_not_assessor}.
   */
  CLAIM_PAY;

  /**
   * The authority string carried in the token and checked by {@code @PreAuthorize}. Prefixed so it
   * can never be confused with a Spring {@code ROLE_} authority.
   */
  public String authority() {
    return "PERM_" + name();
  }

  static final Set<Permission> MEMBER_SET =
      Set.of(MEMBER_READ, MEMBER_WRITE_BENEFICIARIES, MEMBER_WRITE_DEPENDANTS, CLAIM_CREATE, CLAIM_READ_OWN);

  static final Set<Permission> PREPARER_SET = Set.of(SPONSOR_READ, SCHEDULE_UPLOAD, EXCEPTION_PROPOSE);

  static final Set<Permission> APPROVER_SET =
      Set.of(SPONSOR_READ, SCHEDULE_UPLOAD, EXCEPTION_PROPOSE, EXCEPTION_RESOLVE, CYCLE_CLOSE);

  static final Set<Permission> ADMIN_SET =
      Set.of(SPONSOR_READ, SCHEDULE_UPLOAD, EXCEPTION_PROPOSE, MEMBERS_MANAGE, ROLES_MANAGE);
}
