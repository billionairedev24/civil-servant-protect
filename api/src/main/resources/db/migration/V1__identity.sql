-- Identity: sponsors, members, and the people who sign in.
--
-- Data classification (build spec, "Where each kind of data may live"):
--   members, beneficiaries, dependants   L3 — Nigeria only, NIN as HMAC +
--                                        encrypted column, RLS by rail
--   sponsors, benefit schedule           L2 — aggregates, no member identifiers
--
-- The CSP-ID is the product's identity artefact, so it is a real column with a
-- real format constraint rather than a display string assembled in the app.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS csp;

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
  /*
   * Defence nominal rolls are L4: separate encryption key per service, access by
   * Defence-cleared roles only, no export. Flagged on the sponsor so that every
   * query path can see it without joining, and so a future segmented tenancy has
   * an existing discriminator to split on.
   */
  classification    smallint          NOT NULL DEFAULT 3 CHECK (classification IN (3, 4)),
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
  -- csp_id: a return file citing a service number we cannot resolve is the
  -- single most common exception in the whole system.
  service_no        text,
  full_name         text        NOT NULL,
  display_name      text        NOT NULL,
  date_of_birth     date        NOT NULL,
  grade             text,
  msisdn            text        NOT NULL,
  /*
   * NIN is never stored in the clear.
   *
   *   nin_hmac       HMAC-SHA256 under a key that lives in the HSM. Deterministic,
   *                  so it can be looked up and deduplicated, and unique — one NIN
   *                  is one member. Reversing it needs the HSM, which never leaves
   *                  Nigeria.
   *   nin_ciphertext the value itself, encrypted, for the rare path that must show
   *                  or re-transmit it (a NIMC verification call). Reading it is
   *                  audited; the lookup path never touches it.
   *
   * Two columns rather than one because the two jobs have different risk: we
   * match on the NIN constantly and decrypt it almost never.
   */
  nin_hmac          bytea       UNIQUE,
  nin_ciphertext    bytea,
  bank_mask         text,
  tier              text        NOT NULL DEFAULT 'standard',
  in_force_since    date        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id, service_no)
);

CREATE INDEX members_msisdn_idx ON members (msisdn);
CREATE INDEX members_sponsor_idx ON members (sponsor_id);

/*
 * The eight roles, as realm roles in Keycloak and as an enum here.
 *
 * Console roles are authenticated by Keycloak (OIDC + TOTP); members and next of
 * kin are authenticated by the custom SMS-OTP path, because a civil servant on a
 * Tecno in a village has no business being handed an OIDC login page. Both end up
 * in this table so that one audit trail names everyone.
 */
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

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Members sign in by phone; console users by Keycloak. Exactly one is set.
  msisdn            text        UNIQUE,
  -- Keycloak's `sub`. The join between a realm account and our audit trail.
  oidc_subject      text        UNIQUE,
  full_name         text        NOT NULL,
  email             text,
  role              user_role   NOT NULL,
  -- Exactly one of these is set, decided by the role.
  member_id         uuid        REFERENCES members(id),
  sponsor_id        uuid        REFERENCES sponsors(id),
  disabled_at       timestamptz,
  last_seen_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_scope_matches_role CHECK (
    CASE
      WHEN role IN ('member', 'next_of_kin') THEN member_id IS NOT NULL AND sponsor_id IS NULL
      WHEN role::text LIKE 'sponsor\_%'      THEN sponsor_id IS NOT NULL AND member_id IS NULL
      ELSE member_id IS NULL AND sponsor_id IS NULL
    END
  ),
  -- A member authenticates by phone, a console user by Keycloak. An account with
  -- neither cannot sign in at all, which is a seeding bug worth catching here.
  CONSTRAINT user_has_a_way_in CHECK (msisdn IS NOT NULL OR oidc_subject IS NOT NULL)
);

-- Phone only. A browser never gets one of these, and a revoked device is
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

/*
 * Row-level security by rail.
 *
 * The application connects as a non-owning role and sets `csp.sponsor_id` for
 * the transaction. Every sponsor-scoped read is then filtered by Postgres rather
 * than by a WHERE clause someone can forget — an approver at one ministry cannot
 * read another's roster even through a handler with a missing check.
 *
 * FORCE is what makes this real: without it the table owner bypasses its own
 * policies, which is exactly the connection an app usually runs as.
 */
CREATE OR REPLACE FUNCTION csp.current_sponsor() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('csp.sponsor_id', true), '')::uuid
$$;

/** True when the caller is unscoped — migrations, batch workers, CSP operations. */
CREATE OR REPLACE FUNCTION csp.is_unscoped() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('csp.unscoped', true), 'off') = 'on'
$$;

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE members FORCE ROW LEVEL SECURITY;

CREATE POLICY members_by_rail ON members
  USING (csp.is_unscoped() OR sponsor_id = csp.current_sponsor());
