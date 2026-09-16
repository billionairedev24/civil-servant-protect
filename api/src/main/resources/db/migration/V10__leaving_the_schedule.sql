/*
 * Somebody comes off the payroll.
 *
 * The distinction this table has to hold is the one every sponsor gets wrong:
 * coming off the schedule stops the deduction, it does not cancel the cover. A
 * member who retires on the 30th is covered on the 1st, and the scheme owes
 * their family the same money it owed them a week earlier. What changes is who
 * collects the contribution and how long they have to arrange it.
 *
 * So there is no "removed" flag. There is the date they left the payroll, why,
 * and the date the grace period ends — because that last one is what somebody
 * will be asked about at a claim, and a boolean cannot answer it.
 */

SET LOCAL csp.unscoped = 'on';

/*
 * Why they left, and nothing about what it costs them.
 *
 * Deliberately not including 'deceased'. A death is a claim — it is the event
 * this whole scheme exists for — and recording it here as a reason for leaving
 * the payroll would let an officer close the record of somebody whose family is
 * owed five million naira, in a screen with no assessor anywhere near it.
 */
CREATE TYPE leave_reason AS ENUM (
  'retired',
  'transferred',
  'resigned',
  'dismissed'
);

ALTER TABLE members
  ADD COLUMN left_payroll_on date,
  ADD COLUMN leave_reason    leave_reason,
  /*
   * Cover continues to here whatever happens next.
   *
   * Sixty days from the last day on the payroll, which is time to set up a
   * direct debit and be dealt with by somebody if it fails. A member who is
   * mid-claim when their employment ends is covered for the claim, and the
   * grace date is the evidence of that rather than an argument about it.
   */
  ADD COLUMN grace_until     date,
  ADD CONSTRAINT members_leaving_is_all_or_nothing
    CHECK (num_nonnulls(left_payroll_on, leave_reason, grace_until) IN (0, 3));

/*
 * Partial, because it is asked only about leavers and they are the small
 * minority — "who is in grace this month, and has any of them set up a
 * mandate" is the question the collections desk runs weekly.
 */
CREATE INDEX members_in_grace_idx ON members (grace_until)
  WHERE left_payroll_on IS NOT NULL;
