/*
 * The application's database role, and the two databases it owns.
 *
 * Run once, by the Postgres entrypoint locally and by a step in CI, so both get
 * the same thing — because the difference between them was a five-test failure
 * nobody could reproduce.
 *
 * ── Why the application does not connect as the superuser ────────────────────
 *
 * A superuser bypasses row-level security. Not "is allowed past it by a policy"
 * — the policies are not consulted at all, and `rolbypassrls` does the same.
 * Every protection in this schema then evaporates silently: no error, no
 * warning, just a sponsor query that returns every other MDA's members.
 *
 * The CI job set POSTGRES_USER to `csp`, which in the postgres image is the
 * *bootstrap superuser*. The separation-of-duties tests — the ones asserting
 * that one employer cannot see another's people — failed there and passed on
 * every laptop, because a laptop happened to have `csp` as an ordinary role.
 * The failure was the honest half: had they passed, they would have been
 * proving nothing, on the one property this system most needs to be true.
 *
 * So: `postgres` bootstraps, and `csp` is an ordinary LOGIN role that owns its
 * databases and is subject to every policy it writes. SeparationOfDutiesTest
 * asserts exactly that, first, so a role with the wrong attributes says so in
 * one sentence instead of five confusing failures.
 */

CREATE ROLE csp LOGIN PASSWORD 'csp';

CREATE DATABASE csp OWNER csp;

/*
 * The test suite needs its own database. Tests wipe their schema on every run,
 * which would be a rude thing to do to the database you are developing against.
 */
CREATE DATABASE csp_test OWNER csp;
