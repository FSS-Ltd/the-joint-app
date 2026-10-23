-- A shared detail viewer may know its visible leg is paired, but receives no
-- counterpart identifiers, ownership, labels or amounts from this projection.
CREATE FUNCTION app.paired_transaction_ids(transaction_ids uuid[]) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 WITH allowed AS MATERIALIZED (
  SELECT * FROM app.transaction_scope_accounts()
  WHERE app.scope_is_valid() AND nullif(current_setting('joint.job_id',true),'') IS NULL
 ), published AS MATERIALIZED (SELECT app.transaction_scope_batches() AS id)
 SELECT t.id FROM app."Transaction" t
 JOIN allowed a ON a.household_id=t."householdId" AND a.account_id=t."accountId"
 WHERE coalesce(array_length(transaction_ids,1),0) BETWEEN 1 AND 200
 AND t.id=ANY(transaction_ids) AND t.status='BOOKED'
 AND (t."originImportBatchId" IS NULL OR t."originImportBatchId" IN (SELECT id FROM published))
 AND EXISTS (SELECT 1 FROM app."TransferLink" l WHERE l.active AND l."householdId"=t."householdId"
  AND ((l."fromTransactionId"=t.id AND l."fromAccountId"=t."accountId")
   OR (l."toTransactionId"=t.id AND l."toAccountId"=t."accountId")))
$$;
REVOKE ALL ON FUNCTION app.paired_transaction_ids(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.paired_transaction_ids(uuid[]) TO joint_app_runtime;
