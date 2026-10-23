BEGIN;
CREATE FUNCTION app.import_overlap_candidates(account_id uuid, fingerprints text[])
RETURNS TABLE(fingerprint text, "transactionId" uuid, "bookedDate" date, "amountMinor" bigint, currency text, description text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 WITH allowed AS MATERIALIZED (
   SELECT a.id FROM app."Account" a WHERE a.id = account_id
     AND (app.owns_account(a.id) OR app.import_job_account(a.id))
     AND coalesce(array_length(fingerprints, 1),0) <= 50000
 ), candidates AS (
   SELECT t.fingerprint, t.id, t."bookedDate", t."amountMinor", t.currency, t.description,
     row_number() OVER (PARTITION BY t.fingerprint ORDER BY t."bookedDate" DESC,t.id) AS position
   FROM allowed a JOIN app."Transaction" t ON t."accountId"=a.id
   LEFT JOIN app."ImportBatch" b ON b.id=t."originImportBatchId"
   WHERE t.fingerprint=ANY(fingerprints) AND t.status='BOOKED'
     AND (t."originImportBatchId" IS NULL OR b.state='COMMITTED')
 ) SELECT c.fingerprint::text,c.id,c."bookedDate",c."amountMinor",c.currency::text,c.description::text
 FROM candidates c WHERE c.position <= 5
$$;
REVOKE ALL ON FUNCTION app.import_overlap_candidates(uuid,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.import_overlap_candidates(uuid,text[]) TO joint_app_runtime;
COMMIT;
