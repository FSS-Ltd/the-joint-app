BEGIN;
-- Evaluate the row's own immutable account/batch fields. Looking the new row up
-- by id from a STABLE helper cannot see INSERT RETURNING's command snapshot.
CREATE FUNCTION app.transaction_row_visible(account_id uuid, batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT (app.account_access(account_id, 'TRANSACTIONS') AND (batch_id IS NULL OR EXISTS (
   SELECT 1 FROM app."ImportBatch" b WHERE b.id = batch_id AND b."accountId" = account_id AND b.state = 'COMMITTED')))
 OR (app.import_job_account(account_id) AND (batch_id IS NULL OR app.import_job_valid(batch_id) OR EXISTS (
   SELECT 1 FROM app."ImportBatch" b WHERE b.id = batch_id AND b."accountId" = account_id AND b.state = 'COMMITTED')))
$$;
CREATE OR REPLACE FUNCTION app.transaction_visible(transaction_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS (SELECT 1 FROM app."Transaction" t WHERE t.id = transaction_id AND app.transaction_row_visible(t."accountId", t."originImportBatchId"))
$$;
DROP POLICY transaction_read ON app."Transaction";
CREATE POLICY transaction_read ON app."Transaction" FOR SELECT TO joint_app_runtime USING (app.transaction_row_visible("accountId", "originImportBatchId"));
REVOKE ALL ON FUNCTION app.transaction_row_visible(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.transaction_row_visible(uuid,uuid) TO joint_app_runtime;
COMMIT;
