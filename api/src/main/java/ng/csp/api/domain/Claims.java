package ng.csp.api.domain;

import java.util.List;
import java.util.Map;

/** Claim vocabulary that the client must not hard-code. */
public final class Claims {

  private Claims() {}

  /**
   * The documents a claim type requires.
   *
   * <p>Server-side on purpose: the spec is explicit that the client must not hard-code the list,
   * because it changes with the underwriter's wording version and a stale app would ask a grieving
   * family for the wrong papers.
   */
  public static final Map<String, List<String>> REQUIRED_DOCS =
      Map.of(
          "death", List.of("death_certificate", "claimant_id", "member_id_card", "burial_permit"),
          "accident", List.of("medical_report", "claimant_id", "police_report"),
          "disability", List.of("medical_report", "claimant_id", "specialist_assessment"),
          "funeral_advance", List.of("death_certificate", "claimant_id"));

  public static List<String> requiredDocs(String type) {
    return REQUIRED_DOCS.getOrDefault(type, List.of());
  }
}
