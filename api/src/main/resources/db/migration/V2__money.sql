-- Money: the contribution ledger and the collection cycles that feed it.
--
-- Everything here is in minor units (kobo) as bigint. No floats touch money.
--
-- The ledger is append-only and that is enforced by a trigger, not by a code
-- review. "A correction is a new row with a reversal reference, never an edit"
-- is the product's central promise; a promise the database can break on a bad
-- afternoon is not a promise.

CREATE TYPE cycle_state AS ENUM ('draft', 'sent', 'awaiting_return', 'reconciling', 'closed');

-- One collection attempt for one sponsor for one period. On a payroll rail this
-- is a schedule out and a file back; on self-pay it is a batch of mandates.
CREATE TABLE collection_cycles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id        uuid        NOT NULL REFERENCES sponsors(id),
  -- First day of the month being collected for. A period is a month, always.
  period            date        NOT NULL,
  state             cycle_state NOT NULL DEFAULT 'draft',
  rail_ref          text,
  scheduled_count   integer     NOT NULL DEFAULT 0,
  scheduled_minor   bigint      NOT NULL DEFAULT 0,
  sent_at           timestamptz,
  returned_at       timestamptz,
  closed_at         timestamptz,
  closed_by         uuid        REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id, period),
  CONSTRAINT period_is_first_of_month CHECK (date_trunc('month', period) = period)
);

ALTER TABLE collection_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_cycles FORCE ROW LEVEL SECURITY;
CREATE POLICY cycles_by_rail ON collection_cycles
  USING (csp.is_unscoped() OR sponsor_id = csp.current_sponsor());

CREATE TYPE contribution_source AS ENUM ('payroll', 'direct_debit', 'card', 'transfer', 'reversal');
CREATE TYPE contribution_status AS ENUM ('expected', 'confirmed', 'failed', 'reversed');

/*
 * Partitioned by period, which is the cycle boundary.
 *
 * The build spec says "partitioned by cycle". A cycle is one sponsor for one
 * month, so partitioning literally per cycle_id would mean one partition per
 * sponsor per month — with a thousand MDAs that is twelve thousand partitions a
 * year, and Postgres planning degrades badly past a few thousand. Monthly range
 * partitioning puts every sponsor's cycle for a month in one partition: the same
 * pruning for the queries that matter (a member's ledger, a cycle's rows, a
 * month's totals) and a partition count that stays sane for the seven-year audit
 * retention.
 *
 * At ~3m roll rows a month that is ~36m rows a year, ~250m at seven years, in
 * 84 partitions. Detaching a month for archival is one statement.
 */
CREATE TABLE contributions (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  member_id         uuid        NOT NULL REFERENCES members(id),
  cycle_id          uuid        REFERENCES collection_cycles(id),
  period            date        NOT NULL,
  amount_minor      bigint      NOT NULL,
  source            contribution_source NOT NULL,
  status            contribution_status NOT NULL,
  rail_ref          text,
  -- A correction points at the row it corrects. The original stays exactly as
  -- it was written, so the member can see what we thought and when.
  reverses_id       uuid,
  received_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- The partition key has to be in the primary key.
  PRIMARY KEY (id, period),
  CONSTRAINT period_is_first_of_month CHECK (date_trunc('month', period) = period),
  CONSTRAINT reversal_has_source CHECK ((source = 'reversal') = (reverses_id IS NOT NULL))
) PARTITION BY RANGE (period);

CREATE INDEX contributions_member_period_idx ON contributions (member_id, period DESC);
CREATE INDEX contributions_cycle_idx ON contributions (cycle_id);

ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions FORCE ROW LEVEL SECURITY;
CREATE POLICY contributions_by_rail ON contributions
  USING (
    csp.is_unscoped()
    OR member_id IN (SELECT id FROM members WHERE sponsor_id = csp.current_sponsor())
  );

/**
 * Create the partition for a month if it is not there yet.
 *
 * Called by the load pipeline before a cycle opens and by a scheduled job a
 * month ahead. Idempotent, so running it twice is free and forgetting to run it
 * is the only failure mode — which the DEFAULT partition below catches rather
 * than rejecting a roll file at 2am.
 */
CREATE OR REPLACE FUNCTION csp.ensure_contribution_partition(p date) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  start_at date := date_trunc('month', p)::date;
  end_at   date := (date_trunc('month', p) + interval '1 month')::date;
  name     text := format('contributions_%s', to_char(start_at, 'YYYY_MM'));
BEGIN
  IF to_regclass(format('public.%I', name)) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF contributions FOR VALUES FROM (%L) TO (%L)',
      name, start_at, end_at);
  END IF;
  RETURN name;
END;
$$;

/*
 * Anything outside a created partition lands here rather than failing the
 * insert. A roll file arriving for an unexpected month is a problem for the
 * morning, not a reason to drop eight thousand deductions on the floor.
 */
CREATE TABLE contributions_unpartitioned PARTITION OF contributions DEFAULT;

-- The twelve months around today, so a fresh database works immediately.
DO $$
DECLARE
  m date := (date_trunc('month', now()) - interval '13 months')::date;
BEGIN
  WHILE m <= (date_trunc('month', now()) + interval '2 months')::date LOOP
    PERFORM csp.ensure_contribution_partition(m);
    m := (m + interval '1 month')::date;
  END LOOP;
END;
$$;

/**
 * Append-only guard. UPDATE and DELETE are rejected outright.
 *
 * Deliberately a trigger rather than a REVOKE: a REVOKE is silently undone by
 * anyone with the right grants, and the failure mode we care about is a
 * well-meaning migration, not an attacker.
 */
CREATE OR REPLACE FUNCTION csp.reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only: % is not permitted. Write a correcting row instead.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- On the partitioned parent; Postgres propagates row triggers to every
-- partition, including ones created later.
CREATE TRIGGER contributions_append_only
  BEFORE UPDATE OR DELETE ON contributions
  FOR EACH ROW EXECUTE FUNCTION csp.reject_mutation();
