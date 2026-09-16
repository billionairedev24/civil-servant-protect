-- Row-level security, completed.
--
-- V1 and V2 added policies keyed on the sponsor. That is only half the picture:
-- a member reads their own record and is not sponsor-scoped, so with only a
-- sponsor policy every member-side query correctly returned nothing. The
-- application now declares who it is acting as on each connection (see
-- RlsScope), and the policies below say what each scope may see.
--
-- The important asymmetry is beneficiaries and dependants: a member may read
-- them, a sponsor may not. Who someone leaves their money to is not their
-- employer's business, and that is a rule the database should hold rather than
-- a WHERE clause somebody remembers to write.

CREATE OR REPLACE FUNCTION csp.current_member() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('csp.member_id', true), '')::uuid
$$;

-- A member reads their own row; a sponsor reads its roster.
DROP POLICY IF EXISTS members_by_rail ON members;
CREATE POLICY members_scope ON members
  USING (
    csp.is_unscoped()
    OR sponsor_id = csp.current_sponsor()
    OR id = csp.current_member()
  );

DROP POLICY IF EXISTS contributions_by_rail ON contributions;
CREATE POLICY contributions_scope ON contributions
  USING (
    csp.is_unscoped()
    OR member_id = csp.current_member()
    OR member_id IN (SELECT id FROM members WHERE sponsor_id = csp.current_sponsor())
  );

-- Members only. A sponsor has no business here at all.
ALTER TABLE beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE beneficiaries FORCE ROW LEVEL SECURITY;
CREATE POLICY beneficiaries_member_only ON beneficiaries
  USING (csp.is_unscoped() OR member_id = csp.current_member());

ALTER TABLE beneficiary_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE beneficiary_events FORCE ROW LEVEL SECURITY;
CREATE POLICY beneficiary_events_member_only ON beneficiary_events
  USING (csp.is_unscoped() OR member_id = csp.current_member());

ALTER TABLE dependants ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependants FORCE ROW LEVEL SECURITY;
CREATE POLICY dependants_member_only ON dependants
  USING (csp.is_unscoped() OR member_id = csp.current_member());

/*
 * Claims are read by the member they are about and by an assessor, who works
 * for the insurer and sees every claim. An assessor is not sponsor-scoped, so
 * they get their own flag rather than being squeezed into the sponsor one.
 */
CREATE OR REPLACE FUNCTION csp.is_assessor() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('csp.assessor', true), 'off') = 'on'
$$;

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims FORCE ROW LEVEL SECURITY;
CREATE POLICY claims_scope ON claims
  USING (csp.is_unscoped() OR csp.is_assessor() OR member_id = csp.current_member());

ALTER TABLE claim_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_stages FORCE ROW LEVEL SECURITY;
CREATE POLICY claim_stages_scope ON claim_stages
  USING (
    csp.is_unscoped() OR csp.is_assessor()
    OR claim_id IN (SELECT id FROM claims WHERE member_id = csp.current_member())
  );

ALTER TABLE claim_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY claim_documents_scope ON claim_documents
  USING (
    csp.is_unscoped() OR csp.is_assessor()
    OR claim_id IN (SELECT id FROM claims WHERE member_id = csp.current_member())
  );

-- Sponsor-side tables the officer's own scope already covers.
ALTER TABLE schedule_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY schedule_batches_by_rail ON schedule_batches
  USING (
    csp.is_unscoped()
    OR cycle_id IN (SELECT id FROM collection_cycles WHERE sponsor_id = csp.current_sponsor())
  );

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_log_by_rail ON audit_log
  USING (csp.is_unscoped() OR sponsor_id = csp.current_sponsor());

/*
 * Signing in has to work before a scope exists — the row that says which member
 * you are is the one being looked up. So `users` is readable when unscoped and
 * otherwise only your own row and, for an admin, your sponsor's staff.
 */
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_scope ON users
  USING (
    csp.is_unscoped()
    OR member_id = csp.current_member()
    OR sponsor_id = csp.current_sponsor()
  );
