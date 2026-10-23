BEGIN;
-- Cascade deletion must not shrink the recorded scope into a valid subset.
ALTER TABLE app."ExportRequest" ADD COLUMN "sourceCount" integer NOT NULL DEFAULT 0;
UPDATE app."ExportRequest" e SET "sourceCount"=(SELECT count(*) FROM app."ExportSource" s WHERE s."exportId"=e.id);
CREATE FUNCTION app.record_export_scope_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE app."ExportRequest" SET "sourceCount"="sourceCount"+1 WHERE id=NEW."exportId";
 RETURN NEW;
END $$;
CREATE TRIGGER export_scope_count AFTER INSERT ON app."ExportSource" FOR EACH ROW EXECUTE FUNCTION app.record_export_scope_count();
CREATE FUNCTION app.invalidate_export_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='User' THEN
  UPDATE app."ExportRequest" SET state='INVALIDATED' WHERE "userId"=OLD.id AND state IN ('QUEUED','PROCESSING','READY');
 ELSIF TG_TABLE_NAME='SessionRegistry' THEN
  UPDATE app."ExportRequest" SET state='INVALIDATED' WHERE "sessionId"=OLD.id AND state IN ('QUEUED','PROCESSING','READY');
 ELSE
  UPDATE app."ExportRequest" e SET state='INVALIDATED' WHERE state IN ('QUEUED','PROCESSING','READY') AND EXISTS(
   SELECT 1 FROM app."ExportSource" s WHERE s."exportId"=e.id AND s."membershipId"=OLD.id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER export_user_revocation AFTER UPDATE OF status ON app."User" FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION app.invalidate_export_identity();
CREATE TRIGGER export_session_revocation AFTER UPDATE OF "revokedAt","expiresAt",purpose ON app."SessionRegistry" FOR EACH ROW WHEN (OLD."revokedAt" IS DISTINCT FROM NEW."revokedAt" OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt" OR OLD.purpose IS DISTINCT FROM NEW.purpose) EXECUTE FUNCTION app.invalidate_export_identity();
CREATE TRIGGER export_membership_revocation AFTER UPDATE OF status ON app."Membership" FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION app.invalidate_export_identity();
CREATE TRIGGER export_account_delete BEFORE DELETE ON app."Account" FOR EACH ROW EXECUTE FUNCTION app.invalidate_account_exports();
REVOKE ALL ON FUNCTION app.record_export_scope_count(),app.invalidate_export_identity() FROM PUBLIC;
CREATE OR REPLACE FUNCTION app.export_fence(export_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS (SELECT 1 FROM app."ExportRequest" e
 JOIN app."User" u ON u.id=e."userId" AND u.status='ACTIVE'
 JOIN app."SessionRegistry" r ON r.id=e."sessionId" AND r."userId"=e."userId"
   AND r."revokedAt" IS NULL AND r."expiresAt">clock_timestamp() AND r.purpose='NORMAL'
 WHERE e.id=export_id AND e.state IN ('QUEUED','PROCESSING','READY') AND e."expiresAt">clock_timestamp()
 AND e."sourceCount">0 AND e."sourceCount"=(SELECT count(*) FROM app."ExportSource" s WHERE s."exportId"=e.id)
 AND NOT EXISTS (
  SELECT 1 FROM app."ExportSource" s
  LEFT JOIN app."Account" a ON a.id=s."accountId" AND a."householdId"=s."householdId"
  LEFT JOIN app."ExportAccountRevision" v ON v."accountId"=s."accountId"
  LEFT JOIN app."Membership" m ON m.id=s."membershipId" AND m."userId"=e."userId" AND m."householdId"=s."householdId"
  WHERE s."exportId"=e.id AND (a.id IS NULL OR v.version IS DISTINCT FROM s."sourceVersion" OR m.id IS NULL
   OR CASE WHEN e.archive THEN m.status<>'LEFT' OR NOT EXISTS(
     SELECT 1 FROM app."AccountOwner" o WHERE o."accountId"=s."accountId" AND o."userId"=e."userId"
     AND o."membershipId"=s."membershipId" AND o.status='ARCHIVED')
   ELSE m.status<>'ACTIVE' OR r."householdId" IS DISTINCT FROM s."householdId" OR a."archivedAt" IS NOT NULL
    OR CASE WHEN s.owned THEN NOT EXISTS(SELECT 1 FROM app."AccountOwner" o WHERE o."accountId"=s."accountId"
      AND o."userId"=e."userId" AND o."membershipId"=s."membershipId" AND o.status='ACTIVE')
    ELSE NOT EXISTS(SELECT 1 FROM app."AccountGrant" g WHERE g."accountId"=s."accountId"
      AND g."membershipId"=s."membershipId" AND g.version=s."grantVersion" AND g.level::text=s.level) END
   END)
 ))
$$;

CREATE OR REPLACE FUNCTION app.export_records(export_id uuid,after_key text)
RETURNS TABLE(key text,record_data jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH sources AS MATERIALIZED (SELECT s.*,e."userId" FROM app."ExportSource" s JOIN app."ExportRequest" e ON e.id=s."exportId" WHERE e.id=export_id),
 visible AS NOT MATERIALIZED (
  SELECT t.* FROM app."Transaction" t JOIN sources s ON s."accountId"=t."accountId" AND s.level='TRANSACTIONS'
  WHERE t."originImportBatchId" IS NULL OR EXISTS(SELECT 1 FROM app."ImportBatch" b WHERE b.id=t."originImportBatchId" AND b.state='COMMITTED')
 ), records AS ((
 SELECT '1:'||a.id::text AS key,jsonb_build_object('recordType','ACCOUNT','accountId',a.id,'recordId',a.id,'label',a.label,'currency',a.currency,
  'details',jsonb_build_object('kind',a.kind,'legalOwnerKind',a."legalOwnerKind",'liquidity',a.liquidity,'version',a.version,'createdAt',a."createdAt")::text) AS record_data
 FROM app."Account" a JOIN sources s ON s."accountId"=a.id
 WHERE left(after_key,2)<='1:' AND a.id>CASE WHEN left(after_key,2)='1:' THEN substring(after_key FROM 3)::uuid ELSE '00000000-0000-0000-0000-000000000000'::uuid END
 ORDER BY a.id LIMIT 500)
 UNION ALL
( SELECT '2:'||b.id::text,jsonb_build_object('recordType','BALANCE','accountId',b."accountId",'recordId',b.id,'date',b."asOfDate"::text,
  'amountMinor',b."amountMinor"::text,'currency',b.currency,'details',jsonb_build_object('complete',b.complete,'source',b.source,'createdAt',b."createdAt")::text)
 FROM app."BalanceSnapshot" b JOIN sources s ON s."accountId"=b."accountId"
 WHERE left(after_key,2)<='2:' AND b.id>CASE WHEN left(after_key,2)='2:' THEN substring(after_key FROM 3)::uuid ELSE '00000000-0000-0000-0000-000000000000'::uuid END
 ORDER BY b.id LIMIT 500)
 UNION ALL
( SELECT '3:'||t.id::text,jsonb_strip_nulls(jsonb_build_object('recordType','TRANSACTION','accountId',t."accountId",'recordId',t.id,'date',t."bookedDate"::text,
 'amountMinor',t."amountMinor"::text,'currency',t.currency,'description',t.description,'category',o.category,'classification',o."classificationKind",
 'details',jsonb_build_object('source',t."sourceNamespace",'sourceId',t."sourceId",'sourceHash',t."sourceHash",'fingerprint',t.fingerprint,
  'csvRowNumber',t."csvRowNumber",'status',t.status,'version',t.version,'merchant',o.merchant,'createdAt',t."createdAt")::text))
 FROM visible t LEFT JOIN app."TransactionOverride" o ON o."transactionId"=t.id
 WHERE left(after_key,2)<='3:' AND t.id>CASE WHEN left(after_key,2)='3:' THEN substring(after_key FROM 3)::uuid ELSE '00000000-0000-0000-0000-000000000000'::uuid END
 ORDER BY t.id LIMIT 500)
 UNION ALL
( SELECT '4:'||r.id::text,jsonb_build_object('recordType','REVISION','accountId',r."accountId",'recordId',r.id,'date',r."createdAt"::text,
 'details',jsonb_build_object('transactionId',r."transactionId",'version',r.version,'kind',r.kind,
 'data',CASE WHEN r.kind IN ('SPLIT','CLASSIFICATION') THEN jsonb_build_object('before',r.data->'before','after',r.data->'after')
 ELSE jsonb_strip_nulls(jsonb_build_object('bookedDate',r.data->'bookedDate','money',r.data->'money','amountMinor',r.data->'amountMinor',
  'description',r.data->'description','currency',r.data->'currency','category',r.data->'category','classificationKind',r.data->'classificationKind')) END)::text)
 FROM app."TransactionRevision" r JOIN visible t ON t.id=r."transactionId"
 WHERE left(after_key,2)<='4:' AND r.id>CASE WHEN left(after_key,2)='4:' THEN substring(after_key FROM 3)::uuid ELSE '00000000-0000-0000-0000-000000000000'::uuid END
 ORDER BY r.id LIMIT 500)
 UNION ALL
( SELECT '5:'||p.id::text,jsonb_strip_nulls(jsonb_build_object('recordType','SPLIT','accountId',p."accountId",'recordId',p.id,
 'amountMinor',p."amountMinor"::text,'currency',t.currency,'category',p.category,'classification',p."classificationKind",
 'details',jsonb_build_object('transactionId',t.id,'position',p.position)::text))
 FROM app."TransactionSplit" p JOIN visible t ON t.id=p."transactionId"
 WHERE left(after_key,2)<='5:' AND p.id>CASE WHEN left(after_key,2)='5:' THEN substring(after_key FROM 3)::uuid ELSE '00000000-0000-0000-0000-000000000000'::uuid END
 ORDER BY p.id LIMIT 500)
 UNION ALL
( SELECT '6:'||n."transactionId"::text,jsonb_strip_nulls(jsonb_build_object('recordType','NOTE','accountId',n."accountId",'recordId',n."transactionId",'note',n.body,
 'details',jsonb_build_object('version',n.version,'createdAt',n."createdAt",'updatedAt',n."updatedAt")::text))
 FROM app."TransactionNote" n JOIN visible t ON t.id=n."transactionId" JOIN sources s ON s."accountId"=n."accountId" AND s."userId"=n."authorUserId"
 WHERE left(after_key,2)<='6:' AND n."transactionId">CASE WHEN left(after_key,2)='6:' THEN substring(after_key FROM 3)::uuid ELSE '00000000-0000-0000-0000-000000000000'::uuid END
 ORDER BY n."transactionId" LIMIT 500)
 ) SELECT records.key,records.record_data FROM records WHERE records.key>after_key ORDER BY records.key LIMIT 500
$$;

COMMIT;
