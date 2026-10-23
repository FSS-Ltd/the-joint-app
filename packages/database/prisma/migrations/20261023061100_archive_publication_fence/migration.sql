BEGIN;
-- Retention never publishes a partial, rejected or still-processing import.
CREATE FUNCTION app.archive_transaction_visible(account_id uuid, batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.archive_owns_account(account_id) AND (batch_id IS NULL OR EXISTS (
    SELECT 1 FROM app."ImportBatch" b WHERE b.id = batch_id AND b."accountId" = account_id AND b.state = 'COMMITTED'
  ))
$$;
ALTER POLICY archive_transaction_read ON app."Transaction" USING (
  app.archive_transaction_visible("accountId", "originImportBatchId")
);
-- Existing statement-scoped policies join the now-visible transaction set.
DROP POLICY archive_override_read ON app."TransactionOverride";
DROP POLICY archive_split_read ON app."TransactionSplit";
ALTER POLICY archive_note_read ON app."TransactionNote" USING (
  app.archive_scope_is_valid() AND "authorUserId" = nullif(current_setting('joint.user_id', true), '')::uuid
  AND "transactionId" IN (SELECT id FROM app."Transaction")
);
REVOKE ALL ON FUNCTION app.archive_transaction_visible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.archive_transaction_visible(uuid, uuid) TO joint_app_runtime;
COMMIT;
