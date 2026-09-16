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
 * Shares must total exactly 100 across a member's set, checked once per
 * statement so a PUT that replaces the whole set is legal while it is in flight
 * and illegal if it settles wrong. A per-row check could never express this.
 *
 * A member with no beneficiaries at all is allowed — that is a new enrolment,
 * not a broken split.
 */
CREATE OR REPLACE FUNCTION csp.check_beneficiary_shares() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  touched uuid[];
  bad     record;
BEGIN
  -- A transition table exists only on the operation that declared it, so each
  -- branch may name only the one it has. Referencing the other is a runtime
  -- error, not a compile-time one, which is how it hides.
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT member_id) INTO touched FROM new_rows;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT member_id) INTO touched FROM old_rows;
  ELSE
    SELECT array_agg(DISTINCT member_id) INTO touched
      FROM (SELECT member_id FROM new_rows UNION SELECT member_id FROM old_rows) touched_rows;
  END IF;

  FOR bad IN
    SELECT member_id, SUM(share_pct) AS total
    FROM beneficiaries
    WHERE member_id = ANY (touched)
    GROUP BY member_id
    -- 0 is the empty set on its way somewhere; anything else that is not 100 is
    -- a split that does not add up.
    HAVING SUM(share_pct) NOT IN (0, 100)
  LOOP
    -- Built with format() rather than RAISE's own placeholders: RAISE parses
    -- '%%%' greedily as a literal percent followed by a placeholder, which
    -- renders "%90" instead of "90%".
    RAISE EXCEPTION '%',
      format('Beneficiary shares for this member total %s%%, not 100%%.', bad.total)
      USING ERRCODE = 'check_violation';
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER beneficiary_shares_insert
  AFTER INSERT ON beneficiaries
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION csp.check_beneficiary_shares();

CREATE TRIGGER beneficiary_shares_update
  AFTER UPDATE ON beneficiaries
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION csp.check_beneficiary_shares();

-- Without this, removing one of three people leaves 60% behind unchecked.
CREATE TRIGGER beneficiary_shares_delete
  AFTER DELETE ON beneficiaries
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION csp.check_beneficiary_shares();

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
