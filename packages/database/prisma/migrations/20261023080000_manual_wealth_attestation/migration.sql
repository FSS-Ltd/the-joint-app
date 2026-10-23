BEGIN;

-- NULL deliberately preserves unknown ownership for existing evidence.
ALTER TABLE app."BalanceSnapshot" ADD COLUMN "adultAmountMinor" bigint;
ALTER TABLE app."BalanceSnapshot" ADD CONSTRAINT balance_adult_portion CHECK (
 "adultAmountMinor" IS NULL OR
 ("amountMinor" >= 0 AND "adultAmountMinor" >= 0 AND "adultAmountMinor" <= "amountMinor") OR
 ("amountMinor" < 0 AND "adultAmountMinor" = "amountMinor")
);

-- Invoker privileges preserve the caller's existing account/RLS boundary.
CREATE FUNCTION app.validate_balance_adult_portion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE account_kind app."AccountKind";
BEGIN
 SELECT kind INTO account_kind FROM app."Account"
 WHERE id=NEW."accountId" AND "householdId"=NEW."householdId";
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Valuation account is unavailable' USING ERRCODE='42501';
 END IF;
 IF account_kind IN ('CREDIT_CARD','LOAN','MORTGAGE','OTHER_LIABILITY') AND
   (NEW."amountMinor" < 0 OR
    (NEW."adultAmountMinor" IS NOT NULL AND NEW."adultAmountMinor" <> NEW."amountMinor")) THEN
  RAISE EXCEPTION 'Liability valuation must use the full outstanding amount' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.validate_balance_adult_portion() FROM PUBLIC;
CREATE TRIGGER balance_adult_portion_guard
 BEFORE INSERT OR UPDATE OF "accountId","householdId","amountMinor","adultAmountMinor"
 ON app."BalanceSnapshot" FOR EACH ROW EXECUTE FUNCTION app.validate_balance_adult_portion();

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
  'amountMinor',b."amountMinor"::text,'currency',b.currency,'details',jsonb_build_object('complete',b.complete,'source',b.source,'createdAt',b."createdAt",'adultAmountMinor',b."adultAmountMinor"::text)::text)
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

COMMIT;
