BEGIN;
-- Uncorrelated policy subqueries materialise the currently authorised account
-- and batch sets once per SQL statement. A large hidden batch must not cause
-- one transaction lookup plus session/lease joins for each candidate ledger row.
CREATE FUNCTION app.transaction_scope_accounts()
RETURNS TABLE(household_id uuid, account_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 IF nullif(current_setting('joint.job_id', true), '') IS NOT NULL THEN
   RETURN QUERY SELECT c."householdId", c."accountId" FROM app.import_job_context(
     nullif(current_setting('joint.job_id', true), '')::uuid,
     nullif(current_setting('joint.job_lease_token', true), '')::uuid) c
     WHERE app.import_job_valid(c."batchId");
 ELSIF coalesce(app.scope_is_valid(), false) THEN
   RETURN QUERY SELECT a."householdId", a.id FROM app."Account" a
     WHERE a."householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
       AND (EXISTS (SELECT 1 FROM app."AccountOwner" o WHERE o."accountId" = a.id AND o."householdId" = a."householdId"
         AND o."membershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid
         AND o."userId" = nullif(current_setting('joint.user_id', true), '')::uuid AND o.status = 'ACTIVE')
       OR EXISTS (SELECT 1 FROM app."AccountGrant" g WHERE g."accountId" = a.id AND g."householdId" = a."householdId"
         AND g."membershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid AND g.level = 'TRANSACTIONS'));
 END IF;
END $$;
CREATE FUNCTION app.transaction_scope_batches() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 WITH allowed AS MATERIALIZED (SELECT * FROM app.transaction_scope_accounts()),
 job AS MATERIALIZED (SELECT c."batchId" FROM app.import_job_context(
   nullif(current_setting('joint.job_id', true), '')::uuid,
   nullif(current_setting('joint.job_lease_token', true), '')::uuid) c WHERE app.import_job_valid(c."batchId"))
 SELECT b.id FROM app."ImportBatch" b JOIN allowed a ON a.household_id = b."householdId" AND a.account_id = b."accountId"
 WHERE b.state = 'COMMITTED' OR b.id IN (SELECT "batchId" FROM job)
$$;
DROP POLICY transaction_read ON app."Transaction";
CREATE POLICY transaction_read ON app."Transaction" FOR SELECT TO joint_app_runtime USING (
 ("householdId", "accountId") IN (SELECT household_id, account_id FROM app.transaction_scope_accounts())
 AND ("originImportBatchId" IS NULL OR "originImportBatchId" IN (SELECT app.transaction_scope_batches()))
);
REVOKE ALL ON FUNCTION app.transaction_scope_accounts(), app.transaction_scope_batches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.transaction_scope_accounts(), app.transaction_scope_batches() TO joint_app_runtime;
COMMIT;
