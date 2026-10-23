BEGIN;
-- CreateEnum
CREATE TYPE "app"."ImportBatchState" AS ENUM ('QUEUED', 'PREVIEWING', 'READY', 'COMMITTING', 'COMMITTED', 'ROLLED_BACK', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "app"."TransactionSource" AS ENUM ('CSV', 'MANUAL');

-- CreateEnum
CREATE TYPE "app"."TransactionStatus" AS ENUM ('BOOKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "app"."TransactionRevisionKind" AS ENUM ('CREATED', 'MANUAL_CORRECTION', 'CLASSIFICATION');

-- CreateTable
CREATE TABLE "app"."ImportBatch" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "requestedByMembershipId" UUID NOT NULL,
    "fileChecksum" CHAR(64) NOT NULL,
    "mappingHash" CHAR(64) NOT NULL,
    "mapping" JSONB NOT NULL,
    "parserVersion" VARCHAR(40) NOT NULL,
    "state" "app"."ImportBatchState" NOT NULL DEFAULT 'QUEUED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "preview" JSONB NOT NULL DEFAULT '[]',
    "decisions" JSONB NOT NULL DEFAULT '{}',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "overlapRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "committedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "failureCode" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "committedAt" TIMESTAMPTZ(3),
    "rolledBackAt" TIMESTAMPTZ(3),
    "previewExpiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ImportObject" (
    "batchId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "ciphertext" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ImportObject_pkey" PRIMARY KEY ("batchId")
);

-- CreateTable
CREATE TABLE "app"."Transaction" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'GBP',
    "sourceNamespace" "app"."TransactionSource" NOT NULL,
    "sourceId" VARCHAR(160) NOT NULL,
    "sourceHash" CHAR(64) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "bookedDate" DATE NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "status" "app"."TransactionStatus" NOT NULL DEFAULT 'BOOKED',
    "originImportBatchId" UUID,
    "csvRowNumber" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."TransactionRevision" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "app"."TransactionRevisionKind" NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."TransactionOverride" (
    "transactionId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "authorMembershipId" UUID NOT NULL,
    "category" VARCHAR(80),
    "merchant" VARCHAR(120),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransactionOverride_pkey" PRIMARY KEY ("transactionId")
);

-- CreateTable
CREATE TABLE "app"."TransactionNote" (
    "transactionId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "authorMembershipId" UUID NOT NULL,
    "body" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransactionNote_pkey" PRIMARY KEY ("transactionId","authorUserId")
);

-- CreateIndex
CREATE INDEX "ImportBatch_householdId_accountId_createdAt_id_idx" ON "app"."ImportBatch"("householdId", "accountId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_accountId_fileChecksum_key" ON "app"."ImportBatch"("accountId", "fileChecksum");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_householdId_accountId_id_key" ON "app"."ImportBatch"("householdId", "accountId", "id");

-- CreateIndex
CREATE INDEX "ImportObject_expiresAt_idx" ON "app"."ImportObject"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportObject_householdId_accountId_batchId_key" ON "app"."ImportObject"("householdId", "accountId", "batchId");

-- CreateIndex
CREATE INDEX "Transaction_householdId_accountId_bookedDate_id_idx" ON "app"."Transaction"("householdId", "accountId", "bookedDate" DESC, "id");

-- CreateIndex
CREATE INDEX "Transaction_accountId_fingerprint_idx" ON "app"."Transaction"("accountId", "fingerprint");

-- CreateIndex
CREATE INDEX "Transaction_originImportBatchId_idx" ON "app"."Transaction"("originImportBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_accountId_sourceNamespace_sourceId_key" ON "app"."Transaction"("accountId", "sourceNamespace", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_householdId_accountId_id_key" ON "app"."Transaction"("householdId", "accountId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionRevision_transactionId_version_key" ON "app"."TransactionRevision"("transactionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionOverride_householdId_accountId_transactionId_key" ON "app"."TransactionOverride"("householdId", "accountId", "transactionId");

-- AddForeignKey
ALTER TABLE "app"."ImportBatch" ADD CONSTRAINT "ImportBatch_householdId_accountId_fkey" FOREIGN KEY ("householdId", "accountId") REFERENCES "app"."Account"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ImportBatch" ADD CONSTRAINT "ImportBatch_householdId_requestedByMembershipId_requestedB_fkey" FOREIGN KEY ("householdId", "requestedByMembershipId", "requestedByUserId") REFERENCES "app"."Membership"("householdId", "id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ImportObject" ADD CONSTRAINT "ImportObject_householdId_accountId_batchId_fkey" FOREIGN KEY ("householdId", "accountId", "batchId") REFERENCES "app"."ImportBatch"("householdId", "accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Transaction" ADD CONSTRAINT "Transaction_householdId_accountId_currency_fkey" FOREIGN KEY ("householdId", "accountId", "currency") REFERENCES "app"."Account"("householdId", "id", "currency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Transaction" ADD CONSTRAINT "Transaction_householdId_accountId_originImportBatchId_fkey" FOREIGN KEY ("householdId", "accountId", "originImportBatchId") REFERENCES "app"."ImportBatch"("householdId", "accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TransactionRevision" ADD CONSTRAINT "TransactionRevision_householdId_accountId_transactionId_fkey" FOREIGN KEY ("householdId", "accountId", "transactionId") REFERENCES "app"."Transaction"("householdId", "accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TransactionRevision" ADD CONSTRAINT "TransactionRevision_householdId_actorMembershipId_fkey" FOREIGN KEY ("householdId", "actorMembershipId") REFERENCES "app"."Membership"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TransactionOverride" ADD CONSTRAINT "TransactionOverride_householdId_accountId_transactionId_fkey" FOREIGN KEY ("householdId", "accountId", "transactionId") REFERENCES "app"."Transaction"("householdId", "accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TransactionOverride" ADD CONSTRAINT "TransactionOverride_householdId_authorMembershipId_fkey" FOREIGN KEY ("householdId", "authorMembershipId") REFERENCES "app"."Membership"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TransactionNote" ADD CONSTRAINT "TransactionNote_householdId_accountId_transactionId_fkey" FOREIGN KEY ("householdId", "accountId", "transactionId") REFERENCES "app"."Transaction"("householdId", "accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TransactionNote" ADD CONSTRAINT "TransactionNote_householdId_authorMembershipId_authorUserI_fkey" FOREIGN KEY ("householdId", "authorMembershipId", "authorUserId") REFERENCES "app"."Membership"("householdId", "id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE app."ImportBatch" ADD CONSTRAINT "ImportBatch_valid_fields" CHECK (
  "fileChecksum" ~ '^[0-9a-f]{64}$' AND "mappingHash" ~ '^[0-9a-f]{64}$' AND version > 0
  AND "totalRows" BETWEEN 0 AND 50000 AND "processedRows" BETWEEN 0 AND 50000
  AND "validRows" BETWEEN 0 AND 50000 AND "rejectedRows" BETWEEN 0 AND 50000
  AND "overlapRows" BETWEEN 0 AND 50000 AND "duplicateRows" BETWEEN 0 AND 50000
  AND "committedRows" BETWEEN 0 AND 50000 AND "skippedRows" BETWEEN 0 AND 50000
  AND jsonb_typeof(preview) = 'array' AND jsonb_typeof(decisions) = 'object'
  AND ("failureCode" IS NULL OR "failureCode" ~ '^[A-Z][A-Z0-9_]{0,79}$'));
ALTER TABLE app."Transaction" ADD CONSTRAINT "Transaction_valid_source" CHECK (
  currency = 'GBP' AND version > 0 AND length(btrim(description)) BETWEEN 1 AND 500
  AND length("sourceId") BETWEEN 1 AND 160 AND "sourceHash" ~ '^[0-9a-f]{64}$' AND fingerprint ~ '^[0-9a-f]{64}$'
  AND (("sourceNamespace" = 'MANUAL' AND "originImportBatchId" IS NULL AND "csvRowNumber" IS NULL)
    OR ("sourceNamespace" = 'CSV' AND "originImportBatchId" IS NOT NULL AND "csvRowNumber" BETWEEN 1 AND 50000)));
ALTER TABLE app."TransactionRevision" ADD CONSTRAINT "TransactionRevision_version" CHECK (version > 0);
ALTER TABLE app."TransactionOverride" ADD CONSTRAINT "TransactionOverride_version" CHECK (version > 0);
ALTER TABLE app."TransactionNote" ADD CONSTRAINT "TransactionNote_version" CHECK (version > 0);

-- Job identity is resolved from the live lease and immutable batch requester.
-- Browser session GUCs never grant worker authority, and vice versa.
CREATE FUNCTION app.import_job_context(job_id uuid, lease_token uuid)
RETURNS TABLE("userId" uuid, "membershipId" uuid, "householdId" uuid, "accountId" uuid, "batchId" uuid, "jobId" uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT b."requestedByUserId", b."requestedByMembershipId", b."householdId", b."accountId", b.id, j.id
 FROM app."Job" j JOIN app."ImportBatch" b ON b.id = j."resourceId" AND b."householdId" = j."householdId"
 JOIN app."Membership" m ON m.id = b."requestedByMembershipId" AND m."userId" = b."requestedByUserId" AND m."householdId" = b."householdId" AND m.status = 'ACTIVE'
 JOIN app."User" u ON u.id = m."userId" AND u.status = 'ACTIVE'
 JOIN app."AccountOwner" o ON o."accountId" = b."accountId" AND o."householdId" = b."householdId" AND o."userId" = m."userId" AND o."membershipId" = m.id AND o.status = 'ACTIVE'
 WHERE j.id = job_id AND j."leaseToken" = lease_token AND j.state = 'LEASED' AND j."leaseUntil" > clock_timestamp()
   AND ((j.type = 'csv.preview' AND j.payload->>'operation' = 'PREVIEW') OR (j.type = 'csv.commit' AND j.payload->>'operation' = 'COMMIT') OR (j.type = 'csv.restore' AND j.payload->>'operation' = 'RESTORE'))
$$;
CREATE FUNCTION app.import_job_valid(batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS (SELECT 1 FROM app.import_job_context(
   nullif(current_setting('joint.job_id', true), '')::uuid,
   nullif(current_setting('joint.job_lease_token', true), '')::uuid) c
   WHERE c."batchId" = batch_id AND c."userId" = nullif(current_setting('joint.job_user_id', true), '')::uuid
     AND c."membershipId" = nullif(current_setting('joint.job_membership_id', true), '')::uuid
     AND c."householdId" = nullif(current_setting('joint.job_household_id', true), '')::uuid)
$$;
CREATE FUNCTION app.import_job_account(account_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS (SELECT 1 FROM app.import_job_context(nullif(current_setting('joint.job_id', true), '')::uuid,
   nullif(current_setting('joint.job_lease_token', true), '')::uuid) c
   WHERE c."accountId" = account_id AND app.import_job_valid(c."batchId"))
$$;
CREATE FUNCTION app.lock_import_job(job_id uuid, lease_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c record;
BEGIN
 SELECT * INTO c FROM app.import_job_context(job_id, lease_token);
 IF c."jobId" IS NULL THEN RAISE EXCEPTION 'Import lease is no longer valid' USING ERRCODE = '42501'; END IF;
 PERFORM 1 FROM app."User" WHERE id = c."userId" FOR UPDATE;
 PERFORM 1 FROM app."Household" WHERE id = c."householdId" FOR UPDATE;
 PERFORM 1 FROM app."Account" WHERE id = c."accountId" FOR UPDATE;
 PERFORM 1 FROM app."ImportBatch" WHERE id = c."batchId" FOR UPDATE;
 IF NOT EXISTS (SELECT 1 FROM app.import_job_context(job_id, lease_token)) THEN
 RAISE EXCEPTION 'Import lease is no longer valid' USING ERRCODE = '42501'; END IF;
END $$;
CREATE FUNCTION app.import_owned(batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS (SELECT 1 FROM app."ImportBatch" b WHERE b.id = batch_id AND app.owns_account(b."accountId"))
$$;
CREATE FUNCTION app.transaction_visible(transaction_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS (SELECT 1 FROM app."Transaction" t WHERE t.id = transaction_id
   AND ((app.account_access(t."accountId", 'TRANSACTIONS') AND (t."originImportBatchId" IS NULL OR EXISTS (
     SELECT 1 FROM app."ImportBatch" b WHERE b.id = t."originImportBatchId" AND b.state = 'COMMITTED')))
     OR (app.import_job_account(t."accountId") AND (app.import_job_valid(t."originImportBatchId") OR t."originImportBatchId" IS NULL OR EXISTS (SELECT 1 FROM app."ImportBatch" b WHERE b.id = t."originImportBatchId" AND b.state = 'COMMITTED')))))
$$;
CREATE FUNCTION app.import_is_pristine(batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT app.import_owned(batch_id) AND NOT EXISTS (
   SELECT 1 FROM app."Transaction" t WHERE t."originImportBatchId" = batch_id
     AND (t.version <> 1 OR EXISTS (SELECT 1 FROM app."TransactionRevision" r WHERE r."transactionId" = t.id AND r.kind <> 'CREATED')
       OR EXISTS (SELECT 1 FROM app."TransactionOverride" o WHERE o."transactionId" = t.id)
       OR EXISTS (SELECT 1 FROM app."TransactionNote" n WHERE n."transactionId" = t.id)))
$$;
CREATE FUNCTION app.expire_import_objects(batch_limit integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE changed integer;
BEGIN
 IF batch_limit < 1 OR batch_limit > 1000 THEN RAISE EXCEPTION 'Invalid expiry bound'; END IF;
 WITH expired AS (SELECT "batchId" FROM app."ImportObject" WHERE ciphertext IS NOT NULL AND "expiresAt" <= clock_timestamp() ORDER BY "expiresAt" LIMIT batch_limit FOR UPDATE SKIP LOCKED)
 UPDATE app."ImportObject" o SET ciphertext = NULL, "deletedAt" = clock_timestamp() FROM expired e WHERE o."batchId" = e."batchId";
 GET DIAGNOSTICS changed = ROW_COUNT;
 RETURN changed;
END $$;
CREATE FUNCTION app.reconcile_import_failures(batch_limit integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE changed integer;
BEGIN
 IF batch_limit < 1 OR batch_limit > 1000 THEN RAISE EXCEPTION 'Invalid reconciliation bound'; END IF;
 WITH failed AS (SELECT b.id FROM app."ImportBatch" b WHERE b.state IN ('QUEUED','PREVIEWING','COMMITTING')
   AND EXISTS (SELECT 1 FROM app."Job" j WHERE j."resourceId" = b.id AND j."householdId" = b."householdId" AND j.type IN ('csv.preview','csv.commit','csv.restore') AND j.state = 'FAILED')
   AND NOT EXISTS (SELECT 1 FROM app."Job" j WHERE j."resourceId" = b.id AND j."householdId" = b."householdId" AND j.type IN ('csv.preview','csv.commit','csv.restore') AND j.state IN ('QUEUED','LEASED','RETRY_WAIT'))
   ORDER BY b."createdAt" LIMIT batch_limit FOR UPDATE SKIP LOCKED)
 UPDATE app."ImportBatch" b SET state = 'FAILED', "failureCode" = 'PROCESSING_FAILED', version = version + 1, "updatedAt" = clock_timestamp() FROM failed f WHERE b.id = f.id;
 GET DIAGNOSTICS changed = ROW_COUNT;
 RETURN changed;
END $$;

REVOKE ALL ON app."ImportBatch" FROM PUBLIC, joint_app_runtime;
GRANT SELECT, INSERT ON app."ImportBatch" TO joint_app_runtime;
ALTER TABLE app."ImportBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ImportBatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."ImportBatch" TO CURRENT_USER USING (true) WITH CHECK (true);

REVOKE ALL ON app."ImportObject" FROM PUBLIC, joint_app_runtime;
GRANT SELECT, INSERT ON app."ImportObject" TO joint_app_runtime;
ALTER TABLE app."ImportObject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ImportObject" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."ImportObject" TO CURRENT_USER USING (true) WITH CHECK (true);

REVOKE ALL ON app."Transaction" FROM PUBLIC, joint_app_runtime;
GRANT SELECT, INSERT ON app."Transaction" TO joint_app_runtime;
ALTER TABLE app."Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."Transaction" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."Transaction" TO CURRENT_USER USING (true) WITH CHECK (true);

REVOKE ALL ON app."TransactionRevision" FROM PUBLIC, joint_app_runtime;
GRANT SELECT, INSERT ON app."TransactionRevision" TO joint_app_runtime;
ALTER TABLE app."TransactionRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."TransactionRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."TransactionRevision" TO CURRENT_USER USING (true) WITH CHECK (true);

REVOKE ALL ON app."TransactionOverride" FROM PUBLIC, joint_app_runtime;
GRANT SELECT, INSERT ON app."TransactionOverride" TO joint_app_runtime;
ALTER TABLE app."TransactionOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."TransactionOverride" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."TransactionOverride" TO CURRENT_USER USING (true) WITH CHECK (true);

REVOKE ALL ON app."TransactionNote" FROM PUBLIC, joint_app_runtime;
GRANT SELECT, INSERT ON app."TransactionNote" TO joint_app_runtime;
ALTER TABLE app."TransactionNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."TransactionNote" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."TransactionNote" TO CURRENT_USER USING (true) WITH CHECK (true);

GRANT UPDATE ("mappingHash", mapping, "parserVersion", state, version, preview, decisions, "totalRows", "processedRows", "validRows", "rejectedRows", "overlapRows", "duplicateRows", "committedRows", "skippedRows", "failureCode", "updatedAt", "committedAt", "rolledBackAt", "previewExpiresAt") ON app."ImportBatch" TO joint_app_runtime;
GRANT UPDATE (ciphertext, "expiresAt", "deletedAt") ON app."ImportObject" TO joint_app_runtime;
GRANT UPDATE ("amountMinor", "bookedDate", description, status, version, "updatedAt") ON app."Transaction" TO joint_app_runtime;
GRANT UPDATE (category, merchant, version, "updatedAt") ON app."TransactionOverride" TO joint_app_runtime;
GRANT UPDATE (body, version, "updatedAt") ON app."TransactionNote" TO joint_app_runtime;
CREATE POLICY import_read ON app."ImportBatch" FOR SELECT TO joint_app_runtime USING (app.owns_account("accountId") OR app.import_job_valid(id));
CREATE POLICY import_create ON app."ImportBatch" FOR INSERT TO joint_app_runtime WITH CHECK (
 app.owns_account("accountId") AND "requestedByUserId" = nullif(current_setting('joint.user_id', true), '')::uuid AND "requestedByMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid);
CREATE POLICY import_update ON app."ImportBatch" FOR UPDATE TO joint_app_runtime USING (app.owns_account("accountId") OR app.import_job_valid(id)) WITH CHECK (app.owns_account("accountId") OR app.import_job_valid(id));
CREATE POLICY object_read ON app."ImportObject" FOR SELECT TO joint_app_runtime USING (app.import_owned("batchId") OR app.import_job_valid("batchId"));
CREATE POLICY object_create ON app."ImportObject" FOR INSERT TO joint_app_runtime WITH CHECK (app.import_owned("batchId"));
CREATE POLICY object_update ON app."ImportObject" FOR UPDATE TO joint_app_runtime USING (app.import_owned("batchId") OR app.import_job_valid("batchId")) WITH CHECK (app.import_owned("batchId") OR app.import_job_valid("batchId"));
CREATE POLICY transaction_read ON app."Transaction" FOR SELECT TO joint_app_runtime USING (app.transaction_visible(id));
CREATE POLICY transaction_create ON app."Transaction" FOR INSERT TO joint_app_runtime WITH CHECK (
 ("sourceNamespace" = 'MANUAL' AND app.owns_account("accountId")) OR ("sourceNamespace" = 'CSV' AND app.import_job_valid("originImportBatchId")));
CREATE POLICY transaction_update ON app."Transaction" FOR UPDATE TO joint_app_runtime USING (app.transaction_visible(id) AND app.owns_account("accountId")) WITH CHECK (app.transaction_visible(id) AND app.owns_account("accountId"));
CREATE POLICY revision_read ON app."TransactionRevision" FOR SELECT TO joint_app_runtime USING (app.transaction_visible("transactionId"));
CREATE POLICY revision_create ON app."TransactionRevision" FOR INSERT TO joint_app_runtime WITH CHECK (
 (app.transaction_visible("transactionId") AND app.owns_account("accountId") AND "actorMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid)
 OR EXISTS (SELECT 1 FROM app."Transaction" t WHERE t.id = "transactionId" AND app.import_job_valid(t."originImportBatchId") AND "actorMembershipId" = nullif(current_setting('joint.job_membership_id', true), '')::uuid AND kind = 'CREATED'));
CREATE POLICY override_read ON app."TransactionOverride" FOR SELECT TO joint_app_runtime USING (app.transaction_visible("transactionId"));
CREATE POLICY override_create ON app."TransactionOverride" FOR INSERT TO joint_app_runtime WITH CHECK (app.transaction_visible("transactionId") AND app.owns_account("accountId") AND "authorMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid);
CREATE POLICY override_update ON app."TransactionOverride" FOR UPDATE TO joint_app_runtime USING (app.transaction_visible("transactionId") AND app.owns_account("accountId")) WITH CHECK (app.transaction_visible("transactionId") AND app.owns_account("accountId"));
CREATE POLICY note_read ON app."TransactionNote" FOR SELECT TO joint_app_runtime USING (app.transaction_visible("transactionId") AND "authorUserId" = nullif(current_setting('joint.user_id', true), '')::uuid AND app.scope_is_valid());
CREATE POLICY note_create ON app."TransactionNote" FOR INSERT TO joint_app_runtime WITH CHECK (app.transaction_visible("transactionId") AND app.scope_is_valid() AND "authorUserId" = nullif(current_setting('joint.user_id', true), '')::uuid AND "authorMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid);
CREATE POLICY note_update ON app."TransactionNote" FOR UPDATE TO joint_app_runtime USING (app.transaction_visible("transactionId") AND app.scope_is_valid() AND "authorUserId" = nullif(current_setting('joint.user_id', true), '')::uuid) WITH CHECK (app.transaction_visible("transactionId") AND app.scope_is_valid() AND "authorUserId" = nullif(current_setting('joint.user_id', true), '')::uuid);
-- CSV financial originals are immutable even for an owner who can classify them.
CREATE FUNCTION app.protect_csv_original() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF OLD."sourceNamespace" = 'CSV' AND (NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."bookedDate" IS DISTINCT FROM OLD."bookedDate" OR NEW.description IS DISTINCT FROM OLD.description) THEN
 RAISE EXCEPTION 'CSV financial originals are immutable' USING ERRCODE = '42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Transaction_csv_immutable" BEFORE UPDATE ON app."Transaction" FOR EACH ROW EXECUTE FUNCTION app.protect_csv_original();
REVOKE ALL ON FUNCTION app.import_job_context(uuid,uuid), app.lock_import_job(uuid,uuid), app.import_job_account(uuid), app.import_job_valid(uuid), app.import_owned(uuid), app.transaction_visible(uuid), app.import_is_pristine(uuid), app.expire_import_objects(integer), app.reconcile_import_failures(integer), app.protect_csv_original() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.import_job_context(uuid,uuid), app.lock_import_job(uuid,uuid), app.import_job_account(uuid), app.import_job_valid(uuid), app.import_owned(uuid), app.transaction_visible(uuid), app.import_is_pristine(uuid), app.expire_import_objects(integer), app.reconcile_import_failures(integer) TO joint_app_runtime;
DO $$ DECLARE blocked_role text; BEGIN
 FOREACH blocked_role IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = blocked_role) THEN
 EXECUTE format('REVOKE ALL ON app."ImportBatch", app."ImportObject", app."Transaction", app."TransactionRevision", app."TransactionOverride", app."TransactionNote" FROM %I', blocked_role);
 END IF; END LOOP;
END $$;
COMMIT;
