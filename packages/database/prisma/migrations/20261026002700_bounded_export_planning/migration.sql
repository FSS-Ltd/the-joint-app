BEGIN;
-- A 500-record page must not compile the whole export union for every call.
-- Refreshed statistics on large ledgers can cross PostgreSQL's JIT threshold;
-- measured compilation alone exhausted the existing five-second transaction.
-- This function-local setting preserves global planner policy and all fences.
ALTER FUNCTION app.export_records(uuid,text) SET jit=off;
COMMIT;
