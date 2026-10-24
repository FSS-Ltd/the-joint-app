BEGIN;

CREATE FUNCTION app.notify_status_wakeup() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 PERFORM pg_notify('joint_status_wakeup', '');
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.notify_status_wakeup() FROM PUBLIC;

-- Fixed table names, no row values or identifiers in the notification payload.
DO $$
DECLARE relation_name text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY[
  'ImportBatch','ExportRequest','DeletionRequest','Account','AccountOwner',
  'AccountGrant','Membership','User','ClerkIdentity','ClerkSession',
  'ExportAccountRevision','ExportNoteRevision'
 ] LOOP
  EXECUTE format('CREATE TRIGGER status_change_insert_delete AFTER INSERT OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.notify_status_wakeup()', relation_name);
  EXECUTE format('CREATE TRIGGER status_change_update AFTER UPDATE ON app.%I FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION app.notify_status_wakeup()', relation_name);
 END LOOP;
END $$;

-- Export status projects terminal job failure even before any request-row write.
-- Lease heartbeats, attempts and scheduling bookkeeping must remain silent.
CREATE TRIGGER status_export_job_terminal AFTER UPDATE OF state ON app."Job"
 FOR EACH ROW WHEN (NEW.type = 'csv.export' AND OLD.state IS DISTINCT FROM NEW.state
  AND NEW.state IN ('FAILED', 'CANCELLED'))
 EXECUTE FUNCTION app.notify_status_wakeup();

CREATE TRIGGER status_object_insert_delete AFTER INSERT OR DELETE ON app."ImportObject"
 FOR EACH ROW EXECUTE FUNCTION app.notify_status_wakeup();
CREATE TRIGGER status_object_update AFTER UPDATE OF "expiresAt", "deletedAt" ON app."ImportObject"
 FOR EACH ROW WHEN (OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt" OR OLD."deletedAt" IS DISTINCT FROM NEW."deletedAt")
 EXECUTE FUNCTION app.notify_status_wakeup();

CREATE TRIGGER status_session_insert_delete AFTER INSERT OR DELETE ON app."SessionRegistry"
 FOR EACH ROW EXECUTE FUNCTION app.notify_status_wakeup();
-- Reauthorization refreshes provider tokens and lastSeenAt. Those writes must
-- never wake the same observer. Authority changes and shortened expiry must.
CREATE TRIGGER status_session_update AFTER UPDATE ON app."SessionRegistry"
 FOR EACH ROW WHEN (
  (OLD."userId",OLD."householdId",OLD.kind,OLD."browserTokenHash",OLD.purpose,OLD."expiresAt",OLD."revokedAt")
  IS DISTINCT FROM
  (NEW."userId",NEW."householdId",NEW.kind,NEW."browserTokenHash",NEW.purpose,NEW."expiresAt",NEW."revokedAt")
 ) EXECUTE FUNCTION app.notify_status_wakeup();

CREATE TRIGGER status_clerk_resource_insert_delete AFTER INSERT OR DELETE ON app."ClerkResourceState"
 FOR EACH ROW EXECUTE FUNCTION app.notify_status_wakeup();
CREATE TRIGGER status_clerk_resource_update AFTER UPDATE ON app."ClerkResourceState"
 FOR EACH ROW WHEN (
  (OLD.issuer,OLD."resourceId",OLD.subject,OLD.kind,OLD.state)
  IS DISTINCT FROM (NEW.issuer,NEW."resourceId",NEW.subject,NEW.kind,NEW.state)
 ) EXECUTE FUNCTION app.notify_status_wakeup();

CREATE FUNCTION app.deletion_receipt_deadline(request_id uuid, status_hash text)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT d."statusExpiresAt" FROM app."DeletionRequest" d
 WHERE d.id = request_id AND d."statusTokenHash" = status_hash
  AND d."statusExpiresAt" > clock_timestamp()
$$;
REVOKE ALL ON FUNCTION app.deletion_receipt_deadline(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.deletion_receipt_deadline(uuid, text) TO joint_app_runtime;
COMMIT;
