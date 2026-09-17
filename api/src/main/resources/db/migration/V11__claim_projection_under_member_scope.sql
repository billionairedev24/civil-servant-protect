-- A member could not open a claim.
--
-- Found by opening one over HTTP as a signed-in member, which is the only way
-- it could have been found: every existing test opens claims under the system
-- scope, where this policy is satisfied and the bug is invisible.
--
-- What happened: inserting a claim fires csp.project_claim(), which writes the
-- sponsor's redacted copy into sponsor_claim_view. That table's only policy is
-- keyed on the sponsor, and a policy with no WITH CHECK uses its USING
-- expression for writes too — so under a member scope, where
-- csp.current_sponsor() is null, the projection was refused and the whole
-- transaction rolled back. The trigger is SECURITY DEFINER, which does not
-- help: the table is FORCE ROW LEVEL SECURITY precisely so that policies still
-- apply to its owner, and the application connects as its owner.
--
-- The fix is to say what writes are legitimate rather than to weaken the read.
-- Reading is unchanged in substance: a sponsor sees its own rail, an assessor
-- sees every claim. A member may now also see and write the row about their own
-- claim, which tells them their own claim reference, type and state — things
-- they already read from `claims` — and no amount, because this table has never
-- carried one.

DROP POLICY IF EXISTS sponsor_claim_view_by_rail ON sponsor_claim_view;

CREATE POLICY sponsor_claim_view_by_rail ON sponsor_claim_view
  USING (
    csp.is_unscoped()
    OR csp.is_assessor()
    OR sponsor_id = csp.current_sponsor()
    -- The claimant, so the projection of their own claim can be written and
    -- then updated in place as the claim moves.
    OR member_id = csp.current_member()
  )
  WITH CHECK (
    csp.is_unscoped()
    OR csp.is_assessor()
    OR sponsor_id = csp.current_sponsor()
    /*
     * A member may only ever write a row about themselves, and only one whose
     * sponsor is really their sponsor — so a hand-written INSERT cannot put a
     * claim onto another employer's rail. The subquery is safe under this
     * scope: members_scope already lets a member read their own row.
     */
    OR (
      member_id = csp.current_member()
      AND sponsor_id = (SELECT sponsor_id FROM members WHERE id = member_id)
    )
  );
