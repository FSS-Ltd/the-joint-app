BEGIN;
ALTER TABLE app."TransactionRevision" ADD CONSTRAINT "TransactionRevision_initial_kind"
 CHECK ((kind = 'CREATED' AND version = 1) OR (kind <> 'CREATED' AND version > 1));
CREATE OR REPLACE FUNCTION app.import_is_pristine(batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT app.import_owned(batch_id) AND NOT EXISTS (
   SELECT 1 FROM app."Transaction" t WHERE t."originImportBatchId" = batch_id
     AND (t.version <> 1 OR EXISTS (SELECT 1 FROM app."TransactionRevision" r WHERE r."transactionId" = t.id AND (r.kind <> 'CREATED' OR r.version <> 1))
       OR EXISTS (SELECT 1 FROM app."TransactionOverride" o WHERE o."transactionId" = t.id)
       OR EXISTS (SELECT 1 FROM app."TransactionNote" n WHERE n."transactionId" = t.id)))
$$;
CREATE OR REPLACE FUNCTION app.reconcile_import_failures(batch_limit integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE changed integer; expired_count integer;
BEGIN
 IF batch_limit < 1 OR batch_limit > 1000 THEN RAISE EXCEPTION 'Invalid reconciliation bound'; END IF;
 WITH failed AS (SELECT b.id FROM app."ImportBatch" b WHERE b.state IN ('QUEUED','PREVIEWING','COMMITTING')
   AND EXISTS (SELECT 1 FROM app."Job" j WHERE j."resourceId" = b.id AND j."householdId" = b."householdId" AND j.type IN ('csv.preview','csv.commit','csv.restore') AND j.state = 'FAILED')
   AND NOT EXISTS (SELECT 1 FROM app."Job" j WHERE j."resourceId" = b.id AND j."householdId" = b."householdId" AND j.type IN ('csv.preview','csv.commit','csv.restore') AND j.state IN ('QUEUED','LEASED','RETRY_WAIT'))
   ORDER BY b."createdAt" LIMIT batch_limit FOR UPDATE SKIP LOCKED)
 UPDATE app."ImportBatch" b SET state = 'FAILED', "failureCode" = 'PROCESSING_FAILED', version = version + 1, "updatedAt" = clock_timestamp() FROM failed f WHERE b.id = f.id;
 GET DIAGNOSTICS changed = ROW_COUNT;
 WITH expired AS (SELECT b.id FROM app."ImportBatch" b WHERE b.state IN ('QUEUED','PREVIEWING','READY') AND b."previewExpiresAt" <= clock_timestamp()
   AND NOT EXISTS (SELECT 1 FROM app."Job" j WHERE j."resourceId" = b.id AND j."householdId" = b."householdId" AND j.state = 'LEASED' AND j."leaseUntil" > clock_timestamp())
   ORDER BY b."previewExpiresAt" LIMIT batch_limit FOR UPDATE SKIP LOCKED)
 UPDATE app."ImportBatch" b SET state = 'EXPIRED', version = version + 1, "updatedAt" = clock_timestamp() FROM expired e WHERE b.id = e.id;
 GET DIAGNOSTICS expired_count = ROW_COUNT;
 UPDATE app."Job" j SET state = 'CANCELLED', "leaseOwner" = NULL, "leaseToken" = NULL, "leaseUntil" = NULL
 WHERE j.type IN ('csv.preview','csv.commit','csv.restore') AND j.state IN ('QUEUED','RETRY_WAIT')
   AND EXISTS (SELECT 1 FROM app."ImportBatch" b WHERE b.id = j."resourceId" AND b."householdId" = j."householdId" AND b.state = 'EXPIRED');
 RETURN changed + expired_count;
END $$;
COMMIT;
