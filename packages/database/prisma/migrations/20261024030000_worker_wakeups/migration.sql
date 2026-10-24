BEGIN;

-- Empty, commit-delivered hints. Consumers must recheck durable leases/authority.
CREATE FUNCTION app.notify_worker_wakeup() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 PERFORM pg_notify('joint_worker_wakeup', '');
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.notify_worker_wakeup() FROM PUBLIC;

CREATE TRIGGER worker_job_insert AFTER INSERT ON app."Job"
 FOR EACH ROW EXECUTE FUNCTION app.notify_worker_wakeup();
CREATE TRIGGER worker_job_delete AFTER DELETE ON app."Job"
 FOR EACH ROW EXECUTE FUNCTION app.notify_worker_wakeup();
CREATE TRIGGER worker_job_schedule AFTER UPDATE OF state, "runAfter", "leaseUntil" ON app."Job"
 FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state OR OLD."runAfter" IS DISTINCT FROM NEW."runAfter" OR OLD."leaseUntil" IS DISTINCT FROM NEW."leaseUntil")
 EXECUTE FUNCTION app.notify_worker_wakeup();
CREATE TRIGGER worker_import_insert AFTER INSERT ON app."ImportBatch"
 FOR EACH ROW EXECUTE FUNCTION app.notify_worker_wakeup();
CREATE TRIGGER worker_import_schedule AFTER UPDATE OF state, "previewExpiresAt" ON app."ImportBatch"
 FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state OR OLD."previewExpiresAt" IS DISTINCT FROM NEW."previewExpiresAt")
 EXECUTE FUNCTION app.notify_worker_wakeup();
CREATE TRIGGER worker_object_insert AFTER INSERT ON app."ImportObject"
 FOR EACH ROW EXECUTE FUNCTION app.notify_worker_wakeup();
CREATE TRIGGER worker_object_schedule AFTER UPDATE OF "expiresAt", ciphertext ON app."ImportObject"
 FOR EACH ROW WHEN (OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt" OR (OLD.ciphertext IS NULL) IS DISTINCT FROM (NEW.ciphertext IS NULL))
 EXECUTE FUNCTION app.notify_worker_wakeup();
CREATE TRIGGER worker_export_insert AFTER INSERT ON app."ExportRequest"
 FOR EACH ROW EXECUTE FUNCTION app.notify_worker_wakeup();
CREATE TRIGGER worker_export_schedule AFTER UPDATE OF state, "expiresAt" ON app."ExportRequest"
 FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt")
 EXECUTE FUNCTION app.notify_worker_wakeup();
CREATE TRIGGER worker_export_chunk AFTER INSERT ON app."ExportChunk"
 FOR EACH ROW EXECUTE FUNCTION app.notify_worker_wakeup();
CREATE TRIGGER worker_deletion_insert AFTER INSERT ON app."DeletionRequest"
 FOR EACH ROW EXECUTE FUNCTION app.notify_worker_wakeup();
CREATE TRIGGER worker_deletion_schedule AFTER UPDATE OF state, "runAfter", "leaseUntil" ON app."DeletionRequest"
 FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state OR OLD."runAfter" IS DISTINCT FROM NEW."runAfter" OR OLD."leaseUntil" IS DISTINCT FROM NEW."leaseUntil")
 EXECUTE FUNCTION app.notify_worker_wakeup();

CREATE INDEX "Job_worker_lease_idx" ON app."Job" (type, "leaseUntil") WHERE state = 'LEASED';
CREATE INDEX "Job_worker_resource_state_idx" ON app."Job" ("resourceId", "householdId", state);
CREATE INDEX "ImportBatch_worker_expiry_idx" ON app."ImportBatch" ("previewExpiresAt")
 WHERE state IN ('QUEUED','PREVIEWING','READY');

-- This service-only aggregate has no row-returning variant or client endpoint.
CREATE FUNCTION app.worker_next_delay(job_types text[], include_deletion boolean)
RETURNS double precision LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
 WITH instant AS (SELECT clock_timestamp() AS now), deadlines AS (
  SELECT j."runAfter" AS due FROM app."Job" j
   WHERE j.type = ANY(job_types) AND j.state IN ('QUEUED','RETRY_WAIT') AND j.attempt < j."maxAttempts"
  UNION ALL
  SELECT j."leaseUntil" FROM app."Job" j WHERE j.type = ANY(job_types) AND j.state = 'LEASED'
  UNION ALL
  SELECT o."expiresAt" FROM app."ImportObject" o WHERE o.ciphertext IS NOT NULL
  UNION ALL
  SELECT greatest(b."previewExpiresAt", coalesce((SELECT max(j."leaseUntil") FROM app."Job" j
    WHERE j."resourceId" = b.id AND j."householdId" = b."householdId" AND j.state = 'LEASED'), b."previewExpiresAt"))
   FROM app."ImportBatch" b WHERE b.state IN ('QUEUED','PREVIEWING','READY')
  UNION ALL
  SELECT i.now FROM app."ImportBatch" b CROSS JOIN instant i
   WHERE b.state IN ('QUEUED','PREVIEWING','COMMITTING')
    AND EXISTS (SELECT 1 FROM app."Job" j WHERE j."resourceId" = b.id AND j."householdId" = b."householdId"
      AND j.type IN ('csv.preview','csv.commit','csv.restore') AND j.state = 'FAILED')
    AND NOT EXISTS (SELECT 1 FROM app."Job" j WHERE j."resourceId" = b.id AND j."householdId" = b."householdId"
      AND j.type IN ('csv.preview','csv.commit','csv.restore') AND j.state IN ('QUEUED','LEASED','RETRY_WAIT'))
  UNION ALL
  SELECT i.now FROM app."Job" j JOIN app."ImportBatch" b ON b.id = j."resourceId" AND b."householdId" = j."householdId" CROSS JOIN instant i
   WHERE b.state = 'EXPIRED' AND j.type IN ('csv.preview','csv.commit','csv.restore') AND j.state IN ('QUEUED','RETRY_WAIT')
  UNION ALL
  SELECT e."expiresAt" FROM app."ExportRequest" e WHERE e.state <> 'EXPIRED'
    OR EXISTS (SELECT 1 FROM app."ExportChunk" c WHERE c."exportId" = e.id)
  UNION ALL
  SELECT greatest(d."runAfter", coalesce(d."leaseUntil", d."runAfter")) FROM app."DeletionRequest" d
   WHERE include_deletion AND d.state IN ('PENDING','PROVIDER_PENDING')
 ) SELECT CASE WHEN min(d.due) IS NULL THEN NULL
   ELSE greatest(0, ceil(extract(epoch FROM (min(d.due) - i.now)) * 1000))::double precision END
 FROM instant i LEFT JOIN deadlines d ON true GROUP BY i.now
$$;
REVOKE ALL ON FUNCTION app.worker_next_delay(text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.worker_next_delay(text[], boolean) TO joint_app_runtime;
COMMIT;
