-- The assessor's queue returned nothing, for every claim in the scheme.
--
-- Found by calling GET /v1/claims with an assessor's token. The query reads
-- claims joined to members for the name and the CSP-ID; claims_scope lets an
-- assessor through and members_scope does not, so the join dropped every row
-- and the endpoint answered {"claims":[]} — a 200, an empty queue, and nothing
-- anywhere saying why. Every test of it runs under the system scope, where the
-- policy is satisfied and the bug cannot appear.
--
-- Not "an assessor may read the roster": an assessor may read somebody who has
-- a claim. That is the whole of their business with the members table, and it
-- keeps a scheme's entire staff list out of reach of a role that only ever
-- needs the few hundred people with an open claim. The subquery is visible
-- under this scope because claims_scope already admits an assessor.

DROP POLICY IF EXISTS members_scope ON members;

CREATE POLICY members_scope ON members
  USING (
    csp.is_unscoped()
    OR sponsor_id = csp.current_sponsor()
    OR id = csp.current_member()
    OR (
      csp.is_assessor()
      AND EXISTS (SELECT 1 FROM claims c WHERE c.member_id = members.id)
    )
  );
