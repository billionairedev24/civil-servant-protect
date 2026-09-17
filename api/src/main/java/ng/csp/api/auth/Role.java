package ng.csp.api.auth;

import java.util.List;
import java.util.Set;

/**
 * Who may do what.
 *
 * <p>Roles are not a settings screen with checkboxes — they are the separation of duties the whole
 * console depends on. A preparer assembles a schedule and proposes how an exception should be
 * resolved; an approver is the one who commits it. Collapsing those into "can edit" is how ₦2,500 a
 * month from eight thousand people goes missing without anyone being accountable.
 */
public enum Role {
  MEMBER("Member", Permission.MEMBER_SET),
  /**
   * A next of kin sees the cover and the claim they are named in, and can open a claim — which is
   * the point, because the member may have died. They can never change who gets paid.
   */
  /**
   * A relative claiming on somebody who has died.
   *
   * <p>Deliberately without {@link Permission#MEMBER_READ}. It was here, and it let a kin session
   * call {@code /v1/members/me/summary} — which answered 200 with the member's cover, premium,
   * grade and employer. The row-level scope was not the thing at fault: it is row-level, so opening
   * the member's row so a relative can check they have the right person opens every column any
   * endpoint chooses to return. The permission is the right fence for that, and
   * {@code /v1/claims/subject} gives them the name and the CSP-ID, which is all they need to be
   * sure.
   */
  NEXT_OF_KIN("Next of kin", Set.of(Permission.CLAIM_CREATE, Permission.CLAIM_READ_OWN)),

  /** Sees every number an approver sees and can change none of them. */
  SPONSOR_VIEWER("Viewer", Set.of(Permission.SPONSOR_READ)),
  /**
   * Does the month's work and proposes decisions. Cannot commit one — {@link
   * Permission#EXCEPTION_RESOLVE} and {@link Permission#CYCLE_CLOSE} are deliberately absent.
   */
  SPONSOR_PREPARER("Preparer", Permission.PREPARER_SET),
  SPONSOR_APPROVER("Approver", Permission.APPROVER_SET),
  /**
   * Runs the roster and the roles. Notably not a superset: giving the person who grants permissions
   * the power to also approve money is how one account quietly becomes both halves of a two-person
   * rule.
   */
  SPONSOR_ADMIN("Admin", Permission.ADMIN_SET),

  ASSESSOR("Claims assessor", Set.of(Permission.CLAIM_READ_ANY, Permission.CLAIM_ASSESS)),
  /**
   * Runs the scheme. Pays approved claims and cannot assess one — the assessor decides, operations
   * sends, and neither can do the other's half.
   */
  CSP_ADMIN(
      "CSP operations",
      Set.of(
          Permission.SPONSOR_READ,
          Permission.CLAIM_READ_ANY,
          Permission.CLAIM_PAY,
          Permission.MEMBERS_MANAGE,
          Permission.ROLES_MANAGE));

  private final String label;
  private final Set<Permission> permissions;

  Role(String label, Set<Permission> permissions) {
    this.label = label;
    this.permissions = permissions;
  }

  public String label() {
    return label;
  }

  public Set<Permission> permissions() {
    return permissions;
  }

  public boolean can(Permission permission) {
    return permissions.contains(permission);
  }

  /** Sponsor-side roles are scoped to one sponsor and never to a member record. */
  public boolean isSponsorSide() {
    return name().startsWith("SPONSOR_");
  }

  public boolean isMemberSide() {
    return this == MEMBER || this == NEXT_OF_KIN;
  }

  /** Lower-case wire form, matching the {@code user_role} enum in the database. */
  public String wire() {
    return name().toLowerCase();
  }

  public static Role fromWire(String value) {
    return Role.valueOf(value.toUpperCase());
  }

  /** Spring Security authorities: one per permission, so rules read as capabilities. */
  public List<String> authorities() {
    return permissions.stream().map(Permission::authority).toList();
  }
}
