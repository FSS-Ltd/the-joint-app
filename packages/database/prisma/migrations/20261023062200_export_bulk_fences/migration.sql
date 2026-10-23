BEGIN;
-- Financial bulk writes retain one monotonic fence update per account rather
-- than two SQL updates per ledger row. Transition tables preserve atomicity.
CREATE FUNCTION app.invalidate_export_sources() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE app."ExportAccountRevision" v SET version=version+1
 WHERE v."accountId" IN (SELECT DISTINCT "accountId" FROM changed);
 UPDATE app."ExportRequest" e SET state='INVALIDATED'
 WHERE e.state IN ('QUEUED','PROCESSING','READY') AND EXISTS(
  SELECT 1 FROM app."ExportSource" s WHERE s."exportId"=e.id
  AND s."accountId" IN (SELECT DISTINCT "accountId" FROM changed));
 RETURN NULL;
END $$;
DROP TRIGGER export_balance_change ON app."BalanceSnapshot";
CREATE TRIGGER export_balance_insert AFTER INSERT ON app."BalanceSnapshot" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_balance_update AFTER UPDATE ON app."BalanceSnapshot" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_balance_delete AFTER DELETE ON app."BalanceSnapshot" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
DROP TRIGGER export_transaction_change ON app."Transaction";
CREATE TRIGGER export_transaction_insert AFTER INSERT ON app."Transaction" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_transaction_update AFTER UPDATE ON app."Transaction" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_transaction_delete AFTER DELETE ON app."Transaction" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
DROP TRIGGER export_revision_change ON app."TransactionRevision";
CREATE TRIGGER export_revision_insert AFTER INSERT ON app."TransactionRevision" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_revision_update AFTER UPDATE ON app."TransactionRevision" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_revision_delete AFTER DELETE ON app."TransactionRevision" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
DROP TRIGGER export_override_change ON app."TransactionOverride";
CREATE TRIGGER export_override_insert AFTER INSERT ON app."TransactionOverride" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_override_update AFTER UPDATE ON app."TransactionOverride" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_override_delete AFTER DELETE ON app."TransactionOverride" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
DROP TRIGGER export_note_change ON app."TransactionNote";
CREATE TRIGGER export_note_insert AFTER INSERT ON app."TransactionNote" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_note_update AFTER UPDATE ON app."TransactionNote" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_note_delete AFTER DELETE ON app."TransactionNote" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
DROP TRIGGER export_split_change ON app."TransactionSplit";
CREATE TRIGGER export_split_insert AFTER INSERT ON app."TransactionSplit" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_split_update AFTER UPDATE ON app."TransactionSplit" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_split_delete AFTER DELETE ON app."TransactionSplit" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
DROP TRIGGER export_import_change ON app."ImportBatch";
CREATE TRIGGER export_import_insert AFTER INSERT ON app."ImportBatch" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_import_update AFTER UPDATE ON app."ImportBatch" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE TRIGGER export_import_delete AFTER DELETE ON app."ImportBatch" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_sources();
CREATE OR REPLACE FUNCTION app.export_status(export_id uuid)
RETURNS TABLE(id uuid,state text,"createdAt" timestamptz,"expiresAt" timestamptz,"downloadExpiresAt" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT coalesce(app.export_actor(export_id),false) THEN RETURN; END IF;
 UPDATE app."ExportRequest" e SET state=CASE WHEN e."expiresAt"<=clock_timestamp() THEN 'EXPIRED' ELSE 'INVALIDATED' END
 WHERE e.id=export_id AND e.state IN ('QUEUED','PROCESSING','READY') AND NOT app.export_fence(export_id);
 UPDATE app."ExportRequest" e SET state='FAILED'
 WHERE e.id=export_id AND e.state IN ('QUEUED','PROCESSING')
 AND EXISTS(SELECT 1 FROM app."Job" j WHERE j."resourceId"=e.id AND j.type='csv.export' AND j.state IN ('FAILED','CANCELLED'))
 AND NOT EXISTS(SELECT 1 FROM app."Job" j WHERE j."resourceId"=e.id AND j.type='csv.export' AND j.state IN ('QUEUED','LEASED','RETRY_WAIT'));
 RETURN QUERY SELECT e.id,e.state::text,e."createdAt",e."expiresAt",e."downloadExpiresAt" FROM app."ExportRequest" e WHERE e.id=export_id;
END $$;
REVOKE ALL ON FUNCTION app.invalidate_export_sources() FROM PUBLIC;
COMMIT;
