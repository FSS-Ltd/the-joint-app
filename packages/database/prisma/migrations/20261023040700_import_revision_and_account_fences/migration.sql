BEGIN;
ALTER TABLE app."ImportBatch" ADD COLUMN "datasetVersion" integer NOT NULL DEFAULT 0;
GRANT UPDATE ("datasetVersion") ON app."ImportBatch" TO joint_app_runtime;

-- Shared viewers need a lock for their own notes, without an account UPDATE grant.
CREATE FUNCTION app.lock_account_for_annotation(account_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 IF NOT coalesce(app.account_access(account_id, 'TRANSACTIONS'), false) THEN RETURN false; END IF;
 PERFORM 1 FROM app."Account" WHERE id = account_id AND "archivedAt" IS NULL FOR UPDATE;
 RETURN FOUND AND coalesce(app.account_access(account_id, 'TRANSACTIONS'), false);
END $$;

-- Avoid recursively applying Transaction RLS for every immutable revision insert.
CREATE FUNCTION app.can_create_revision(transaction_id uuid, household_id uuid, account_id uuid, actor_membership_id uuid, revision_kind app."TransactionRevisionKind", revision_version integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT CASE WHEN nullif(current_setting('joint.job_id', true), '') IS NOT NULL THEN
   revision_kind = 'CREATED' AND revision_version = 1
   AND actor_membership_id = nullif(current_setting('joint.job_membership_id', true), '')::uuid
   AND EXISTS (SELECT 1 FROM app."Transaction" t WHERE t.id = transaction_id AND t."householdId" = household_id
      AND t."accountId" = account_id AND app.import_job_valid(t."originImportBatchId"))
 ELSE app.transaction_visible(transaction_id) AND app.owns_account(account_id)
   AND actor_membership_id = nullif(current_setting('joint.membership_id', true), '')::uuid
 END
$$;
ALTER POLICY revision_create ON app."TransactionRevision" WITH CHECK (
 app.can_create_revision("transactionId", "householdId", "accountId", "actorMembershipId", kind, version)
);

CREATE FUNCTION app.import_account_version(batch_id uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT a.version FROM app."Account" a JOIN app."ImportBatch" b ON b."accountId" = a.id AND b."householdId" = a."householdId"
 WHERE b.id = batch_id AND (app.import_owned(batch_id) OR app.import_job_valid(batch_id))
$$;
CREATE FUNCTION app.advance_import_account_version(batch_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 IF NOT coalesce(app.import_job_valid(batch_id), false) OR NOT EXISTS (
   SELECT 1 FROM app."Job" j WHERE j.id = nullif(current_setting('joint.job_id', true), '')::uuid AND j.type IN ('csv.commit','csv.restore')
 ) THEN RAISE EXCEPTION 'Import lease is no longer valid' USING ERRCODE='42501'; END IF;
 UPDATE app."Account" a SET version = a.version + 1 FROM app."ImportBatch" b
 WHERE b.id = batch_id AND b.state = 'COMMITTED' AND a.id = b."accountId" AND a."householdId" = b."householdId";
END $$;

-- A worker may reconcile reserved source identities only within its actual owned account.
CREATE FUNCTION app.import_source_identities(source_ids text[])
RETURNS TABLE("sourceId" text, "sourceHash" text, "transactionId" uuid, "batchState" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT t."sourceId"::text, t."sourceHash"::text, t.id, b.state::text
 FROM app.import_job_context(nullif(current_setting('joint.job_id', true), '')::uuid,
   nullif(current_setting('joint.job_lease_token', true), '')::uuid) c
 JOIN app."Transaction" t ON t."accountId" = c."accountId" AND t."householdId" = c."householdId" AND t."sourceNamespace" = 'CSV'
 JOIN app."ImportBatch" b ON b.id = t."originImportBatchId" AND b."accountId" = t."accountId" AND b."householdId" = t."householdId"
 WHERE app.import_job_valid(c."batchId") AND coalesce(array_length(source_ids, 1),0) <= 50000 AND t."sourceId" = ANY(source_ids)
$$;
REVOKE ALL ON FUNCTION app.lock_account_for_annotation(uuid), app.can_create_revision(uuid,uuid,uuid,uuid,app."TransactionRevisionKind",integer), app.import_account_version(uuid), app.advance_import_account_version(uuid), app.import_source_identities(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_account_for_annotation(uuid), app.can_create_revision(uuid,uuid,uuid,uuid,app."TransactionRevisionKind",integer), app.import_account_version(uuid), app.advance_import_account_version(uuid), app.import_source_identities(text[]) TO joint_app_runtime;
COMMIT;
