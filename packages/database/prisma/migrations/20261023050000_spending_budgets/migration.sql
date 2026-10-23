-- CreateEnum
CREATE TYPE "app"."ClassificationKind" AS ENUM ('EXPENSE', 'INCOME', 'REFUND', 'TRANSFER', 'DEBT_PAYMENT', 'PRINCIPAL', 'CONTRIBUTION', 'UNCLASSIFIED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "app"."TransactionRevisionKind" ADD VALUE 'SPLIT';
ALTER TYPE "app"."TransactionRevisionKind" ADD VALUE 'TRANSFER_CONFIRM';
ALTER TYPE "app"."TransactionRevisionKind" ADD VALUE 'TRANSFER_REMOVE';

-- AlterTable
ALTER TABLE "app"."TransactionOverride" ADD COLUMN     "classificationKind" "app"."ClassificationKind";

-- CreateTable
CREATE TABLE "app"."TransactionSplit" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "category" VARCHAR(80),
    "amountMinor" BIGINT NOT NULL,
    "classificationKind" "app"."ClassificationKind" NOT NULL,

    CONSTRAINT "TransactionSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."TransferLink" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "fromAccountId" UUID NOT NULL,
    "fromTransactionId" UUID NOT NULL,
    "toAccountId" UUID NOT NULL,
    "toTransactionId" UUID NOT NULL,
    "beforeFromKind" "app"."ClassificationKind",
    "beforeToKind" "app"."ClassificationKind",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."AccountMonthCoverage" (
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "complete" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AccountMonthCoverage_pkey" PRIMARY KEY ("accountId","month")
);

-- CreateTable
CREATE TABLE "app"."CoverageRevision" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "complete" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."BudgetScope" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "scopeHash" CHAR(64) NOT NULL,
    "creatorMembershipId" UUID NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."BudgetScopeAccount" (
    "householdId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "accountId" UUID NOT NULL,

    CONSTRAINT "BudgetScopeAccount_pkey" PRIMARY KEY ("scopeId","accountId")
);

-- CreateTable
CREATE TABLE "app"."Budget" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'GBP',
    "version" INTEGER NOT NULL DEFAULT 1,
    "creatorMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."BudgetLine" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "amountMinor" BIGINT NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."BudgetRevision" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionSplit_householdId_accountId_transactionId_idx" ON "app"."TransactionSplit"("householdId", "accountId", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionSplit_transactionId_position_key" ON "app"."TransactionSplit"("transactionId", "position");

-- CreateIndex
CREATE INDEX "TransferLink_fromTransactionId_active_idx" ON "app"."TransferLink"("fromTransactionId", "active");

-- CreateIndex
CREATE INDEX "TransferLink_toTransactionId_active_idx" ON "app"."TransferLink"("toTransactionId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMonthCoverage_householdId_accountId_month_key" ON "app"."AccountMonthCoverage"("householdId", "accountId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "CoverageRevision_accountId_month_version_key" ON "app"."CoverageRevision"("accountId", "month", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetScope_householdId_scopeHash_key" ON "app"."BudgetScope"("householdId", "scopeHash");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetScope_householdId_id_key" ON "app"."BudgetScope"("householdId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_scopeId_month_key" ON "app"."Budget"("scopeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_householdId_id_key" ON "app"."Budget"("householdId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_budgetId_category_key" ON "app"."BudgetLine"("budgetId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetRevision_budgetId_version_key" ON "app"."BudgetRevision"("budgetId", "version");

-- AddForeignKey
ALTER TABLE "app"."TransactionSplit" ADD CONSTRAINT "TransactionSplit_householdId_accountId_transactionId_fkey" FOREIGN KEY ("householdId", "accountId", "transactionId") REFERENCES "app"."Transaction"("householdId", "accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TransferLink" ADD CONSTRAINT "TransferLink_householdId_fromAccountId_fromTransactionId_fkey" FOREIGN KEY ("householdId", "fromAccountId", "fromTransactionId") REFERENCES "app"."Transaction"("householdId", "accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TransferLink" ADD CONSTRAINT "TransferLink_householdId_toAccountId_toTransactionId_fkey" FOREIGN KEY ("householdId", "toAccountId", "toTransactionId") REFERENCES "app"."Transaction"("householdId", "accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AccountMonthCoverage" ADD CONSTRAINT "AccountMonthCoverage_householdId_accountId_fkey" FOREIGN KEY ("householdId", "accountId") REFERENCES "app"."Account"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AccountMonthCoverage" ADD CONSTRAINT "AccountMonthCoverage_householdId_authorMembershipId_fkey" FOREIGN KEY ("householdId", "authorMembershipId") REFERENCES "app"."Membership"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."CoverageRevision" ADD CONSTRAINT "CoverageRevision_householdId_accountId_month_fkey" FOREIGN KEY ("householdId", "accountId", "month") REFERENCES "app"."AccountMonthCoverage"("householdId", "accountId", "month") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."CoverageRevision" ADD CONSTRAINT "CoverageRevision_householdId_actorMembershipId_fkey" FOREIGN KEY ("householdId", "actorMembershipId") REFERENCES "app"."Membership"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BudgetScope" ADD CONSTRAINT "BudgetScope_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "app"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BudgetScope" ADD CONSTRAINT "BudgetScope_householdId_creatorMembershipId_fkey" FOREIGN KEY ("householdId", "creatorMembershipId") REFERENCES "app"."Membership"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BudgetScopeAccount" ADD CONSTRAINT "BudgetScopeAccount_householdId_scopeId_fkey" FOREIGN KEY ("householdId", "scopeId") REFERENCES "app"."BudgetScope"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BudgetScopeAccount" ADD CONSTRAINT "BudgetScopeAccount_householdId_accountId_fkey" FOREIGN KEY ("householdId", "accountId") REFERENCES "app"."Account"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Budget" ADD CONSTRAINT "Budget_householdId_scopeId_fkey" FOREIGN KEY ("householdId", "scopeId") REFERENCES "app"."BudgetScope"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Budget" ADD CONSTRAINT "Budget_householdId_creatorMembershipId_fkey" FOREIGN KEY ("householdId", "creatorMembershipId") REFERENCES "app"."Membership"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BudgetLine" ADD CONSTRAINT "BudgetLine_householdId_budgetId_fkey" FOREIGN KEY ("householdId", "budgetId") REFERENCES "app"."Budget"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BudgetRevision" ADD CONSTRAINT "BudgetRevision_householdId_budgetId_fkey" FOREIGN KEY ("householdId", "budgetId") REFERENCES "app"."Budget"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BudgetRevision" ADD CONSTRAINT "BudgetRevision_householdId_actorMembershipId_fkey" FOREIGN KEY ("householdId", "actorMembershipId") REFERENCES "app"."Membership"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- All financial relations retain tenant-matched foreign keys; the runtime never owns them.
ALTER TABLE app."TransactionSplit" ADD CONSTRAINT split_fields CHECK (
 position BETWEEN 0 AND 19 AND "amountMinor" <> 0
 AND (category IS NULL OR length(btrim(category)) BETWEEN 1 AND 80)
 AND ("classificationKind" <> 'EXPENSE' OR "amountMinor" < 0)
 AND ("classificationKind" NOT IN ('INCOME','REFUND') OR "amountMinor" > 0));
ALTER TABLE app."TransferLink" ADD CONSTRAINT transfer_fields CHECK (
 "fromAccountId" <> "toAccountId" AND "fromTransactionId" <> "toTransactionId" AND version > 0);
ALTER TABLE app."AccountMonthCoverage" ADD CONSTRAINT coverage_fields CHECK (
 extract(day FROM month) = 1 AND version > 0);
ALTER TABLE app."CoverageRevision" ADD CONSTRAINT coverage_revision_fields CHECK (extract(day FROM month) = 1 AND version > 0);
ALTER TABLE app."BudgetScope" ADD CONSTRAINT scope_hash CHECK ("scopeHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE app."Budget" ADD CONSTRAINT budget_fields CHECK (extract(day FROM month) = 1 AND currency = 'GBP' AND version > 0);
ALTER TABLE app."BudgetLine" ADD CONSTRAINT budget_line_fields CHECK ("amountMinor" >= 0 AND (category = '' OR length(btrim(category)) BETWEEN 1 AND 80));
ALTER TABLE app."BudgetRevision" ADD CONSTRAINT budget_revision_fields CHECK (version > 0 AND jsonb_typeof(data) = 'object');

CREATE FUNCTION app.budget_scope_access(scope_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT coalesce((SELECT app.scope_is_valid() AND s."householdId" = nullif(current_setting('joint.household_id',true),'')::uuid
 AND CASE WHEN NOT s.ready THEN s."creatorMembershipId" = nullif(current_setting('joint.membership_id',true),'')::uuid
 ELSE (SELECT count(*) BETWEEN 1 AND 50 AND bool_and(app.account_access(a."accountId", 'TRANSACTIONS')) FROM app."BudgetScopeAccount" a WHERE a."scopeId" = s.id) END
 FROM app."BudgetScope" s WHERE s.id = scope_id),false)
$$;
CREATE FUNCTION app.budget_scope_ready(scope_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app."BudgetScope" s WHERE s.id = scope_id AND s.ready AND app.budget_scope_access(s.id))
$$;
CREATE FUNCTION app.budget_scope_construct(scope_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app."BudgetScope" s WHERE s.id = scope_id AND NOT s.ready
 AND s."creatorMembershipId" = nullif(current_setting('joint.membership_id',true),'')::uuid AND app.budget_scope_access(s.id))
$$;
CREATE FUNCTION app.publish_budget_scope(scope_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s record; actual_hash text; account_count integer; allowed boolean;
BEGIN
 SELECT * INTO s FROM app."BudgetScope" WHERE id = scope_id FOR UPDATE;
 IF s.id IS NULL OR NOT app.budget_scope_construct(scope_id) THEN RETURN false; END IF;
 SELECT count(*), bool_and(app.account_access(a."accountId",'TRANSACTIONS')),
 encode(sha256(convert_to(string_agg(a."accountId"::text, ',' ORDER BY a."accountId"::text),'UTF8')),'hex')
 INTO account_count,allowed,actual_hash FROM app."BudgetScopeAccount" a WHERE a."scopeId" = scope_id;
 IF account_count NOT BETWEEN 1 AND 50 OR NOT coalesce(allowed,false) OR actual_hash <> s."scopeHash" THEN RETURN false; END IF;
 UPDATE app."BudgetScope" SET ready = true WHERE id = scope_id;
 RETURN true;
END $$;
CREATE FUNCTION app.budget_access(budget_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app."Budget" b WHERE b.id = budget_id AND app.budget_scope_ready(b."scopeId"))
$$;
CREATE FUNCTION app.transaction_paired(transaction_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT app.transaction_visible(transaction_id) AND EXISTS(SELECT 1 FROM app."TransferLink" l
 WHERE l.active AND (l."fromTransactionId" = transaction_id OR l."toTransactionId" = transaction_id))
$$;

CREATE FUNCTION app.check_spending_source_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 IF (NEW."amountMinor",NEW."bookedDate",NEW.description,NEW.status) IS DISTINCT FROM (OLD."amountMinor",OLD."bookedDate",OLD.description,OLD.status)
 AND (EXISTS(SELECT 1 FROM app."TransactionSplit" WHERE "transactionId" = OLD.id)
 OR EXISTS(SELECT 1 FROM app."TransferLink" WHERE active AND ("fromTransactionId" = OLD.id OR "toTransactionId" = OLD.id)))
 THEN RAISE EXCEPTION 'Clear splits or confirmed transfer before correction' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER spending_source_update BEFORE UPDATE ON app."Transaction" FOR EACH ROW EXECUTE FUNCTION app.check_spending_source_update();
CREATE FUNCTION app.check_spending_override() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE amount bigint;
BEGIN
 SELECT "amountMinor" INTO amount FROM app."Transaction" WHERE id = NEW."transactionId";
 IF (NEW."classificationKind" = 'EXPENSE' AND amount >= 0) OR (NEW."classificationKind" IN ('INCOME','REFUND') AND amount <= 0)
 THEN RAISE EXCEPTION 'Classification direction is invalid' USING ERRCODE='23514'; END IF;
 IF ((TG_OP='INSERT' AND (NEW.category IS NOT NULL OR NEW."classificationKind" IS NOT NULL))
 OR (TG_OP='UPDATE' AND (NEW.category,NEW."classificationKind") IS DISTINCT FROM (OLD.category,OLD."classificationKind")))
 AND EXISTS(SELECT 1 FROM app."TransferLink" WHERE active AND ("fromTransactionId" = NEW."transactionId" OR "toTransactionId" = NEW."transactionId"))
 THEN RAISE EXCEPTION 'Remove confirmed transfer before classification' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER spending_override BEFORE INSERT OR UPDATE ON app."TransactionOverride" FOR EACH ROW EXECUTE FUNCTION app.check_spending_override();
CREATE FUNCTION app.check_split_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE transaction_id uuid;
BEGIN
 transaction_id := CASE WHEN TG_OP='DELETE' THEN OLD."transactionId" ELSE NEW."transactionId" END;
 IF EXISTS(SELECT 1 FROM app."TransferLink" WHERE active AND ("fromTransactionId" = transaction_id OR "toTransactionId" = transaction_id))
 THEN RAISE EXCEPTION 'Remove confirmed transfer before splitting' USING ERRCODE='23514'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER split_mutation BEFORE INSERT OR DELETE ON app."TransactionSplit" FOR EACH ROW EXECUTE FUNCTION app.check_split_mutation();
CREATE FUNCTION app.check_split_total() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE transaction_id uuid; parent_amount bigint; component_count integer; component_total numeric;
BEGIN
 transaction_id := CASE WHEN TG_OP='DELETE' THEN OLD."transactionId" ELSE NEW."transactionId" END;
 SELECT "amountMinor" INTO parent_amount FROM app."Transaction" WHERE id=transaction_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT count(*),sum("amountMinor"::numeric) INTO component_count,component_total FROM app."TransactionSplit" WHERE "transactionId"=transaction_id;
 IF component_count <> 0 AND (component_count NOT BETWEEN 2 AND 20 OR component_total <> parent_amount)
 THEN RAISE EXCEPTION 'Split components must exactly reconcile' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER split_total AFTER INSERT OR DELETE ON app."TransactionSplit" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_split_total();
CREATE FUNCTION app.check_transfer_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE from_row record; to_row record;
BEGIN
 IF NOT NEW.active THEN RETURN NEW; END IF;
 -- Lock both transaction rows in stable order, serialising concurrent cross-leg links.
 PERFORM 1 FROM app."Transaction" WHERE id IN (NEW."fromTransactionId",NEW."toTransactionId") ORDER BY id FOR UPDATE;
 SELECT * INTO from_row FROM app."Transaction" WHERE id=NEW."fromTransactionId";
 SELECT * INTO to_row FROM app."Transaction" WHERE id=NEW."toTransactionId";
 IF from_row."amountMinor" >= 0 OR to_row."amountMinor" <= 0 OR from_row."amountMinor"::numeric + to_row."amountMinor"::numeric <> 0
 OR from_row.currency <> 'GBP' OR to_row.currency <> 'GBP' OR from_row.status <> 'BOOKED' OR to_row.status <> 'BOOKED'
 OR EXISTS(SELECT 1 FROM app."TransactionSplit" WHERE "transactionId" IN (NEW."fromTransactionId",NEW."toTransactionId"))
 OR EXISTS(SELECT 1 FROM app."TransferLink" l WHERE l.id <> NEW.id AND l.active
 AND (l."fromTransactionId" IN (NEW."fromTransactionId",NEW."toTransactionId") OR l."toTransactionId" IN (NEW."fromTransactionId",NEW."toTransactionId")))
 THEN RAISE EXCEPTION 'Transfer legs are not eligible' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER transfer_link BEFORE INSERT OR UPDATE ON app."TransferLink" FOR EACH ROW EXECUTE FUNCTION app.check_transfer_link();
CREATE FUNCTION app.check_coverage_month() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF NEW.complete AND NEW.month >= date_trunc('month',clock_timestamp() AT TIME ZONE 'Europe/London')::date
 THEN RAISE EXCEPTION 'Current or future coverage cannot be complete' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coverage_month BEFORE INSERT OR UPDATE ON app."AccountMonthCoverage" FOR EACH ROW EXECUTE FUNCTION app.check_coverage_month();

REVOKE ALL ON app."TransactionSplit" FROM PUBLIC, joint_app_runtime;
ALTER TABLE app."TransactionSplit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."TransactionSplit" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."TransactionSplit" TO CURRENT_USER USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app."TransactionSplit" TO joint_app_runtime;
REVOKE ALL ON app."TransferLink" FROM PUBLIC, joint_app_runtime;
ALTER TABLE app."TransferLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."TransferLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."TransferLink" TO CURRENT_USER USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app."TransferLink" TO joint_app_runtime;
REVOKE ALL ON app."AccountMonthCoverage" FROM PUBLIC, joint_app_runtime;
ALTER TABLE app."AccountMonthCoverage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."AccountMonthCoverage" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."AccountMonthCoverage" TO CURRENT_USER USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app."AccountMonthCoverage" TO joint_app_runtime;
REVOKE ALL ON app."CoverageRevision" FROM PUBLIC, joint_app_runtime;
ALTER TABLE app."CoverageRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."CoverageRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."CoverageRevision" TO CURRENT_USER USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app."CoverageRevision" TO joint_app_runtime;
REVOKE ALL ON app."BudgetScope" FROM PUBLIC, joint_app_runtime;
ALTER TABLE app."BudgetScope" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."BudgetScope" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."BudgetScope" TO CURRENT_USER USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app."BudgetScope" TO joint_app_runtime;
REVOKE ALL ON app."BudgetScopeAccount" FROM PUBLIC, joint_app_runtime;
ALTER TABLE app."BudgetScopeAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."BudgetScopeAccount" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."BudgetScopeAccount" TO CURRENT_USER USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app."BudgetScopeAccount" TO joint_app_runtime;
REVOKE ALL ON app."Budget" FROM PUBLIC, joint_app_runtime;
ALTER TABLE app."Budget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."Budget" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."Budget" TO CURRENT_USER USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app."Budget" TO joint_app_runtime;
REVOKE ALL ON app."BudgetLine" FROM PUBLIC, joint_app_runtime;
ALTER TABLE app."BudgetLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."BudgetLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."BudgetLine" TO CURRENT_USER USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app."BudgetLine" TO joint_app_runtime;
REVOKE ALL ON app."BudgetRevision" FROM PUBLIC, joint_app_runtime;
ALTER TABLE app."BudgetRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."BudgetRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."BudgetRevision" TO CURRENT_USER USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app."BudgetRevision" TO joint_app_runtime;
GRANT DELETE ON app."TransactionSplit", app."BudgetLine" TO joint_app_runtime;
GRANT UPDATE (active, version) ON app."TransferLink" TO joint_app_runtime;
GRANT UPDATE (complete, version, "authorMembershipId", "updatedAt") ON app."AccountMonthCoverage" TO joint_app_runtime;
GRANT UPDATE (version, "updatedAt") ON app."Budget" TO joint_app_runtime;
GRANT UPDATE ("classificationKind") ON app."TransactionOverride" TO joint_app_runtime;
CREATE POLICY split_read ON app."TransactionSplit" FOR SELECT TO joint_app_runtime USING (app.transaction_visible("transactionId"));
CREATE POLICY split_create ON app."TransactionSplit" FOR INSERT TO joint_app_runtime WITH CHECK (app.transaction_visible("transactionId") AND app.owns_account("accountId"));
CREATE POLICY split_delete ON app."TransactionSplit" FOR DELETE TO joint_app_runtime USING (app.transaction_visible("transactionId") AND app.owns_account("accountId"));
CREATE POLICY transfer_read ON app."TransferLink" FOR SELECT TO joint_app_runtime USING (app.owns_account("fromAccountId") AND app.owns_account("toAccountId") AND app.transaction_visible("fromTransactionId") AND app.transaction_visible("toTransactionId"));
CREATE POLICY transfer_create ON app."TransferLink" FOR INSERT TO joint_app_runtime WITH CHECK (app.owns_account("fromAccountId") AND app.owns_account("toAccountId") AND app.transaction_visible("fromTransactionId") AND app.transaction_visible("toTransactionId"));
CREATE POLICY transfer_update ON app."TransferLink" FOR UPDATE TO joint_app_runtime USING (app.owns_account("fromAccountId") AND app.owns_account("toAccountId") AND app.transaction_visible("fromTransactionId") AND app.transaction_visible("toTransactionId")) WITH CHECK (app.owns_account("fromAccountId") AND app.owns_account("toAccountId"));
CREATE POLICY coverage_read ON app."AccountMonthCoverage" FOR SELECT TO joint_app_runtime USING (app.account_access("accountId",'TRANSACTIONS'));
CREATE POLICY coverage_create ON app."AccountMonthCoverage" FOR INSERT TO joint_app_runtime WITH CHECK (app.owns_account("accountId") AND "authorMembershipId"=nullif(current_setting('joint.membership_id',true),'')::uuid);
CREATE POLICY coverage_update ON app."AccountMonthCoverage" FOR UPDATE TO joint_app_runtime USING (app.owns_account("accountId")) WITH CHECK (app.owns_account("accountId") AND "authorMembershipId"=nullif(current_setting('joint.membership_id',true),'')::uuid);
CREATE POLICY coverage_revision_read ON app."CoverageRevision" FOR SELECT TO joint_app_runtime USING (app.account_access("accountId",'TRANSACTIONS'));
CREATE POLICY coverage_revision_create ON app."CoverageRevision" FOR INSERT TO joint_app_runtime WITH CHECK (app.owns_account("accountId") AND "actorMembershipId"=nullif(current_setting('joint.membership_id',true),'')::uuid);
CREATE POLICY scope_read ON app."BudgetScope" FOR SELECT TO joint_app_runtime USING (app.budget_scope_access(id));
CREATE POLICY scope_create ON app."BudgetScope" FOR INSERT TO joint_app_runtime WITH CHECK (NOT ready AND app.scope_is_valid() AND "householdId"=nullif(current_setting('joint.household_id',true),'')::uuid AND "creatorMembershipId"=nullif(current_setting('joint.membership_id',true),'')::uuid);
CREATE POLICY scope_account_read ON app."BudgetScopeAccount" FOR SELECT TO joint_app_runtime USING (app.budget_scope_access("scopeId"));
CREATE POLICY scope_account_create ON app."BudgetScopeAccount" FOR INSERT TO joint_app_runtime WITH CHECK (app.budget_scope_construct("scopeId") AND app.account_access("accountId",'TRANSACTIONS'));
CREATE POLICY budget_read ON app."Budget" FOR SELECT TO joint_app_runtime USING (app.budget_scope_ready("scopeId"));
CREATE POLICY budget_create ON app."Budget" FOR INSERT TO joint_app_runtime WITH CHECK (app.budget_scope_ready("scopeId") AND "creatorMembershipId"=nullif(current_setting('joint.membership_id',true),'')::uuid);
CREATE POLICY budget_update ON app."Budget" FOR UPDATE TO joint_app_runtime USING (app.budget_scope_ready("scopeId")) WITH CHECK (app.budget_scope_ready("scopeId"));
CREATE POLICY budget_line_read ON app."BudgetLine" FOR SELECT TO joint_app_runtime USING (app.budget_access("budgetId"));
CREATE POLICY budget_line_create ON app."BudgetLine" FOR INSERT TO joint_app_runtime WITH CHECK (app.budget_access("budgetId"));
CREATE POLICY budget_line_delete ON app."BudgetLine" FOR DELETE TO joint_app_runtime USING (app.budget_access("budgetId"));
CREATE POLICY budget_revision_read ON app."BudgetRevision" FOR SELECT TO joint_app_runtime USING (app.budget_access("budgetId"));
CREATE POLICY budget_revision_create ON app."BudgetRevision" FOR INSERT TO joint_app_runtime WITH CHECK (app.budget_access("budgetId") AND "actorMembershipId"=nullif(current_setting('joint.membership_id',true),'')::uuid);
REVOKE ALL ON FUNCTION app.budget_scope_access(uuid),app.budget_scope_ready(uuid),app.budget_scope_construct(uuid),app.publish_budget_scope(uuid),app.budget_access(uuid),app.transaction_paired(uuid),app.check_spending_source_update(),app.check_spending_override(),app.check_split_mutation(),app.check_split_total(),app.check_transfer_link(),app.check_coverage_month() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.budget_scope_access(uuid),app.budget_scope_ready(uuid),app.budget_scope_construct(uuid),app.publish_budget_scope(uuid),app.budget_access(uuid),app.transaction_paired(uuid) TO joint_app_runtime;
