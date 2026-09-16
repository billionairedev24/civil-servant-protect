-- Reconciliation: the schedules that go out, the files that come back, and the
-- rows that did not match.
--
-- This is the console's reason to exist. The exception kinds differ by rail — a
-- payroll file mismatches, a bank refuses — and the resolution is a decision by
-- a named person that is kept forever.

CREATE TABLE schedule_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id          uuid        NOT NULL REFERENCES collection_cycles(id),
  direction         text        NOT NULL CHECK (direction IN ('outbound', 'return')),
  filename          text,
  -- Where the file itself sits in S3-compatible storage, with its PGP
  -- signature. The bytes never live in Postgres.
  object_key        text,
  pgp_signature_key text,
  row_count         integer     NOT NULL DEFAULT 0,
  parsed_count      integer     NOT NULL DEFAULT 0,
  rejected          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by       uuid        REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Payroll rails mismatch against a file; self-pay gets a bank response code.
-- The UI branches on the sponsor's rail, never on its name.
CREATE TYPE exception_kind AS ENUM (
  'unmatched',
  'no_deduction',
  'wrong_amount',
  'left_service',
  'no_funds',
  'mandate_revoked',
  'card_expired'
);

CREATE TYPE exception_action AS ENUM ('match', 'waive', 'chase', 'remove');

CREATE TABLE reconciliation_exceptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id          uuid        NOT NULL REFERENCES collection_cycles(id),
  -- Null when the file cites someone we cannot resolve. That is the whole point
  -- of the 'unmatched' kind: real money, from a real person, unassignable.
  member_id         uuid        REFERENCES members(id),
  kind              exception_kind NOT NULL,
  -- Exactly as the file or the bank wrote it, never cleaned up. The mismatch
  -- between this and our record is the evidence.
  name_as_written   text,
  service_no_as_written text,
  rail_response     text,
  expected_minor    bigint      NOT NULL DEFAULT 0,
  received_minor    bigint      NOT NULL DEFAULT 0,

  /*
   * Maker–checker. Proposing and committing are separate columns because they
   * are separate people: a preparer says what they think should happen, an
   * approver decides. Collapsing them loses the only evidence that two people
   * were involved.
   */
  proposed_action   exception_action,
  proposed_note     text,
  proposed_by       uuid        REFERENCES users(id),
  proposed_at       timestamptz,

  resolved_action   exception_action,
  resolved_note     text,
  resolved_by       uuid        REFERENCES users(id),
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- A resolution is a decision someone is accountable for, so it is never
  -- recorded without both the person and their reason.
  CONSTRAINT resolution_is_attributable CHECK (
    (resolved_action IS NULL)
    OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL AND resolved_note IS NOT NULL)
  ),
  CONSTRAINT proposal_is_attributable CHECK (
    (proposed_action IS NULL)
    OR (proposed_by IS NOT NULL AND proposed_at IS NOT NULL)
  ),
  -- The checker cannot be the maker. This is the whole control; without it one
  -- account is both halves of the two-person rule.
  CONSTRAINT checker_is_not_maker CHECK (
    resolved_by IS NULL OR proposed_by IS NULL OR resolved_by <> proposed_by
  )
);

CREATE INDEX reconciliation_exceptions_cycle_idx
  ON reconciliation_exceptions (cycle_id, kind);

ALTER TABLE reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_exceptions FORCE ROW LEVEL SECURITY;
CREATE POLICY exceptions_by_rail ON reconciliation_exceptions
  USING (
    csp.is_unscoped()
    OR cycle_id IN (SELECT id FROM collection_cycles WHERE sponsor_id = csp.current_sponsor())
  );

-- Unresolved exceptions block the cycle. Asked constantly, so it is a view.
CREATE VIEW cycle_exception_summary AS
SELECT
  cycle_id,
  sum(n)                                          AS total,
  sum(n) FILTER (WHERE open_n > 0)                AS kinds_open,
  sum(open_n)                                     AS open,
  jsonb_object_agg(kind, n)                       AS by_kind
