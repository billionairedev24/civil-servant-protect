-- The test suite needs its own database, created once when the volume is first
-- initialised. Tests wipe their schema on every run, which would be a rude
-- thing to do to the database you are developing against.
CREATE DATABASE csp_test OWNER csp;
