/*
 * Facts a sponsor may have, from rows a sponsor may not read.
 *
 * Row-level security answers "may you see this row", and that is the right
 * question almost everywhere here. It is the wrong question twice:
 *
 *   - A sponsor may not see who a member has nominated. They must still know
 *     *whether* a member has nominated anybody, because chasing the ones who
 *     have not is their job.
 *   - A sponsor may not read a claim. They must still know one exists on their
 *     member, because the insurer asks them one question about it: was this
 *     person in service on that date.
 *
 * Without something here, both facts are invisible — and invisible in the worst
 * way, because a subquery under RLS does not fail, it returns nothing.
 * `NOT EXISTS (SELECT 1 FROM beneficiaries ...)` evaluated by a sponsor was true
 * for every member alive, so the dashboard reported that nobody on the payroll
 * had named anyone. It looked like a number.
 *
 * The first attempt at this used SECURITY DEFINER functions, on the usual
 * reasoning that a definer runs as the table owner and so sees past the policy.
 * It does not here: every one of these tables is FORCE ROW LEVEL SECURITY, and
 * FORCE means the owner is subject to the policy too — which is the point, since
 * an application connecting as the owner is the normal case and a model that
 * exempts the owner protects nothing. The functions returned nothing, silently,
 * which is the same failure they were written to fix.
 *
 * So: a projection rather than a peephole. Facts a sponsor may have live in
 * rows a sponsor may read, maintained by trigger from the rows they may not. A
 * projection cannot accidentally grow a sensitive column the way a query against
 * the real table can, its policy is an ordinary one, and what a sponsor is
 * allowed to know is legible as a table definition instead of being argued about
 * in a function body.
 */

/*
 * This migration reads existing rows, so it has to say who it is.
 *
 * Flyway runs through the application's own DataSource, which applies a
 * row-level scope at connection checkout — and with no scope set, that is
 * "nobody". The backfills below silently updated zero rows until this line
 * existed, which is precisely the failure mode this migration is about.
 *
 * SET LOCAL, so it lasts exactly as long as the migration's transaction.
 */
SET LOCAL csp.unscoped = 'on';

-- ── Has this member nominated anybody? ───────────────────────────────────────

/*
 * One bit, on a row the sponsor can already see.
 *
 * Not "who" — that stays member-only, and the asymmetry is deliberate: a
 * sponsor has no business knowing who a member leaves money to. But chasing the
 * members who have named nobody is the sponsor's job; it is on the dashboard
 * and it is a filter on the roster.
 *
 * `NOT EXISTS (SELECT ... FROM beneficiaries)` evaluated under a sponsor scope
 * was true for everybody alive, so the dashboard reported that not one person
 * on the payroll had nominated anyone. It looked like a number.
 */
ALTER TABLE members ADD COLUMN has_payee_beneficiary boolean NOT NULL DEFAULT false;

/*
 * A payee, not merely a name. Someone nominated at 0% is on the record and is
 * not who a claim pays — that gap is the entire reason the annual
 * re-confirmation screen exists, and it must not read as "nominated" here.
 */
CREATE OR REPLACE FUNCTION csp.refresh_payee_flag() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE target uuid;
BEGIN
  target := COALESCE(NEW.member_id, OLD.member_id);
  UPDATE members
     SET has_payee_beneficiary = EXISTS (
           SELECT 1 FROM beneficiaries b WHERE b.member_id = target AND b.share_pct > 0)
   WHERE id = target;
  RETURN NULL;
END; $$;

CREATE TRIGGER beneficiaries_refresh_payee_flag
  AFTER INSERT OR UPDATE OR DELETE ON beneficiaries
  FOR EACH ROW EXECUTE FUNCTION csp.refresh_payee_flag();

-- Backfill, unscoped by virtue of running as the migration.
UPDATE members m
   SET has_payee_beneficiary = EXISTS (
         SELECT 1 FROM beneficiaries b WHERE b.member_id = m.id AND b.share_pct > 0);

-- ── Claims, as an employer may see them ──────────────────────────────────────

/*
 * A deliberately thin copy of the few facts a sponsor is entitled to.
 *
 * No amount, no cause, no documents, no assessor, no payout account. The
 * insurer asks an employer exactly one question about a claim — was this person
 * in service on that date — and everything here exists to let them answer it and
 * to let an HR officer be kind to a family who walks into their office.
 *
 * A policy on `claims` itself was the obvious alternative and is worse: RLS is
 * row-level, so a policy loose enough to let a sponsor read the row lets them
 * read every column on it through any query that asks.
 */
