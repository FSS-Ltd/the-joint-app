BEGIN;
-- Materialise archive authority once per statement. A false archive scope must
-- not perform a security-definer user/session lookup for each household row.
CREATE FUNCTION app.archive_scope_accounts()
RETURNS TABLE(household_id uuid, account_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT coalesce(app.archive_scope_is_valid(),false) THEN RETURN; END IF;
  RETURN QUERY SELECT o."householdId",o."accountId" FROM app."AccountOwner" o
    JOIN app."Membership" m ON m.id = o."membershipId" AND m."userId" = o."userId" AND m."householdId" = o."householdId"
    WHERE o."userId" = nullif(current_setting('joint.user_id',true),'')::uuid AND o.status = 'ARCHIVED' AND m.status = 'LEFT';
END $$;
CREATE FUNCTION app.archive_scope_batches() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH allowed AS MATERIALIZED (SELECT * FROM app.archive_scope_accounts())
  SELECT b.id FROM app."ImportBatch" b JOIN allowed a ON a.household_id = b."householdId" AND a.account_id = b."accountId"
    WHERE b.state = 'COMMITTED'
$$;
ALTER POLICY archive_transaction_read ON app."Transaction" USING (
  ("householdId","accountId") IN (SELECT household_id,account_id FROM app.archive_scope_accounts())
  AND ("originImportBatchId" IS NULL OR "originImportBatchId" IN (SELECT app.archive_scope_batches()))
);
ALTER POLICY archive_note_read ON app."TransactionNote" USING (
  (SELECT app.archive_scope_is_valid()) AND "authorUserId" = nullif(current_setting('joint.user_id',true),'')::uuid
  AND "transactionId" IN (SELECT id FROM app."Transaction")
);
REVOKE ALL ON FUNCTION app.archive_scope_accounts(),app.archive_scope_batches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.archive_scope_accounts(),app.archive_scope_batches() TO joint_app_runtime;
COMMIT;
