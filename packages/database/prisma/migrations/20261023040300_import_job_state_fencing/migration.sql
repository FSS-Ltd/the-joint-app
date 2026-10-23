BEGIN;
CREATE OR REPLACE FUNCTION app.import_job_context(job_id uuid, lease_token uuid)
RETURNS TABLE("userId" uuid, "membershipId" uuid, "householdId" uuid, "accountId" uuid, "batchId" uuid, "jobId" uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT b."requestedByUserId", b."requestedByMembershipId", b."householdId", b."accountId", b.id, j.id
 FROM app."Job" j JOIN app."ImportBatch" b ON b.id = j."resourceId" AND b."householdId" = j."householdId"
 JOIN app."Membership" m ON m.id = b."requestedByMembershipId" AND m."userId" = b."requestedByUserId" AND m."householdId" = b."householdId" AND m.status = 'ACTIVE'
 JOIN app."User" u ON u.id = m."userId" AND u.status = 'ACTIVE'
 JOIN app."AccountOwner" o ON o."accountId" = b."accountId" AND o."householdId" = b."householdId" AND o."userId" = m."userId" AND o."membershipId" = m.id AND o.status = 'ACTIVE'
 WHERE j.id = job_id AND j."leaseToken" = lease_token AND j.state = 'LEASED' AND j."leaseUntil" > clock_timestamp()
   AND ((j.type = 'csv.preview' AND j.payload->>'operation' = 'PREVIEW' AND b.state IN ('QUEUED','PREVIEWING','READY')) OR (j.type = 'csv.commit' AND j.payload->>'operation' = 'COMMIT' AND b.state IN ('COMMITTING','COMMITTED')) OR (j.type = 'csv.restore' AND j.payload->>'operation' = 'RESTORE' AND b.state IN ('ROLLED_BACK','COMMITTING','COMMITTED')))
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
 WITH abandoned AS (SELECT j.id FROM app."Job" j
 WHERE j.type IN ('csv.preview','csv.commit','csv.restore') AND j.state IN ('QUEUED','RETRY_WAIT')
   AND EXISTS (SELECT 1 FROM app."ImportBatch" b WHERE b.id = j."resourceId" AND b."householdId" = j."householdId" AND b.state = 'EXPIRED')
 ORDER BY j."createdAt", j.id LIMIT batch_limit FOR UPDATE SKIP LOCKED)
 UPDATE app."Job" j SET state = 'CANCELLED', "leaseOwner" = NULL, "leaseToken" = NULL, "leaseUntil" = NULL
 FROM abandoned a WHERE j.id = a.id;
 RETURN changed + expired_count;
END $$;
COMMIT;
