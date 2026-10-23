BEGIN;
-- Revision payloads contain only source history and classification fields. No
-- membership, author, transfer counterpart, or private-note identifiers escape.
CREATE FUNCTION app.export_revision_fields(value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_strip_nulls(jsonb_build_object('bookedDate',value->'bookedDate',
  'money',CASE WHEN value?'money' THEN jsonb_strip_nulls(jsonb_build_object('amountMinor',value->'money'->'amountMinor','currency',value->'money'->'currency')) ELSE NULL END,
  'amountMinor',value->'amountMinor','description',value->'description','currency',value->'currency',
  'category',value->'category','classificationKind',value->'classificationKind','merchant',value->'merchant','position',value->'position','source',value->'source'))
$$;
CREATE FUNCTION app.export_revision_data(value jsonb,kind text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN kind='SPLIT' THEN jsonb_build_object(
  'before',(SELECT coalesce(jsonb_agg(app.export_revision_fields(x)), '[]'::jsonb) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(value->'before')='array' THEN value->'before' ELSE '[]'::jsonb END) x),
  'after',(SELECT coalesce(jsonb_agg(app.export_revision_fields(x)), '[]'::jsonb) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(value->'after')='array' THEN value->'after' ELSE '[]'::jsonb END) x))
 WHEN kind IN ('CLASSIFICATION','TRANSFER_CONFIRM','TRANSFER_REMOVE') THEN jsonb_build_object('before',app.export_revision_fields(value->'before'),'after',app.export_revision_fields(value->'after'))
 ELSE app.export_revision_fields(value) END
$$;
REVOKE ALL ON FUNCTION app.export_revision_fields(jsonb),app.export_revision_data(jsonb,text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION app.export_records(export_id uuid,after_key text)
RETURNS TABLE(key text,record_data jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH sources AS MATERIALIZED (SELECT s.*,e."userId" FROM app."ExportSource" s JOIN app."ExportRequest" e ON e.id=s."exportId" WHERE e.id=export_id),
 visible AS NOT MATERIALIZED (
  SELECT t.*,a.kind AS account_kind FROM app."Transaction" t JOIN app."Account" a ON a.id=t."accountId" JOIN sources s ON s."accountId"=t."accountId" AND s.level='TRANSACTIONS'
  WHERE t."originImportBatchId" IS NULL OR EXISTS(SELECT 1 FROM app."ImportBatch" b WHERE b.id=t."originImportBatchId" AND b.state='COMMITTED')
 ), records AS ((
 SELECT '1:'||a.id::text AS key,jsonb_build_object('recordType','ACCOUNT','accountId',a.id,'recordId',a.id,'label',a.label,'currency',a.currency,
  'details',jsonb_build_object('kind',a.kind,'legalOwnerKind',a."legalOwnerKind",'liquidity',a.liquidity,'version',a.version,'createdAt',a."createdAt")::text) AS record_data
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

COMMIT;
