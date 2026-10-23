BEGIN;
CREATE TABLE app."ExportRequest" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES app."User"(id) ON DELETE CASCADE,
 "sessionId" uuid NOT NULL REFERENCES app."SessionRegistry"(id) ON DELETE CASCADE,
 "membershipId" uuid REFERENCES app."Membership"(id) ON DELETE CASCADE,
 "householdId" uuid NOT NULL REFERENCES app."Household"(id) ON DELETE CASCADE,
 archive boolean NOT NULL, state varchar(20) NOT NULL DEFAULT 'QUEUED'
 CHECK (state IN ('QUEUED','PROCESSING','READY','INVALIDATED','EXPIRED','FAILED')),
 cursor varchar(100) NOT NULL DEFAULT '', "chunkCount" integer NOT NULL DEFAULT 0 CHECK ("chunkCount">=0),
 "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(), "expiresAt" timestamptz(3) NOT NULL,
 "downloadExpiresAt" timestamptz(3)
);
CREATE INDEX "ExportRequest_expiresAt_idx" ON app."ExportRequest"("expiresAt");
CREATE TABLE app."ExportAccountRevision" (
 "accountId" uuid PRIMARY KEY REFERENCES app."Account"(id) ON DELETE CASCADE, version bigint NOT NULL DEFAULT 0
);
INSERT INTO app."ExportAccountRevision"("accountId") SELECT id FROM app."Account";
CREATE TABLE app."ExportSource" (
 "exportId" uuid NOT NULL REFERENCES app."ExportRequest"(id) ON DELETE CASCADE,
 "accountId" uuid NOT NULL REFERENCES app."Account"(id) ON DELETE CASCADE,
 "householdId" uuid NOT NULL, "membershipId" uuid NOT NULL, level varchar(20) NOT NULL CHECK(level IN ('TOTALS','TRANSACTIONS')),
 owned boolean NOT NULL, "grantVersion" integer NOT NULL, "sourceVersion" bigint NOT NULL,
 PRIMARY KEY("exportId","accountId")
);
CREATE INDEX "ExportSource_accountId_idx" ON app."ExportSource"("accountId");
CREATE TABLE app."ExportChunk" (
 "exportId" uuid NOT NULL REFERENCES app."ExportRequest"(id) ON DELETE CASCADE,
 sequence integer NOT NULL CHECK(sequence>=0), ciphertext text NOT NULL, PRIMARY KEY("exportId",sequence)
);
ALTER TABLE app."ExportRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ExportRequest" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."ExportSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ExportSource" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."ExportChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ExportChunk" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."ExportAccountRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ExportAccountRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."ExportRequest" TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY maintenance ON app."ExportSource" TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY maintenance ON app."ExportChunk" TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY maintenance ON app."ExportAccountRevision" TO CURRENT_USER USING(true) WITH CHECK(true);