FROM (
  SELECT cycle_id, kind, count(*) AS n,
         count(*) FILTER (WHERE resolved_action IS NULL) AS open_n
  FROM reconciliation_exceptions
  GROUP BY cycle_id, kind
) per_kind
GROUP BY cycle_id;

/*
 * The audit trail, with a hash chain.
 *
 * Append-only stops a row being edited. The chain stops the stronger attack: a
 * row being *removed* and the rest still looking consistent. Each entry hashes
 * its own content together with the previous entry's hash, so deleting or
 * reordering anything breaks every hash after it, and the break is detectable
 * without having kept a copy.
 *
 * `csp.verify_audit_chain()` re-walks it. Run it on a schedule and before any
 * export that someone is going to rely on.
 */
CREATE TABLE audit_log (
  id                bigserial PRIMARY KEY,
  actor_user_id     uuid        REFERENCES users(id),
  actor_role        user_role,
  sponsor_id        uuid        REFERENCES sponsors(id),
  action            text        NOT NULL,
  subject_type      text,
  subject_id        text,
  detail            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  prev_hash         bytea,
  row_hash          bytea       NOT NULL
);

CREATE INDEX audit_log_sponsor_idx ON audit_log (sponsor_id, created_at DESC);

/** The bytes a row's hash is taken over. One definition, used to write and to verify. */
CREATE OR REPLACE FUNCTION csp.audit_payload(
  p_id bigint, p_actor uuid, p_role user_role, p_sponsor uuid, p_action text,
  p_subject_type text, p_subject_id text, p_detail jsonb, p_at timestamptz, p_prev bytea
) RETURNS bytea
LANGUAGE sql IMMUTABLE AS $$
  SELECT convert_to(
    concat_ws('|',
      p_id, coalesce(p_actor::text, ''), coalesce(p_role::text, ''),
      coalesce(p_sponsor::text, ''), p_action, coalesce(p_subject_type, ''),
      coalesce(p_subject_id, ''), p_detail::text,
      to_char(p_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      coalesce(encode(p_prev, 'hex'), '')
    ), 'UTF8')
$$;

CREATE OR REPLACE FUNCTION csp.audit_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  last_hash bytea;
BEGIN
  -- Serialise appenders so two concurrent writes cannot claim the same
  -- predecessor and fork the chain.
  PERFORM pg_advisory_xact_lock(hashtext('csp.audit_log'));
  SELECT row_hash INTO last_hash FROM audit_log ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.row_hash := digest(
    csp.audit_payload(NEW.id, NEW.actor_user_id, NEW.actor_role, NEW.sponsor_id,
                      NEW.action, NEW.subject_type, NEW.subject_id, NEW.detail,
                      NEW.created_at, last_hash),
    'sha256');
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_log_chain
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION csp.audit_chain();

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION csp.reject_mutation();

/**
 * Re-walk the chain. Returns the first id where it breaks, or no rows when the
 * trail is intact end to end.
 */
CREATE OR REPLACE FUNCTION csp.verify_audit_chain()
RETURNS TABLE (broken_at bigint, reason text)
LANGUAGE plpgsql AS $$
DECLARE
  r         record;
  expected  bytea := NULL;
BEGIN
  FOR r IN SELECT * FROM audit_log ORDER BY id LOOP
    IF r.prev_hash IS DISTINCT FROM expected THEN
      broken_at := r.id;
      reason := 'prev_hash does not match the previous row';
      RETURN NEXT;
      RETURN;
    END IF;
    IF r.row_hash <> digest(
         csp.audit_payload(r.id, r.actor_user_id, r.actor_role, r.sponsor_id,
                           r.action, r.subject_type, r.subject_id, r.detail,
                           r.created_at, r.prev_hash), 'sha256') THEN
      broken_at := r.id;
      reason := 'row_hash does not match the row contents';
      RETURN NEXT;
      RETURN;
    END IF;
    expected := r.row_hash;
  END LOOP;
END;
$$;
