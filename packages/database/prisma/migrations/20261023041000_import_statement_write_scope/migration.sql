BEGIN;
-- Batched inserts validate the actual live committing lease once per statement,
-- rather than repeating requester/ownership/session joins for every inserted row.
CREATE FUNCTION app.import_write_scope()
RETURNS TABLE(household_id uuid, account_id uuid, batch_id uuid, membership_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT c."householdId", c."accountId", c."batchId", c."membershipId"
 FROM app.import_job_context(nullif(current_setting('joint.job_id', true), '')::uuid,
   nullif(current_setting('joint.job_lease_token', true), '')::uuid) c
 JOIN app."Job" j ON j.id = c."jobId" AND j.type = 'csv.commit'
 WHERE app.import_job_valid(c."batchId")
$$;
CREATE FUNCTION app.import_revision_transactions() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 WITH allowed AS MATERIALIZED (SELECT * FROM app.import_write_scope())
 SELECT t.id FROM allowed c JOIN app."Transaction" t
   ON t."householdId" = c.household_id AND t."accountId" = c.account_id AND t."originImportBatchId" = c.batch_id
 WHERE t."sourceNamespace" = 'CSV' AND t.version = 1
$$;
ALTER POLICY transaction_create ON app."Transaction" WITH CHECK (
 CASE WHEN nullif(current_setting('joint.job_id', true), '') IS NOT NULL THEN
   "sourceNamespace" = 'CSV' AND ("householdId", "accountId", "originImportBatchId")
     IN (SELECT household_id, account_id, batch_id FROM app.import_write_scope())
 ELSE "sourceNamespace" = 'MANUAL' AND app.owns_account("accountId") END
);
ALTER POLICY revision_create ON app."TransactionRevision" WITH CHECK (
 CASE WHEN nullif(current_setting('joint.job_id', true), '') IS NOT NULL THEN
   kind = 'CREATED' AND version = 1
   AND ("householdId", "accountId", "actorMembershipId")
     IN (SELECT household_id, account_id, membership_id FROM app.import_write_scope())
   AND "transactionId" IN (SELECT app.import_revision_transactions())
 ELSE app.can_create_revision("transactionId", "householdId", "accountId", "actorMembershipId", kind, version) END
);
REVOKE ALL ON FUNCTION app.import_write_scope(), app.import_revision_transactions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.import_write_scope(), app.import_revision_transactions() TO joint_app_runtime;
COMMIT;