CREATE TABLE sponsor_claim_view (
  claim_ref        text PRIMARY KEY,
  member_id        uuid        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  sponsor_id       uuid        NOT NULL REFERENCES sponsors (id) ON DELETE CASCADE,
  type             text        NOT NULL,
  state            text        NOT NULL,
  awaiting_sponsor boolean     NOT NULL DEFAULT false,
  /*
   * Whether it has been paid, and when — never how much. "₦18.4m went to the
   * families of your staff this year" is the figure that gets a scheme renewed
   * and discloses nothing about one household; the same figure on one row tells
   * an employer what their late colleague's family received.
   */
  paid_at          timestamptz,
  created_at       timestamptz NOT NULL
);

CREATE INDEX sponsor_claim_view_by_sponsor ON sponsor_claim_view (sponsor_id, created_at DESC);

ALTER TABLE sponsor_claim_view ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor_claim_view FORCE ROW LEVEL SECURITY;
CREATE POLICY sponsor_claim_view_by_rail ON sponsor_claim_view
  USING (csp.is_unscoped() OR csp.is_assessor() OR sponsor_id = csp.current_sponsor());

CREATE OR REPLACE FUNCTION csp.project_claim() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE owner uuid;
BEGIN
  SELECT sponsor_id INTO owner FROM members WHERE id = NEW.member_id;
  IF owner IS NULL THEN
    -- A self-paying member has no sponsor. There is no employer to tell.
    RETURN NULL;
  END IF;

  INSERT INTO sponsor_claim_view
    (claim_ref, member_id, sponsor_id, type, state, awaiting_sponsor, paid_at, created_at)
  VALUES (NEW.claim_ref, NEW.member_id, owner, NEW.type::text, NEW.state::text,
          NEW.state = 'documents_pending', NEW.paid_at, NEW.created_at)
  ON CONFLICT (claim_ref) DO UPDATE
    SET state = EXCLUDED.state,
        awaiting_sponsor = EXCLUDED.awaiting_sponsor,
        paid_at = EXCLUDED.paid_at;
  RETURN NULL;
END; $$;

CREATE TRIGGER claims_project
  AFTER INSERT OR UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION csp.project_claim();

INSERT INTO sponsor_claim_view
  (claim_ref, member_id, sponsor_id, type, state, awaiting_sponsor, paid_at, created_at)
SELECT c.claim_ref, c.member_id, m.sponsor_id, c.type::text, c.state::text,
       c.state = 'documents_pending', c.paid_at, c.created_at
  FROM claims c JOIN members m ON m.id = c.member_id
 WHERE m.sponsor_id IS NOT NULL
ON CONFLICT (claim_ref) DO NOTHING;

/*
 * What this sponsor's families were paid this year, as one number.
 *
 * The only place a sponsor's view touches an amount, and it is an aggregate by
 * construction — a scalar sum cannot be read back as a per-claim figure. It is
 * a SECURITY DEFINER function with the scope toggled for the length of one
 * statement and restored immediately, because the amount lives on `claims`,
 * which is closed to a sponsor and stays closed.
 */
CREATE OR REPLACE FUNCTION csp.sponsor_claims_paid(p_sponsor uuid)
RETURNS TABLE (paid_count integer, paid_minor bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE previous text;
BEGIN
  -- Asking about somebody else's sponsor answers zero, whatever the argument.
  IF NOT (csp.is_unscoped() OR p_sponsor = csp.current_sponsor()) THEN
    RETURN QUERY SELECT 0, 0::bigint;
    RETURN;
  END IF;

  previous := COALESCE(current_setting('csp.unscoped', true), 'off');
  PERFORM set_config('csp.unscoped', 'on', true);

  BEGIN
    RETURN QUERY
      SELECT count(*)::int, COALESCE(sum(c.amount_minor), 0)::bigint
        FROM claims c JOIN members m ON m.id = c.member_id
       WHERE m.sponsor_id = p_sponsor
         AND c.state = 'paid'
         AND c.paid_at >= date_trunc('year', now());
  EXCEPTION WHEN OTHERS THEN
    -- Restore before re-raising. A failure that left the transaction unscoped
    -- would hand the caller every rail's data for the rest of their request.
    PERFORM set_config('csp.unscoped', previous, true);
    RAISE;
  END;

  PERFORM set_config('csp.unscoped', previous, true);
END; $$;