-- Any affected source change permanently invalidates its exports. Restoring a
-- permission can never restore a prior object. No household revision is exposed.
CREATE FUNCTION app.invalidate_account_exports() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account_id uuid;
BEGIN
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
CREATE TRIGGER export_account_change AFTER INSERT OR UPDATE OR DELETE ON app."Account" FOR EACH ROW EXECUTE FUNCTION app.invalidate_account_exports();
CREATE TRIGGER export_grant_change AFTER INSERT OR UPDATE OR DELETE ON app."AccountGrant" FOR EACH ROW EXECUTE FUNCTION app.invalidate_account_exports();
CREATE TRIGGER export_owner_change AFTER INSERT OR UPDATE OR DELETE ON app."AccountOwner" FOR EACH ROW EXECUTE FUNCTION app.invalidate_account_exports();
CREATE TRIGGER export_balance_change AFTER INSERT OR UPDATE OR DELETE ON app."BalanceSnapshot" FOR EACH ROW EXECUTE FUNCTION app.invalidate_account_exports();
CREATE TRIGGER export_transaction_change AFTER INSERT OR UPDATE OR DELETE ON app."Transaction" FOR EACH ROW EXECUTE FUNCTION app.invalidate_account_exports();
CREATE TRIGGER export_revision_change AFTER INSERT OR UPDATE OR DELETE ON app."TransactionRevision" FOR EACH ROW EXECUTE FUNCTION app.invalidate_account_exports();
CREATE TRIGGER export_override_change AFTER INSERT OR UPDATE OR DELETE ON app."TransactionOverride" FOR EACH ROW EXECUTE FUNCTION app.invalidate_account_exports();
CREATE TRIGGER export_note_change AFTER INSERT OR UPDATE OR DELETE ON app."TransactionNote" FOR EACH ROW EXECUTE FUNCTION app.invalidate_account_exports();
CREATE TRIGGER export_split_change AFTER INSERT OR UPDATE OR DELETE ON app."TransactionSplit" FOR EACH ROW EXECUTE FUNCTION app.invalidate_account_exports();
CREATE TRIGGER export_import_change AFTER INSERT OR UPDATE OR DELETE ON app."ImportBatch" FOR EACH ROW EXECUTE FUNCTION app.invalidate_account_exports();
CREATE OR REPLACE FUNCTION app.invalidate_household_privacy_exports(household_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE app."ExportRequest" e SET state='INVALIDATED' WHERE e.state IN ('QUEUED','PROCESSING','READY')
 AND EXISTS(SELECT 1 FROM app."ExportSource" s WHERE s."exportId"=e.id AND s."householdId"=household_id)
$$;

CREATE FUNCTION app.export_fresh_mfa() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT current_setting('joint.aal',true)='aal2'
 AND nullif(current_setting('joint.mfa_authenticated_at',true),'')::numeric
 BETWEEN extract(epoch FROM clock_timestamp())*1000-300000 AND extract(epoch FROM clock_timestamp())*1000
$$;

-- Internal complete fence: caller session plus each source's original permission,
-- membership and monotonic source revision. No authority comes from a job payload.
CREATE FUNCTION app.export_fence(export_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS (SELECT 1 FROM app."ExportRequest" e
 JOIN app."User" u ON u.id=e."userId" AND u.status='ACTIVE'
 JOIN app."SessionRegistry" r ON r.id=e."sessionId" AND r."userId"=e."userId"
   AND r."revokedAt" IS NULL AND r."expiresAt">clock_timestamp() AND r.purpose='NORMAL'
 WHERE e.id=export_id AND e.state IN ('QUEUED','PROCESSING','READY') AND e."expiresAt">clock_timestamp()
 AND EXISTS(SELECT 1 FROM app."ExportSource" s WHERE s."exportId"=e.id)
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

CREATE FUNCTION app.request_export(account_ids uuid[], is_archive boolean) RETURNS uuid
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
   INSERT INTO app."ExportSource"("exportId","accountId","householdId","membershipId",level,owned,"grantVersion","sourceVersion")
   SELECT export_id,a.id,a."householdId",m.id,permission,owner_access,grant_version,version
    FROM app."ExportAccountRevision" WHERE "accountId"=a.id;
 END LOOP;
 INSERT INTO app."Job"(id,"householdId",type,"resourceId","idempotencyKey",payload)
 VALUES(gen_random_uuid(),household_id,'csv.export',export_id,'export:'||export_id::text||':0','{}'::jsonb);
 RETURN export_id;
END $$;

CREATE FUNCTION app.export_actor(export_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app."ExportRequest" e WHERE e.id=export_id
  AND e."userId"=nullif(current_setting('joint.user_id',true),'')::uuid
  AND e."sessionId"=nullif(current_setting('joint.session_id',true),'')::uuid
  AND CASE WHEN e.archive THEN app.archive_scope_is_valid() ELSE app.scope_is_valid() END)
$$;
CREATE FUNCTION app.export_status(export_id uuid)
RETURNS TABLE(id uuid,state text,"createdAt" timestamptz,"expiresAt" timestamptz,"downloadExpiresAt" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT coalesce(app.export_actor(export_id),false) THEN RETURN; END IF;
 UPDATE app."ExportRequest" e SET state=CASE WHEN e."expiresAt"<=clock_timestamp() THEN 'EXPIRED' ELSE 'INVALIDATED' END
 WHERE e.id=export_id AND e.state IN ('QUEUED','PROCESSING','READY') AND NOT app.export_fence(export_id);
 RETURN QUERY SELECT e.id,e.state::text,e."createdAt",e."expiresAt",e."downloadExpiresAt" FROM app."ExportRequest" e WHERE e.id=export_id;
END $$;

CREATE FUNCTION app.lock_export_job(job_id uuid,lease_token uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE export_id uuid;
BEGIN
 SELECT j."resourceId" INTO export_id FROM app."Job" j WHERE j.id=job_id AND j.type='csv.export'
 AND j.state='LEASED' AND j."leaseToken"=lease_token AND j."leaseUntil">clock_timestamp() FOR UPDATE;
 IF export_id IS NULL THEN RAISE EXCEPTION 'Export unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app."Account" a JOIN app."ExportSource" s ON s."accountId"=a.id WHERE s."exportId"=export_id ORDER BY a.id FOR SHARE OF a;
 PERFORM 1 FROM app."ExportAccountRevision" v JOIN app."ExportSource" s ON s."accountId"=v."accountId" WHERE s."exportId"=export_id ORDER BY v."accountId" FOR SHARE OF v;
 PERFORM 1 FROM app."ExportRequest" WHERE id=export_id FOR UPDATE;
 IF NOT coalesce(app.export_fence(export_id),false) THEN
  UPDATE app."ExportRequest" SET state='INVALIDATED' WHERE id=export_id AND state IN ('QUEUED','PROCESSING','READY');
  RETURN NULL;
 END IF;
 RETURN export_id;
END $$;

-- Each result row is one CSV record. Keyset cursor spans all record types;
-- transaction history has its own pages rather than nested unbounded arrays.
CREATE FUNCTION app.export_records(export_id uuid,after_key text)
RETURNS TABLE(key text,record_data jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH sources AS MATERIALIZED (SELECT s.*,e."userId" FROM app."ExportSource" s JOIN app."ExportRequest" e ON e.id=s."exportId" WHERE e.id=export_id),
 visible AS NOT MATERIALIZED (
  SELECT t.* FROM app."Transaction" t JOIN sources s ON s."accountId"=t."accountId" AND s.level='TRANSACTIONS'
  WHERE t."originImportBatchId" IS NULL OR EXISTS(SELECT 1 FROM app."ImportBatch" b WHERE b.id=t."originImportBatchId" AND b.state='COMMITTED')
 ), records AS (
 SELECT '1:'||a.id::text AS key,jsonb_build_object('recordType','ACCOUNT','accountId',a.id,'recordId',a.id,'label',a.label,'currency',a.currency,
  'details',jsonb_build_object('kind',a.kind,'legalOwnerKind',a."legalOwnerKind",'liquidity',a.liquidity,'version',a.version,'createdAt',a."createdAt")::text) AS record_data
 FROM app."Account" a JOIN sources s ON s."accountId"=a.id
 UNION ALL
 SELECT '2:'||b.id::text,jsonb_build_object('recordType','BALANCE','accountId',b."accountId",'recordId',b.id,'date',b."asOfDate"::text,
  'amountMinor',b."amountMinor"::text,'currency',b.currency,'details',jsonb_build_object('complete',b.complete,'source',b.source,'createdAt',b."createdAt")::text)
 FROM app."BalanceSnapshot" b JOIN sources s ON s."accountId"=b."accountId"
 UNION ALL
 SELECT '3:'||t.id::text,jsonb_strip_nulls(jsonb_build_object('recordType','TRANSACTION','accountId',t."accountId",'recordId',t.id,'date',t."bookedDate"::text,
 'amountMinor',t."amountMinor"::text,'currency',t.currency,'description',t.description,'category',o.category,'classification',o."classificationKind",
 'details',jsonb_build_object('source',t."sourceNamespace",'sourceId',t."sourceId",'sourceHash',t."sourceHash",'fingerprint',t.fingerprint,
  'csvRowNumber',t."csvRowNumber",'status',t.status,'version',t.version,'merchant',o.merchant,'createdAt',t."createdAt")::text))
 FROM visible t LEFT JOIN app."TransactionOverride" o ON o."transactionId"=t.id
 UNION ALL
 SELECT '4:'||r.id::text,jsonb_build_object('recordType','REVISION','accountId',r."accountId",'recordId',r.id,'date',r."createdAt"::text,
 'details',jsonb_build_object('transactionId',r."transactionId",'version',r.version,'kind',r.kind,
 'data',CASE WHEN r.kind IN ('SPLIT','CLASSIFICATION') THEN jsonb_build_object('before',r.data->'before','after',r.data->'after')
 ELSE jsonb_strip_nulls(jsonb_build_object('bookedDate',r.data->'bookedDate','money',r.data->'money','amountMinor',r.data->'amountMinor',
  'description',r.data->'description','currency',r.data->'currency','category',r.data->'category','classificationKind',r.data->'classificationKind')) END)::text)
 FROM app."TransactionRevision" r JOIN visible t ON t.id=r."transactionId"
 UNION ALL
 SELECT '5:'||p.id::text,jsonb_strip_nulls(jsonb_build_object('recordType','SPLIT','accountId',p."accountId",'recordId',p.id,
 'amountMinor',p."amountMinor"::text,'currency',t.currency,'category',p.category,'classification',p."classificationKind",
 'details',jsonb_build_object('transactionId',t.id,'position',p.position)::text))
 FROM app."TransactionSplit" p JOIN visible t ON t.id=p."transactionId"
 UNION ALL
 SELECT '6:'||n."transactionId"::text,jsonb_strip_nulls(jsonb_build_object('recordType','NOTE','accountId',n."accountId",'recordId',n."transactionId",'note',n.body,
 'details',jsonb_build_object('version',n.version,'createdAt',n."createdAt",'updatedAt',n."updatedAt")::text))
 FROM app."TransactionNote" n JOIN visible t ON t.id=n."transactionId" JOIN sources s ON s."accountId"=n."accountId" AND s."userId"=n."authorUserId"
 ) SELECT records.key,records.record_data FROM records WHERE records.key>after_key ORDER BY records.key LIMIT 500
$$;
CREATE FUNCTION app.export_job_page(job_id uuid,lease_token uuid)
RETURNS TABLE("exportId" uuid,"sequence" integer,"cursor" text,"records" jsonb,"nextCursor" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE export_id uuid;
BEGIN
 export_id=app.lock_export_job(job_id,lease_token);
 IF export_id IS NULL THEN RETURN; END IF;
 RETURN QUERY SELECT e.id,e."chunkCount",e.cursor::text,coalesce(jsonb_agg(p.record_data ORDER BY p.key) FILTER(WHERE p.key IS NOT NULL),'[]'::jsonb),coalesce(max(p.key),e.cursor)::text
 FROM app."ExportRequest" e LEFT JOIN LATERAL app.export_records(e.id,e.cursor) p ON true
 WHERE e.id=export_id AND e.state IN ('QUEUED','PROCESSING') GROUP BY e.id;
END $$;
CREATE FUNCTION app.store_export_chunk(job_id uuid,lease_token uuid,expected_sequence integer,next_cursor text,ciphertext text,finished boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE export_id uuid; e app."ExportRequest"; next_job uuid=gen_random_uuid();
BEGIN
 export_id=app.lock_export_job(job_id,lease_token);
 IF export_id IS NULL THEN RETURN false; END IF;
 SELECT * INTO e FROM app."ExportRequest" WHERE id=export_id;
 IF e."chunkCount"<>expected_sequence OR e.state NOT IN ('QUEUED','PROCESSING') OR length(ciphertext)>5000000
 OR length(next_cursor)>100 OR next_cursor<e.cursor OR ciphertext NOT LIKE 'v1.%' THEN
  RAISE EXCEPTION 'Export unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO app."ExportChunk"("exportId",sequence,ciphertext) VALUES(export_id,expected_sequence,ciphertext);
 UPDATE app."ExportRequest" SET "chunkCount"="chunkCount"+1,cursor=next_cursor,
 state=CASE WHEN finished THEN 'READY' ELSE 'PROCESSING' END,
 "downloadExpiresAt"=CASE WHEN finished THEN least("expiresAt",clock_timestamp()+interval '15 minutes') ELSE NULL END WHERE id=export_id;
 IF NOT finished THEN
  INSERT INTO app."Job"(id,"householdId",type,"resourceId","idempotencyKey",payload)
  VALUES(next_job,e."householdId",'csv.export',export_id,'export:'||export_id::text||':'||(expected_sequence+1)::text,'{}'::jsonb);
 END IF;
 RETURN true;
END $$;
CREATE FUNCTION app.export_download_chunk(export_id uuid,chunk_sequence integer)
RETURNS TABLE(ciphertext text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT coalesce(app.export_actor(export_id),false) OR NOT coalesce(app.export_fresh_mfa(),false) THEN RETURN; END IF;
 PERFORM 1 FROM app."Account" a JOIN app."ExportSource" s ON s."accountId"=a.id WHERE s."exportId"=export_id ORDER BY a.id FOR SHARE OF a;
 PERFORM 1 FROM app."ExportAccountRevision" v JOIN app."ExportSource" s ON s."accountId"=v."accountId" WHERE s."exportId"=export_id ORDER BY v."accountId" FOR SHARE OF v;
 IF NOT coalesce(app.export_fence(export_id),false) THEN RETURN; END IF;
 RETURN QUERY SELECT c.ciphertext FROM app."ExportChunk" c JOIN app."ExportRequest" e ON e.id=c."exportId"
 WHERE e.id=export_id AND e.state='READY' AND e."downloadExpiresAt">clock_timestamp() AND c.sequence=chunk_sequence;
END $$;
CREATE FUNCTION app.expire_export_objects() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected integer;
BEGIN
 WITH expired AS(SELECT id FROM app."ExportRequest" WHERE "expiresAt"<=clock_timestamp() AND state<>'EXPIRED' ORDER BY "expiresAt" LIMIT 100 FOR UPDATE SKIP LOCKED)
 UPDATE app."ExportRequest" e SET state='EXPIRED' FROM expired x WHERE e.id=x.id;
 DELETE FROM app."ExportChunk" c WHERE c."exportId" IN(SELECT id FROM app."ExportRequest" e WHERE "expiresAt"<=clock_timestamp() AND EXISTS(SELECT 1 FROM app."ExportChunk" x WHERE x."exportId"=e.id) ORDER BY "expiresAt" LIMIT 100);
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected;
END $$;
REVOKE ALL ON FUNCTION app.invalidate_account_exports(),app.invalidate_household_privacy_exports(uuid),app.export_fresh_mfa(),app.export_fence(uuid),app.export_actor(uuid),app.export_records(uuid,text),app.lock_export_job(uuid,uuid),app.request_export(uuid[],boolean),app.export_status(uuid),app.export_job_page(uuid,uuid),app.store_export_chunk(uuid,uuid,integer,text,text,boolean),app.export_download_chunk(uuid,integer),app.expire_export_objects() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.request_export(uuid[],boolean),app.export_status(uuid),app.export_job_page(uuid,uuid),app.store_export_chunk(uuid,uuid,integer,text,text,boolean),app.export_download_chunk(uuid,integer),app.expire_export_objects() TO joint_app_runtime;
COMMIT;
