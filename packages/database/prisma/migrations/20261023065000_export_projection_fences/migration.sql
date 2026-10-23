BEGIN;
-- Each fence observes exactly the projection disclosed to its requester.
ALTER TABLE app."ExportAccountRevision" ADD COLUMN "detailVersion" bigint NOT NULL DEFAULT 0;
ALTER TABLE app."ExportSource" ADD COLUMN "detailVersion" bigint, ADD COLUMN "noteVersion" bigint;
CREATE TABLE app."ExportNoteRevision" (
  "accountId" uuid NOT NULL REFERENCES app."Account"(id) ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES app."User"(id) ON DELETE RESTRICT,
  version bigint NOT NULL DEFAULT 0,
  PRIMARY KEY ("accountId","userId")
);
ALTER TABLE app."ExportNoteRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ExportNoteRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."ExportNoteRevision" TO CURRENT_USER USING (true) WITH CHECK (true);
REVOKE ALL ON app."ExportNoteRevision" FROM PUBLIC,joint_app_runtime;
-- Legacy objects have no independently captured projection fences.
UPDATE app."ExportRequest" SET state='INVALIDATED' WHERE state IN ('QUEUED','PROCESSING','READY');


CREATE OR REPLACE FUNCTION app.invalidate_account_exports() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account_id uuid;
BEGIN
 IF TG_TABLE_NAME='Account' AND TG_OP='UPDATE' THEN
   IF (NEW.label,NEW.kind,NEW.currency,NEW."legalOwnerKind",NEW.liquidity,NEW."createdAt",NEW."archivedAt") IS NOT DISTINCT FROM
   (OLD.label,OLD.kind,OLD.currency,OLD."legalOwnerKind",OLD.liquidity,OLD."createdAt",OLD."archivedAt") THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='Account' THEN account_id=coalesce(NEW.id,OLD.id);
 ELSE account_id=coalesce(NEW."accountId",OLD."accountId"); END IF;
 IF TG_TABLE_NAME='Account' AND TG_OP='INSERT' THEN
   INSERT INTO app."ExportAccountRevision"("accountId") VALUES(account_id) ON CONFLICT DO NOTHING;
 ELSE
   UPDATE app."ExportAccountRevision" SET version=version+1 WHERE "accountId"=account_id;
   UPDATE app."ExportRequest" e SET state='INVALIDATED'
   WHERE state IN ('QUEUED','PROCESSING','READY') AND EXISTS (
     SELECT 1 FROM app."ExportSource" s WHERE s."exportId"=e.id AND s."accountId"=account_id);
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;

CREATE OR REPLACE FUNCTION app.invalidate_export_sources() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='BalanceSnapshot' THEN
   UPDATE app."ExportAccountRevision" v SET version=version+1
   WHERE v."accountId" IN (SELECT DISTINCT "accountId" FROM changed);
 ELSE
   UPDATE app."ExportAccountRevision" v SET "detailVersion"="detailVersion"+1
   WHERE v."accountId" IN (SELECT DISTINCT "accountId" FROM changed);
 END IF;
 UPDATE app."ExportRequest" e SET state='INVALIDATED'
 WHERE e.state IN ('QUEUED','PROCESSING','READY') AND EXISTS(
   SELECT 1 FROM app."ExportSource" s WHERE s."exportId"=e.id
   AND (TG_TABLE_NAME='BalanceSnapshot' OR s.level='TRANSACTIONS')
   AND s."accountId" IN (SELECT DISTINCT "accountId" FROM changed));
 RETURN NULL;
END $$;

