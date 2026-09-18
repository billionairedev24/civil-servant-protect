-- The roll file: what a payroll sent, and what we decided about it.
--
-- V4 reserved `object_key` and `pgp_signature_key` on schedule_batches with a
-- comment saying the bytes never live in Postgres. Nothing has ever written to
-- either, so until now the answer to "show me what the Ministry of Education
-- sent in August and what you did with it" was a query against schedule_rows —
-- live, mutable, and only as good as whoever ran it. That is not evidence.
--
-- What is stored now is a rendered file, held in the same bucket as claim
-- evidence, with a detached OpenPGP signature beside it. Three columns here
-- describe it; the bytes stay where they belong.

ALTER TABLE schedule_batches
  -- Hex SHA-256 of the exact bytes stored. Cheap, and it means a mismatch can
  -- be spotted without fetching the object or holding the public key.
  ADD COLUMN roll_file_sha256 text,
  ADD COLUMN roll_file_bytes  bigint,
  ADD COLUMN signed_at        timestamptz,
  /*
   * Why there is no roll file, when there is no roll file.
   *
   * A load that succeeded and a roll file that failed is a real state: the
   * money is right and the evidence is missing. It must not fail the load —
   * the contributions are posted and rolling them back to punish a storage
   * outage would be worse than the problem. But it must not be silent either,
   * which is what it would be if this column did not exist and the two keys
   * were simply left null. Null here means "not attempted"; a message means
   * "attempted, and here is what went wrong", and the console can tell them
   * apart.
   */
  ADD COLUMN roll_file_error  text;

COMMENT ON COLUMN schedule_batches.roll_file_sha256 IS
  'SHA-256 of the stored object, hex. Over the bytes as written, not over a re-render.';

COMMENT ON COLUMN schedule_batches.object_key IS
  'The rendered roll file in object storage. Written once, never rewritten: a signature is over '
  'bytes, so regenerating the file to verify it would mean any later change to the format silently '
  'invalidated every historical signature.';
