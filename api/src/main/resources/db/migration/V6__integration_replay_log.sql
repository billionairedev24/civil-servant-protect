/*
 * The replay log.
 *
 * Every call this service makes to an external system — NIMC, the SMS gateway,
 * NIBSS, a payroll SFTP endpoint — is written here before it is attempted and
 * updated with what came back. The build spec asks for it by name, and the
 * reason is that none of these systems can be asked "did you get my message?".
 *
 * NIMC answers over an IPsec tunnel that drops. The SMS gateway accepts a
 * message and delivers it an hour later, or not at all. NIBSS will happily
 * take the same payout instruction twice. When one of them times out, the only
 * question that matters is whether the thing happened, and the only way to
 * answer it is to have written down that we tried — before we tried.
 *
 * So this is not a metrics table. It is the record a human uses to decide
 * whether to send the money again.
 */

CREATE TYPE integration_system AS ENUM ('nimc', 'comms', 'payout', 'sftp');

CREATE TYPE integration_state AS ENUM (
  -- Written before the call goes out. A row stuck here is the dangerous one:
  -- the request may or may not have reached the other side.
  'attempting',
  'succeeded',
  -- The other side answered, and said no. Replaying will say no again.
  'refused',
  -- No answer, or a broken one. This is what a replay is for.
  'failed'
);

CREATE TABLE integration_calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system          integration_system NOT NULL,
  operation       text        NOT NULL,

  /*
   * What this call is about, in our terms — a claim reference, a CSP-ID, a
   * cycle id. Not the external system's id, which we may never learn.
   */
  subject         text        NOT NULL,

  /*
   * The caller's own idea of "this exact call".
   *
   * Two payout instructions for the same claim are the same instruction; two
   * OTPs for the same phone number are not. The adapter decides, and a unique
   * index makes the decision binding rather than advisory.
   */
  idempotency_key text        NOT NULL,

  state           integration_state NOT NULL DEFAULT 'attempting',
  attempt         integer     NOT NULL DEFAULT 1,

  /*
   * Request and response, with L3 data already removed by the adapter — see
   * Redacted.java. A NIN must not be here any more than it is anywhere else,
   * and a replay log is exactly the table someone exports to a spreadsheet.
   */
  request         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  response        jsonb,
  error           text,

  /* What the circuit breaker was doing when this went out. */
  breaker_state   text,

  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  duration_ms     integer
);

CREATE UNIQUE INDEX integration_calls_idem
  ON integration_calls (system, idempotency_key);

/* The two questions asked of this table: what is stuck, and what did we send
   about this claim. */
CREATE INDEX integration_calls_unfinished
  ON integration_calls (system, started_at)
  WHERE state IN ('attempting', 'failed');

CREATE INDEX integration_calls_subject ON integration_calls (subject, started_at DESC);

/*
 * Not append-only, unlike the audit log — a row is written before the call and
 * completed after it, so it has to be updatable. What it may not do is go
 * backwards: a call that succeeded cannot later be recorded as never having
 * happened, which is the edit that would matter.
 */
CREATE OR REPLACE FUNCTION csp.integration_call_forward_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state <> 'attempting' AND NEW.state <> OLD.state THEN
    RAISE EXCEPTION 'An integration call that is already %s cannot be re-stated as %s',
      OLD.state, NEW.state USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.started_at <> OLD.started_at OR NEW.idempotency_key <> OLD.idempotency_key THEN
    RAISE EXCEPTION 'An integration call cannot be re-addressed after the fact'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER integration_calls_forward_only
  BEFORE UPDATE ON integration_calls
  FOR EACH ROW EXECUTE FUNCTION csp.integration_call_forward_only();

CREATE TRIGGER integration_calls_no_delete
  BEFORE DELETE ON integration_calls
  FOR EACH ROW EXECUTE FUNCTION csp.reject_mutation();

/*
 * Visible to unscoped roles only.
 *
 * A sponsor's finance officer has no business reading what we sent NIMC about
 * a member of another MDA, and the subject column carries CSP-IDs across every
 * rail. Operations and the assessor side see it; a sponsor does not.
 */
ALTER TABLE integration_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_calls FORCE ROW LEVEL SECURITY;

CREATE POLICY integration_calls_unscoped_only ON integration_calls
  USING (csp.is_unscoped())
  WITH CHECK (csp.is_unscoped());
