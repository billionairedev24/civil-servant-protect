package ng.csp.api.integration;

import java.time.LocalDate;

/**
 * NIMC, the National Identity Management Commission.
 *
 * <p>The register of record for who a Nigerian is. The spec reaches it as JAX-WS SOAP over an IPsec
 * tunnel — not a REST API, not a modern one, and not fast — and enrolment cannot complete without
 * it, because a scheme that pays a death benefit has to know it is paying the right family.
 *
 * <p>What comes back is deliberately narrow. NIMC will return a photograph, an address and a
 * parent's name; none of that belongs in this system, and an adapter that returns everything the
 * other side offers is how L3 data spreads. So: does the NIN exist, does the name match, does the
 * date of birth match. Nothing else crosses this boundary.
 */
public interface Nimc {

  /**
   * The answer to "is this person who they say they are".
   *
   * <p>{@code nameScore} rather than a boolean because Nigerian names do not compare exactly —
   * "ADAEZE N OKAFOR" on a payroll file and "Adaeze Nkiru Okafor" on the register are the same
   * person, and an adapter that answered false would have enrolment officers overriding it all day
   * until they stopped reading it. The threshold is a policy decision and lives with the caller.
   */
  record Verification(boolean found, int nameScore, boolean dobMatches, String reference) {}

  /**
   * Verify a NIN against a name and date of birth.
   *
   * <p>The NIN is passed in the clear because this is the one call that legitimately needs it — it
   * is what NIMC is being asked about. It does not reach the replay log: see Redacted.
   */
  Verification verify(String nin, String fullName, LocalDate dateOfBirth, String subject);
}
