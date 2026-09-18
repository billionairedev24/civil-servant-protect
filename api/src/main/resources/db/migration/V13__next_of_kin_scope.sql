-- A next of kin can see the claim, and nothing else about the member.
--
-- The role has existed since V1 with CLAIM_CREATE on it, and no way to obtain
-- the session. So a death claim could only be opened by the member it is about,
-- which is the one person who certainly cannot: they are dead. The family's
-- actual route today is a phone call to the claims office.
--
-- Giving them the member scope would have been the easy answer and the wrong
-- one. `csp.current_member()` unlocks the contribution ledger, the cover, the
-- dependants and — worst — the other beneficiaries and their shares. A widow
-- learning at the worst moment of her life what percentage her husband left to
-- somebody else is a disclosure this scheme has no business making, and it is
-- not undone by an apology. So a kin session gets its own scope, and it reaches
-- exactly three things: the claim, its stages, its documents.

CREATE OR REPLACE FUNCTION csp.current_kin_member() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('csp.kin_member_id', true), '')::uuid
$$;

/*
 * The member's own row, so a relative can be sure of the person.
 *
 * Note what this does *not* do: row-level security is row-level. Opening this
 * row opens every column on it to whatever endpoint chooses to return them —
 * which is how a kin session got the cover, the premium, the grade and the
 * employer back from /v1/members/me/summary while this file claimed it was
 * handing over a name. The fence for that is the permission set, and
 * NEXT_OF_KIN no longer holds MEMBER_READ; `/v1/claims/subject` returns the
 * name and the CSP-ID and nothing else.
 */
DROP POLICY IF EXISTS members_scope ON members;
CREATE POLICY members_scope ON members
  USING (
    csp.is_unscoped()
    OR sponsor_id = csp.current_sponsor()
    OR id = csp.current_member()
    OR id = csp.current_kin_member()
    OR (
      csp.is_assessor()
      AND EXISTS (SELECT 1 FROM claims c WHERE c.member_id = members.id)
    )
  );

DROP POLICY IF EXISTS claims_scope ON claims;
CREATE POLICY claims_scope ON claims
  USING (
    csp.is_unscoped()
    OR csp.is_assessor()
    OR member_id = csp.current_member()
    OR member_id = csp.current_kin_member()
  );

DROP POLICY IF EXISTS claim_stages_scope ON claim_stages;
CREATE POLICY claim_stages_scope ON claim_stages
  USING (
    csp.is_unscoped() OR csp.is_assessor()
    OR claim_id IN (
      SELECT id FROM claims
       WHERE member_id = csp.current_member() OR member_id = csp.current_kin_member()
    )
  );

DROP POLICY IF EXISTS claim_documents_scope ON claim_documents;
CREATE POLICY claim_documents_scope ON claim_documents
  USING (
    csp.is_unscoped() OR csp.is_assessor()
    OR claim_id IN (
      SELECT id FROM claims
       WHERE member_id = csp.current_member() OR member_id = csp.current_kin_member()
    )
  );

/*
 * The sponsor's projection, which a claim insert triggers.
 *
 * The read clause has to admit the kin as well, and that is not a nicety —
 * `csp.project_claim()` writes with `ON CONFLICT (claim_ref) DO UPDATE`, and
 * Postgres requires a row reachable by that statement to satisfy the SELECT
 * policy, because the statement may have to read and update an existing one. A
 * WITH CHECK that permits the insert is therefore not enough on its own: with
 * the read closed, the whole claim rolled back with "new row violates
 * row-level security policy" and nothing pointing at the upsert.
 *
 * What it opens is small and is the same thing V11 opened for a member: the row
 * about their own claim — its reference, type and state, and no amount, because
 * this table has never carried one. It is not the employer's list; the sponsor
 * clause above is still the only thing that reaches that.
 */
DROP POLICY IF EXISTS sponsor_claim_view_by_rail ON sponsor_claim_view;
CREATE POLICY sponsor_claim_view_by_rail ON sponsor_claim_view
  USING (
    csp.is_unscoped()
    OR csp.is_assessor()
    OR sponsor_id = csp.current_sponsor()
    OR member_id = csp.current_member()
    OR member_id = csp.current_kin_member()
  )
  WITH CHECK (
    csp.is_unscoped()
    OR csp.is_assessor()
    OR sponsor_id = csp.current_sponsor()
    OR (
      (member_id = csp.current_member() OR member_id = csp.current_kin_member())
      AND sponsor_id = (SELECT sponsor_id FROM members WHERE id = member_id)
    )
  );

/*
 * Nothing is added for beneficiaries, dependants or contributions, and that is
 * the point of this migration rather than an omission. Those policies name
 * `csp.current_member()` and a kin session does not have one, so they stay shut
 * — which is checked by a test that reads each of them as a relative and
 * expects nothing back.
 */
