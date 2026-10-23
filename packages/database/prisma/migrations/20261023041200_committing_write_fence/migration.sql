BEGIN;
-- Live leases may inspect terminal states for idempotent bookkeeping, but may
-- stage source rows and initial revisions only during an active commit.
CREATE OR REPLACE FUNCTION app.import_write_scope()
RETURNS TABLE(household_id uuid, account_id uuid, batch_id uuid, membership_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT c."householdId", c."accountId", c."batchId", c."membershipId"
 FROM app.import_job_context(nullif(current_setting('joint.job_id', true), '')::uuid,
   nullif(current_setting('joint.job_lease_token', true), '')::uuid) c
 JOIN app."Job" j ON j.id = c."jobId" AND j.type = 'csv.commit'
 JOIN app."ImportBatch" b ON b.id = c."batchId" AND b."householdId" = c."householdId" AND b."accountId" = c."accountId" AND b.state = 'COMMITTING'
 WHERE app.import_job_valid(c."batchId")
$$;
COMMIT;
