-- Beneficiaries, dependants, and claims.
--
-- Two rules from the spec are enforced here rather than in the client:
--   shares must total exactly 100, and a claim's stage list is the audit log
--   itself rather than a summary of one.

CREATE TABLE beneficiaries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         uuid        NOT NULL REFERENCES members(id),
  full_name         text        NOT NULL,
  relation          text        NOT NULL,
  msisdn            text,
  -- L3, same rule as the member's: HMAC under the HSM key for matching, the
  -- value itself encrypted for the rare path that must re-transmit it.
  nin_hmac          bytea,
  nin_ciphertext    bytea,
  -- A person can be named and hold nothing. That gap is the entire reason the
  -- annual re-confirmation exists, so 0 is valid and is not the same as absent.
  share_pct         smallint    NOT NULL CHECK (share_pct BETWEEN 0 AND 100),
  -- A minor needs a named adult who receives on their behalf.
  trustee_id        uuid        REFERENCES beneficiaries(id),
  evidence          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  position          smallint    NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, position)
);

-- Every change to the set, kept forever. The member can read this; the sponsor
-- cannot — who someone leaves their money to is not their employer's business.
CREATE TABLE beneficiary_events (
  id                bigserial PRIMARY KEY,
  member_id         uuid        NOT NULL REFERENCES members(id),
  actor_user_id     uuid        REFERENCES users(id),
  action            text        NOT NULL,
  before            jsonb,
  after             jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX beneficiary_events_member_idx ON beneficiary_events (member_id, created_at DESC);

CREATE TRIGGER beneficiary_events_append_only
  BEFORE UPDATE OR DELETE ON beneficiary_events
  FOR EACH ROW EXECUTE FUNCTION csp.reject_mutation();

/**
 * Shares must total exactly 100 across a member's set.
 *
 * A DEFERRED CONSTRAINT trigger, so the check runs at COMMIT rather than after
 * each statement. That is precisely the rule: a set being replaced is allowed to
 * pass through 60% on its way to 100%, and is only wrong if it is still wrong
 * when the transaction ends. A statement-level trigger cannot express that — it
 * rejects the first INSERT of a three-person set, which is how an application
 * that inserts people one at a time discovers this the hard way.
 *
 * A member with no beneficiaries at all is allowed: that is a new enrolment, not
 * a broken split.
 */
CREATE OR REPLACE FUNCTION csp.check_beneficiary_shares() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  total  int;
BEGIN
  target := COALESCE(NEW.member_id, OLD.member_id);
  SELECT COALESCE(SUM(share_pct), 0) INTO total
    FROM beneficiaries WHERE member_id = target;

  IF total NOT IN (0, 100) THEN
    -- Built with format() rather than RAISE's own placeholders: RAISE parses
    -- '%%%' greedily as a literal percent followed by a placeholder, which
    -- renders "%90" instead of "90%".
    RAISE EXCEPTION '%',
      format('Beneficiary shares for this member total %s%%, not 100%%.', total)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

-- CONSTRAINT triggers are always AFTER and FOR EACH ROW. Firing once per row is
-- redundant but harmless: each firing recomputes the same total, and by commit
-- time every row is in place.
CREATE CONSTRAINT TRIGGER beneficiary_shares_balance
  AFTER INSERT OR UPDATE OR DELETE ON beneficiaries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION csp.check_beneficiary_shares();

CREATE TABLE dependants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         uuid        NOT NULL REFERENCES members(id),
  full_name         text        NOT NULL,
  relation          text        NOT NULL,
  date_of_birth     date        NOT NULL,
  sum_assured_minor bigint      NOT NULL,
  -- Quoted by the server for the age band. The client never multiplies.
  premium_minor     bigint      NOT NULL,
  active            boolean     NOT NULL DEFAULT true,
  evidence          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE claim_type AS ENUM ('death', 'accident', 'disability', 'funeral_advance');
CREATE TYPE claim_state AS ENUM ('submitted', 'documents_pending', 'assessing', 'approved', 'paid', 'declined');

CREATE TABLE claims (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CLM-2026-0091. What a member reads out over USSD, so it is short and typed.
  claim_ref         text        NOT NULL UNIQUE
                                CHECK (claim_ref ~ '^CLM-[0-9]{4}-[0-9]{4}$'),
  member_id         uuid        NOT NULL REFERENCES members(id),
  type              claim_type  NOT NULL,
  state             claim_state NOT NULL DEFAULT 'submitted',
  claimant_relation text,
  claimant_user_id  uuid        REFERENCES users(id),
  answers           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  amount_minor      bigint,
  assessor_user_id  uuid        REFERENCES users(id),
  -- A funeral advance opens automatically beside a death claim.
  parent_claim_id   uuid        REFERENCES claims(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX claims_member_idx ON claims (member_id, created_at DESC);

-- The stages ARE the audit log. Append-only, time-stamped, and the same list
-- the USSD line reads back.
CREATE TABLE claim_stages (
  id                bigserial PRIMARY KEY,
  claim_id          uuid        NOT NULL REFERENCES claims(id),
  stage_key         text        NOT NULL,
  state             text        NOT NULL,
  actor             text,
  note              text,
  occurred_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX claim_stages_claim_idx ON claim_stages (claim_id, occurred_at);

CREATE TRIGGER claim_stages_append_only
  BEFORE UPDATE OR DELETE ON claim_stages
  FOR EACH ROW EXECUTE FUNCTION csp.reject_mutation();

CREATE TABLE claim_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id          uuid        NOT NULL REFERENCES claims(id),
  doc_key           text        NOT NULL,
  state             text        NOT NULL DEFAULT 'required',
  filename          text,
  content_type      text,
  byte_size         integer,
  storage_key       text,
  uploaded_at       timestamptz,
  UNIQUE (claim_id, doc_key)
);
