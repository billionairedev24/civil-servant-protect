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

CREATE TYPE contribution_source AS ENUM ('payroll', 'direct_debit', 'card', 'transfer', 'reversal');
CREATE TYPE contribution_status AS ENUM ('expected', 'confirmed', 'failed', 'reversed');

CREATE TABLE contributions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         uuid        NOT NULL REFERENCES members(id),
  cycle_id          uuid        REFERENCES collection_cycles(id),
  period            date        NOT NULL,
  amount_minor      bigint      NOT NULL,
  source            contribution_source NOT NULL,
  status            contribution_status NOT NULL,
  rail_ref          text,
  -- A correction points at the row it corrects. The original stays exactly as
  -- it was written, so the member can see what we thought and when.
  reverses_id       uuid        REFERENCES contributions(id),
  received_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT period_is_first_of_month CHECK (date_trunc('month', period) = period),
  CONSTRAINT reversal_has_source CHECK ((source = 'reversal') = (reverses_id IS NOT NULL))
);

CREATE INDEX contributions_member_period_idx ON contributions (member_id, period DESC);
CREATE INDEX contributions_cycle_idx ON contributions (cycle_id);

/**
 * Append-only guard. UPDATE and DELETE are rejected outright.
 *
 * This is deliberately a trigger rather than a REVOKE: a REVOKE is silently
 * undone by anyone with the right grants, and the failure mode we care about is
 * a well-meaning migration, not an attacker.
 */
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only: % is not permitted. Write a correcting row instead.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER contributions_append_only
  BEFORE UPDATE OR DELETE ON contributions
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
