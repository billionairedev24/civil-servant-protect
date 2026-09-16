package ng.csp.api.auth;

import java.util.UUID;
import ng.csp.api.web.ApiException;

/**
 * The caller.
 *
 * <p>{@code memberId} and {@code sponsorId} are mutually exclusive and which one is set follows from
 * the role. A sponsor-side role has no "me" — an HR officer reads a roster, never a personal
 * dashboard — and the accessors below make that explicit so a handler cannot forget.
 */
public record SessionUser(UUID userId, Role role, UUID memberId, UUID sponsorId, String deviceId) {

  /** The member this request may act as. */
  public UUID requireMemberId() {
    if (memberId == null) {
      throw ApiException.forbidden(
          "This is a member-scoped route; your session (%s) is not a member.".formatted(role.wire()));
    }
    return memberId;
  }

  public UUID requireSponsorId() {
    if (sponsorId == null) {
      throw ApiException.forbidden(
          "This is a sponsor-scoped route; your session (%s) has no sponsor.".formatted(role.wire()));
    }
    return sponsorId;
  }

  /**
   * A sponsor-side caller may only touch their own sponsor, whatever the URL says. Without this an
   * approver at one ministry could read another's reconciliation by editing the path.
   */
  public void assertSponsorScope(UUID requested) {
    if (role == Role.CSP_ADMIN) {
      return;
    }
    if (!requested.equals(sponsorId)) {
      throw ApiException.forbidden("That sponsor is not yours.");
    }
  }
}
