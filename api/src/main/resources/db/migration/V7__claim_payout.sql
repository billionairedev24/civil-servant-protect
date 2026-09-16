/*
 * Where a claim's money actually goes.
 *
 * Until now a claim could be approved and never paid: the record held a
 * decision and an amount and no account, so the last step of the product — the
 * one the whole scheme exists for — had nowhere to happen. A family is not
 * helped by an approval.
 *
 * The account is deliberately on the claim and not on the member. The person
 * being paid is usually not the member: it is whoever they named, and which of
 * them, and in what share, is decided when the claim is assessed. Copying an
 * account from the member record would pay a dead person's account.
 */

ALTER TABLE claims
  ADD COLUMN payout_bank_code       text,
  ADD COLUMN payout_account_number  text,
  /*
   * The name NIBSS returned for that account, not the one the claimant typed.
   *
   * This is the check that catches a transposed digit before ₦5,000,000 reaches
   * a stranger, so it must be the bank's answer. Storing what was typed would
   * record the mistake as if it were verification.
   */
  ADD COLUMN payout_account_name    text,
  /* NIBSS's reference. A bank will accept it as proof a transfer was instructed,
     which makes it the answer to "where is our money". */
  ADD COLUMN payout_session_id      text,
  ADD COLUMN paid_at                timestamptz,
  ADD COLUMN paid_by                uuid REFERENCES users (id);

/*
 * Approving and paying are two decisions by two people.
 *
 * The assessor decides the claim is good; operations sends the money. Same
 * shape as the reconciliation exceptions' checker_is_not_maker, and for the
 * same reason — one account that can both approve a payout and make it is one
 * account that can pay itself.
 */
ALTER TABLE claims
  ADD CONSTRAINT payer_is_not_assessor
    CHECK (paid_by IS NULL OR assessor_user_id IS NULL OR paid_by <> assessor_user_id);

/* Nothing is paid that was not approved, and nothing is paid twice. */
ALTER TABLE claims
  ADD CONSTRAINT paid_claims_are_complete
    CHECK (
      paid_at IS NULL
      OR (payout_session_id IS NOT NULL AND payout_account_number IS NOT NULL AND amount_minor IS NOT NULL)
    );

CREATE UNIQUE INDEX claims_paid_once ON claims (id) WHERE paid_at IS NOT NULL;
