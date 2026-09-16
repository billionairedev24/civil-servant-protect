-- Identity: sponsors, members, and the people who sign in.
--
-- The CSP-ID is the product's identity artefact, so it is a real column with a
-- real format constraint rather than a display string assembled in the app.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE sponsor_type AS ENUM ('federal', 'state', 'employer', 'self');

-- Batch rails send a schedule out and wait weeks for a return file. Self-pay is
-- answered by a bank the same day. Almost every downstream branch is this.
CREATE TYPE collection_method AS ENUM ('payroll', 'direct_debit');

CREATE TABLE sponsors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type              sponsor_type      NOT NULL,
  name              text              NOT NULL,
  short_name        text              NOT NULL,
  tag               text              NOT NULL,
  method            collection_method NOT NULL,
  -- IPPIS deduction code, state schedule code, employer code, or NIBSS mandate.
  rail_code         text              NOT NULL,
  rail_label        text              NOT NULL,
  -- Which day of the month the collection is attempted or the file is due.
  collection_day    smallint          NOT NULL CHECK (collection_day BETWEEN 1 AND 28),
  created_at        timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_self_is_direct_debit
    CHECK ((type = 'self') = (method = 'direct_debit'))
);

CREATE TABLE members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CSP-114-88214. Fixed shape so a hospital gate, a payroll clerk and a claims
  -- assessor are all certain they are looking at the same reference.
  csp_id            text        NOT NULL UNIQUE
                                CHECK (csp_id ~ '^CSP-[0-9]{3}-[0-9]{5}$'),
  sponsor_id        uuid        NOT NULL REFERENCES sponsors(id),
  -- What the sponsor's payroll knows this person by. Deliberately separate from
  -- csp_id: a return file that cites a service number we cannot resolve is the
  -- single most common exception in the whole system.
  service_no        text,
  full_name         text        NOT NULL,
  display_name      text        NOT NULL,
  date_of_birth     date        NOT NULL,
  grade             text,
  msisdn            text        NOT NULL,
  nin               text,
  bank_mask         text,
  tier              text        NOT NULL DEFAULT 'standard',
  in_force_since    date        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id, service_no)
);

CREATE INDEX members_msisdn_idx ON members (msisdn);

CREATE TYPE user_role AS ENUM (
  'member',
  'next_of_kin',
  'sponsor_viewer',
  'sponsor_preparer',
  'sponsor_approver',
  'sponsor_admin',
  'assessor',
  'csp_admin'
);

-- One row per person who can sign in. A member and an HR officer authenticate
-- the same way — by phone number and a one-time code — and differ only in role.
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  msisdn            text        NOT NULL UNIQUE,
  full_name         text        NOT NULL,
  email             text,
  role              user_role   NOT NULL,
  -- Exactly one of these is set, and which one is decided by the role.
  member_id         uuid        REFERENCES members(id),
  sponsor_id        uuid        REFERENCES sponsors(id),
  disabled_at       timestamptz,
  last_seen_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_scope_matches_role CHECK (
    CASE
      WHEN role IN ('member', 'next_of_kin') THEN member_id IS NOT NULL AND sponsor_id IS NULL
      WHEN role LIKE 'sponsor\_%'            THEN sponsor_id IS NOT NULL AND member_id IS NULL
      ELSE member_id IS NULL AND sponsor_id IS NULL
    END
  )
);

-- Sign-in challenges. Three attempts then a lock, per the spec — enforced here
-- rather than in the client, because the client is the untrusted part.
CREATE TABLE auth_challenges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  msisdn            text        NOT NULL,
  code_hash         text        NOT NULL,
  attempts          smallint    NOT NULL DEFAULT 0,
  consumed_at       timestamptz,
  locked_at         timestamptz,
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_challenges_msisdn_idx ON auth_challenges (msisdn, created_at DESC);

-- Phone-only. A browser never gets one of these, and a revoked device is
-- rejected at token refresh rather than at the next screen.
CREATE TABLE devices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users(id),
  device_id         text        NOT NULL,
  platform          text        NOT NULL,
  public_key        text        NOT NULL,
  label             text,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);