CREATE FUNCTION app.invalidate_export_notes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   WITH pairs AS (
     SELECT "accountId","authorUserId" FROM changed UNION SELECT "accountId","authorUserId" FROM old_changed
   ), advanced AS (
     INSERT INTO app."ExportNoteRevision" AS n ("accountId","userId",version)
       SELECT p."accountId",p."authorUserId",1 FROM pairs p JOIN app."Account" a ON a.id=p."accountId" ORDER BY p."accountId",p."authorUserId"
     ON CONFLICT ("accountId","userId") DO UPDATE SET version=n.version+1
     RETURNING "accountId","userId"
   )
   UPDATE app."ExportRequest" e SET state='INVALIDATED'
   WHERE e.state IN ('QUEUED','PROCESSING','READY') AND EXISTS (
     SELECT 1 FROM app."ExportSource" s JOIN advanced n ON n."accountId"=s."accountId" AND n."userId"=e."userId"
     WHERE s."exportId"=e.id AND s.level='TRANSACTIONS');
 ELSE
   WITH advanced AS (
     INSERT INTO app."ExportNoteRevision" AS n ("accountId","userId",version)
       SELECT DISTINCT c."accountId",c."authorUserId",1 FROM changed c JOIN app."Account" a ON a.id=c."accountId" ORDER BY c."accountId",c."authorUserId"
     ON CONFLICT ("accountId","userId") DO UPDATE SET version=n.version+1
     RETURNING "accountId","userId"
   )
   UPDATE app."ExportRequest" e SET state='INVALIDATED'
   WHERE e.state IN ('QUEUED','PROCESSING','READY') AND EXISTS (
     SELECT 1 FROM app."ExportSource" s JOIN advanced n ON n."accountId"=s."accountId" AND n."userId"=e."userId"
     WHERE s."exportId"=e.id AND s.level='TRANSACTIONS');
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER export_note_insert ON app."TransactionNote";
DROP TRIGGER export_note_update ON app."TransactionNote";
DROP TRIGGER export_note_delete ON app."TransactionNote";
CREATE TRIGGER export_note_insert AFTER INSERT ON app."TransactionNote" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_notes();
CREATE TRIGGER export_note_update AFTER UPDATE ON app."TransactionNote" REFERENCING OLD TABLE AS old_changed NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_notes();
CREATE TRIGGER export_note_delete AFTER DELETE ON app."TransactionNote" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.invalidate_export_notes();

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
  LEFT JOIN app."ExportNoteRevision" n ON n."accountId"=s."accountId" AND n."userId"=e."userId"
  LEFT JOIN app."Membership" m ON m.id=s."membershipId" AND m."userId"=e."userId" AND m."householdId"=s."householdId"
  WHERE s."exportId"=e.id AND (a.id IS NULL OR v.version IS DISTINCT FROM s."sourceVersion" OR m.id IS NULL
   OR (s.level='TRANSACTIONS' AND (s."detailVersion" IS NULL OR s."noteVersion" IS NULL
     OR v."detailVersion" IS DISTINCT FROM s."detailVersion" OR n.version IS DISTINCT FROM s."noteVersion"))
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

CREATE OR REPLACE FUNCTION app.request_export(account_ids uuid[], is_archive boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE export_id uuid=gen_random_uuid(); account_id uuid; a app."Account"; m app."Membership";
 owner_access boolean; permission text; grant_version integer; household_id uuid;
BEGIN
 IF cardinality(account_ids) NOT BETWEEN 1 AND 50 OR
 (SELECT count(DISTINCT x) FROM unnest(account_ids) x)<>cardinality(account_ids)
 OR NOT coalesce(app.export_fresh_mfa(),false)
 OR NOT coalesce(CASE WHEN is_archive THEN app.archive_scope_is_valid() ELSE app.scope_is_valid() END,false)
 THEN RAISE EXCEPTION 'Export unavailable' USING ERRCODE='42501'; END IF;
 -- All account locks precede revision locks; mutation code follows this ordering.
 PERFORM 1 FROM app."Account" WHERE id=ANY(account_ids) ORDER BY id FOR SHARE;
 FOREACH account_id IN ARRAY account_ids LOOP
   SELECT * INTO a FROM app."Account" WHERE id=account_id;
   SELECT * INTO m FROM app."Membership" WHERE "userId"=nullif(current_setting('joint.user_id',true),'')::uuid AND "householdId"=a."householdId";
   IF a.id IS NULL OR m.id IS NULL OR NOT coalesce(CASE WHEN is_archive THEN app.archive_owns_account(account_id)
     ELSE app.account_access(account_id,'TOTALS') END,false)
   THEN RAISE EXCEPTION 'Export unavailable' USING ERRCODE='42501'; END IF;
   IF household_id IS NULL THEN
    household_id=a."householdId";
    INSERT INTO app."ExportRequest"(id,"userId","sessionId","membershipId","householdId",archive,"expiresAt")
    VALUES(export_id,m."userId",nullif(current_setting('joint.session_id',true),'')::uuid,
      CASE WHEN is_archive THEN NULL ELSE m.id END,household_id,is_archive,clock_timestamp()+interval '24 hours');
   END IF;
   owner_access=EXISTS(SELECT 1 FROM app."AccountOwner" o WHERE o."accountId"=account_id AND o."userId"=m."userId"
    AND o."membershipId"=m.id AND o.status=CASE WHEN is_archive THEN 'ARCHIVED'::app."AccountOwnerStatus" ELSE 'ACTIVE'::app."AccountOwnerStatus" END);
   permission='TRANSACTIONS'; grant_version=0;
   IF NOT owner_access THEN
     SELECT level::text,version INTO permission,grant_version FROM app."AccountGrant" WHERE "accountId"=account_id AND "membershipId"=m.id;
   END IF;
   PERFORM 1 FROM app."ExportAccountRevision" WHERE "accountId"=account_id FOR SHARE;
   IF permission='TRANSACTIONS' THEN
     -- Create even the zero epoch. Concurrent first-note insertion now shares
     -- this persistent row, rather than racing a missing-row COALESCE snapshot.
     INSERT INTO app."ExportNoteRevision" ("accountId","userId") VALUES (account_id,m."userId") ON CONFLICT DO NOTHING;
     PERFORM 1 FROM app."ExportNoteRevision" n WHERE n."accountId"=account_id AND n."userId"=m."userId" FOR SHARE;
   END IF;
   INSERT INTO app."ExportSource"("exportId","accountId","householdId","membershipId",level,owned,"grantVersion","sourceVersion","detailVersion","noteVersion")
   SELECT export_id,a.id,a."householdId",m.id,permission,owner_access,grant_version,v.version,
     CASE WHEN permission='TRANSACTIONS' THEN v."detailVersion" ELSE NULL END,
     CASE WHEN permission='TRANSACTIONS' THEN n.version ELSE NULL END
   FROM app."ExportAccountRevision" v LEFT JOIN app."ExportNoteRevision" n ON n."accountId"=v."accountId" AND n."userId"=m."userId"
   WHERE v."accountId"=a.id;
 END LOOP;
 INSERT INTO app."Job"(id,"householdId",type,"resourceId","idempotencyKey",payload)
 VALUES(gen_random_uuid(),household_id,'csv.export',export_id,'export:'||export_id::text||':0','{}'::jsonb);
 RETURN export_id;
END $$;

CREATE OR REPLACE FUNCTION app.lock_export_job(job_id uuid,lease_token uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE export_id uuid;
BEGIN
 SELECT j."resourceId" INTO export_id FROM app."Job" j WHERE j.id=job_id AND j.type='csv.export'
 AND j.state='LEASED' AND j."leaseToken"=lease_token AND j."leaseUntil">clock_timestamp() FOR UPDATE;
 IF export_id IS NULL THEN RAISE EXCEPTION 'Export unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app."Account" a JOIN app."ExportSource" s ON s."accountId"=a.id WHERE s."exportId"=export_id ORDER BY a.id FOR SHARE OF a;
 PERFORM 1 FROM app."ExportAccountRevision" v JOIN app."ExportSource" s ON s."accountId"=v."accountId" WHERE s."exportId"=export_id ORDER BY v."accountId" FOR SHARE OF v;
 PERFORM 1 FROM app."ExportNoteRevision" n JOIN app."ExportSource" s ON s."accountId"=n."accountId"
 JOIN app."ExportRequest" e ON e.id=s."exportId" AND e."userId"=n."userId"
 WHERE s."exportId"=export_id AND s.level='TRANSACTIONS' ORDER BY n."accountId",n."userId" FOR SHARE OF n;
 PERFORM 1 FROM app."ExportRequest" WHERE id=export_id FOR UPDATE;
 IF NOT coalesce(app.export_fence(export_id),false) THEN
  UPDATE app."ExportRequest" SET state='INVALIDATED' WHERE id=export_id AND state IN ('QUEUED','PROCESSING','READY');
  RETURN NULL;
 END IF;
 RETURN export_id;
END $$;

CREATE OR REPLACE FUNCTION app.export_download_chunk(export_id uuid,chunk_sequence integer)
RETURNS TABLE(ciphertext text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT coalesce(app.export_actor(export_id),false) OR NOT coalesce(app.export_fresh_mfa(),false) THEN RETURN; END IF;
 PERFORM 1 FROM app."Account" a JOIN app."ExportSource" s ON s."accountId"=a.id WHERE s."exportId"=export_id ORDER BY a.id FOR SHARE OF a;
 PERFORM 1 FROM app."ExportAccountRevision" v JOIN app."ExportSource" s ON s."accountId"=v."accountId" WHERE s."exportId"=export_id ORDER BY v."accountId" FOR SHARE OF v;
 PERFORM 1 FROM app."ExportNoteRevision" n JOIN app."ExportSource" s ON s."accountId"=n."accountId"
 JOIN app."ExportRequest" e ON e.id=s."exportId" AND e."userId"=n."userId"
 WHERE s."exportId"=export_id AND s.level='TRANSACTIONS' ORDER BY n."accountId",n."userId" FOR SHARE OF n;
 IF NOT coalesce(app.export_fence(export_id),false) THEN RETURN; END IF;
 RETURN QUERY SELECT c.ciphertext FROM app."ExportChunk" c JOIN app."ExportRequest" e ON e.id=c."exportId"
 WHERE e.id=export_id AND e.state='READY' AND e."downloadExpiresAt">clock_timestamp() AND c.sequence=chunk_sequence;
END $$;

CREATE OR REPLACE FUNCTION app.export_records(export_id uuid,after_key text)
RETURNS TABLE(key text,record_data jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH sources AS MATERIALIZED (SELECT s.*,e."userId" FROM app."ExportSource" s JOIN app."ExportRequest" e ON e.id=s."exportId" WHERE e.id=export_id),
 visible AS NOT MATERIALIZED (
  SELECT t.*,a.kind AS account_kind FROM app."Transaction" t JOIN app."Account" a ON a.id=t."accountId" JOIN sources s ON s."accountId"=t."accountId" AND s.level='TRANSACTIONS'
  WHERE t."originImportBatchId" IS NULL OR EXISTS(SELECT 1 FROM app."ImportBatch" b WHERE b.id=t."originImportBatchId" AND b.state='COMMITTED')
 ), records AS ((
 SELECT '1:'||a.id::text AS key,jsonb_build_object('recordType','ACCOUNT','accountId',a.id,'recordId',a.id,'label',a.label,'currency',a.currency,
  'details',jsonb_build_object('kind',a.kind,'legalOwnerKind',a."legalOwnerKind",'liquidity',a.liquidity,'createdAt',a."createdAt")::text) AS record_data
 FROM app."Account" a JOIN sources s ON s."accountId"=a.id
 WHERE left(after_key,2)<='1:' AND CASE WHEN left(after_key,2)='1:' THEN a.id>substring(after_key FROM 3)::uuid ELSE true END
 ORDER BY a.id LIMIT 500)
 UNION ALL
( SELECT '2:'||b.id::text,jsonb_build_object('recordType','BALANCE','accountId',b."accountId",'recordId',b.id,'date',b."asOfDate"::text,
  'amountMinor',b."amountMinor"::text,'currency',b.currency,'details',jsonb_build_object('complete',b.complete,'source',b.source,'createdAt',b."createdAt")::text)
 FROM app."BalanceSnapshot" b JOIN sources s ON s."accountId"=b."accountId"
 WHERE left(after_key,2)<='2:' AND CASE WHEN left(after_key,2)='2:' THEN b.id>substring(after_key FROM 3)::uuid ELSE true END
 ORDER BY b.id LIMIT 500)
 UNION ALL
( SELECT '3:'||t.id::text,jsonb_strip_nulls(jsonb_build_object('recordType','TRANSACTION','accountId',t."accountId",'recordId',t.id,'date',t."bookedDate"::text,
 'amountMinor',t."amountMinor"::text,'currency',t.currency,'description',t.description,'category',o.category,'classification',o."classificationKind",
 'details',jsonb_build_object('source',t."sourceNamespace",'sourceId',t."sourceId",'sourceHash',t."sourceHash",'fingerprint',t.fingerprint,
  'classificationKind',o."classificationKind",'effectiveKind',CASE WHEN EXISTS(SELECT 1 FROM app."TransactionSplit" z WHERE z."transactionId"=t.id) THEN NULL ELSE coalesce(o."classificationKind"::text,CASE WHEN t."amountMinor"<0 AND t.account_kind IN ('CURRENT','SAVINGS','CREDIT_CARD') THEN 'EXPENSE' ELSE 'UNCLASSIFIED' END) END,'classificationConfirmed',o."classificationKind" IS NOT NULL OR EXISTS(SELECT 1 FROM app."TransactionSplit" z WHERE z."transactionId"=t.id),'csvRowNumber',t."csvRowNumber",'status',t.status,'version',t.version,'merchant',o.merchant,'createdAt',t."createdAt")::text))
 FROM visible t LEFT JOIN app."TransactionOverride" o ON o."transactionId"=t.id
 WHERE left(after_key,2)<='3:' AND CASE WHEN left(after_key,2)='3:' THEN t.id>substring(after_key FROM 3)::uuid ELSE true END
 ORDER BY t.id LIMIT 500)
 UNION ALL
( SELECT '4:'||r.id::text,jsonb_build_object('recordType','REVISION','accountId',r."accountId",'recordId',r.id,'date',r."createdAt"::text,
 'details',jsonb_build_object('transactionId',r."transactionId",'version',r.version,'kind',r.kind,
 'data',app.export_revision_data(r.data,r.kind::text))::text)
 FROM app."TransactionRevision" r JOIN visible t ON t.id=r."transactionId"
 WHERE left(after_key,2)<='4:' AND CASE WHEN left(after_key,2)='4:' THEN r.id>substring(after_key FROM 3)::uuid ELSE true END
 ORDER BY r.id LIMIT 500)
 UNION ALL
( SELECT '5:'||p.id::text,jsonb_strip_nulls(jsonb_build_object('recordType','SPLIT','accountId',p."accountId",'recordId',p.id,
 'amountMinor',p."amountMinor"::text,'currency',t.currency,'category',p.category,'classification',p."classificationKind",
 'details',jsonb_build_object('transactionId',t.id,'position',p.position)::text))
 FROM app."TransactionSplit" p JOIN visible t ON t.id=p."transactionId"
 WHERE left(after_key,2)<='5:' AND CASE WHEN left(after_key,2)='5:' THEN p.id>substring(after_key FROM 3)::uuid ELSE true END
 ORDER BY p.id LIMIT 500)
 UNION ALL
( SELECT '6:'||n."transactionId"::text,jsonb_strip_nulls(jsonb_build_object('recordType','NOTE','accountId',n."accountId",'recordId',n."transactionId",'note',n.body,
 'details',jsonb_build_object('version',n.version,'createdAt',n."createdAt",'updatedAt',n."updatedAt")::text))
 FROM app."TransactionNote" n JOIN visible t ON t.id=n."transactionId" JOIN sources s ON s."accountId"=n."accountId" AND s."userId"=n."authorUserId"
 WHERE left(after_key,2)<='6:' AND CASE WHEN left(after_key,2)='6:' THEN n."transactionId">substring(after_key FROM 3)::uuid ELSE true END
 ORDER BY n."transactionId" LIMIT 500)
 ) SELECT records.key,records.record_data FROM records WHERE records.key>after_key ORDER BY records.key LIMIT 500
$$;

REVOKE ALL ON FUNCTION app.invalidate_export_notes() FROM PUBLIC;
COMMIT;
