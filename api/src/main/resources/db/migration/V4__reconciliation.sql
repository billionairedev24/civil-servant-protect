-- Reconciliation: the schedules that go out, the files that come back, and the
-- rows that did not match.
--
-- This is the console's reason to exist. The exception kinds differ by rail —
-- a payroll file mismatches, a bank refuses — and the resolution is a decision
-- by a named person that is kept forever.

CREATE TABLE schedule_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id          uuid        NOT NULL REFERENCES collection_cycles(id),
  direction         text        NOT NULL CHECK (direction IN ('outbound', 'return')),
  filename          text,
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
  -- Null when the file cites someone we cannot resolve. That is the whole
  -- point of the 'unmatched' kind: real money, from a real person, unassignable.
  member_id         uuid        REFERENCES members(id),
  kind              exception_kind NOT NULL,
  -- Exactly as the file or the bank wrote it, never cleaned up. The mismatch
  -- between this and our record is the evidence.
  name_as_written   text,
  service_no_as_written text,
  rail_response     text,
  expected_minor    bigint      NOT NULL DEFAULT 0,
  received_minor    bigint      NOT NULL DEFAULT 0,
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
  )
);

CREATE INDEX reconciliation_exceptions_cycle_idx
  ON reconciliation_exceptions (cycle_id, kind);

-- Unresolved exceptions block the cycle. Asked constantly, so it is a view.
CREATE VIEW cycle_exception_summary AS
SELECT
  cycle_id,
  count(*)                                        AS total,
  count(*) FILTER (WHERE resolved_action IS NULL) AS open,
  jsonb_object_agg(kind, n) FILTER (WHERE kind IS NOT NULL) AS by_kind
FROM (
  SELECT cycle_id, kind, count(*) AS n
  FROM reconciliation_exceptions
  GROUP BY cycle_id, kind
) per_kind
GROUP BY cycle_id;

-- Who did what, across the whole system. Separate from the claim and
-- beneficiary trails because this one is the sponsor's, and a finance officer
-- being able to show their working is what makes the console defensible.
CREATE TABLE audit_log (
  id                bigserial PRIMARY KEY,
  actor_user_id     uuid        REFERENCES users(id),
  actor_role        user_role,
  sponsor_id        uuid        REFERENCES sponsors(id),
  action            text        NOT NULL,
  subject_type      text,
  subject_id        text,
  detail            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_sponsor_idx ON audit_log (sponsor_id, created_at DESC);

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
