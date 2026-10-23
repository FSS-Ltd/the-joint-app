CREATE FUNCTION app.lock_budget_scope_construction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE published boolean;
BEGIN
 SELECT ready INTO published FROM app."BudgetScope" WHERE id=NEW."scopeId" AND "householdId"=NEW."householdId" FOR UPDATE;
 IF published IS NULL OR published THEN RAISE EXCEPTION 'Published budget scope is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER budget_scope_construction BEFORE INSERT ON app."BudgetScopeAccount" FOR EACH ROW EXECUTE FUNCTION app.lock_budget_scope_construction();

CREATE OR REPLACE FUNCTION app.check_split_total() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE transaction_id uuid; parent_amount bigint; component_count integer; component_total numeric;
BEGIN
 transaction_id := CASE WHEN TG_OP='DELETE' THEN OLD."transactionId" ELSE NEW."transactionId" END;
 SELECT "amountMinor" INTO parent_amount FROM app."Transaction" WHERE id=transaction_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT count(*),sum("amountMinor"::numeric) INTO component_count,component_total FROM app."TransactionSplit" WHERE "transactionId"=transaction_id;
 IF component_count <> 0 AND (component_count NOT BETWEEN 2 AND 20 OR parent_amount=0 OR component_total <> parent_amount)
 THEN RAISE EXCEPTION 'Split components must exactly reconcile' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION app.check_spending_source_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE explicit_kind app."ClassificationKind";
BEGIN
 IF (NEW."amountMinor",NEW."bookedDate",NEW.description,NEW.status) IS DISTINCT FROM (OLD."amountMinor",OLD."bookedDate",OLD.description,OLD.status)
 AND (EXISTS(SELECT 1 FROM app."TransactionSplit" WHERE "transactionId" = OLD.id)
 OR EXISTS(SELECT 1 FROM app."TransferLink" WHERE active AND ("fromTransactionId" = OLD.id OR "toTransactionId" = OLD.id)))
 THEN RAISE EXCEPTION 'Clear splits or confirmed transfer before correction' USING ERRCODE='23514'; END IF;
 SELECT "classificationKind" INTO explicit_kind FROM app."TransactionOverride" WHERE "transactionId"=OLD.id;
 IF (explicit_kind='EXPENSE' AND NEW."amountMinor">=0) OR (explicit_kind IN ('INCOME','REFUND') AND NEW."amountMinor"<=0)
 THEN RAISE EXCEPTION 'Classification direction is invalid' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app.import_is_pristine(batch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT app.import_owned(batch_id) AND NOT EXISTS (
   SELECT 1 FROM app."Transaction" t WHERE t."originImportBatchId" = batch_id
     AND (t.version <> 1 OR EXISTS (SELECT 1 FROM app."TransactionRevision" r WHERE r."transactionId" = t.id AND r.kind <> 'CREATED')
       OR EXISTS (SELECT 1 FROM app."TransactionOverride" o WHERE o."transactionId" = t.id)
       OR EXISTS (SELECT 1 FROM app."TransactionNote" n WHERE n."transactionId" = t.id)
       OR EXISTS (SELECT 1 FROM app."TransactionSplit" s WHERE s."transactionId" = t.id)
       OR EXISTS (SELECT 1 FROM app."TransferLink" l WHERE l."fromTransactionId" = t.id OR l."toTransactionId" = t.id)))
$$;
CREATE FUNCTION app.coverage_revision_matches(account_id uuid, coverage_month date, revision_version integer, revision_complete boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app."AccountMonthCoverage" c WHERE c."accountId"=account_id AND c.month=coverage_month
 AND c.version=revision_version AND c.complete=revision_complete AND app.owns_account(account_id))
$$;
CREATE FUNCTION app.budget_revision_matches(budget_id uuid, revision_version integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app."Budget" b WHERE b.id=budget_id AND b.version=revision_version AND app.budget_scope_ready(b."scopeId"))
$$;
ALTER POLICY coverage_revision_create ON app."CoverageRevision" WITH CHECK (
 app.coverage_revision_matches("accountId",month,version,complete)
 AND "actorMembershipId"=nullif(current_setting('joint.membership_id',true),'')::uuid);
ALTER POLICY budget_revision_create ON app."BudgetRevision" WITH CHECK (
 app.budget_revision_matches("budgetId",version)
 AND "actorMembershipId"=nullif(current_setting('joint.membership_id',true),'')::uuid);
REVOKE ALL ON FUNCTION app.lock_budget_scope_construction(),app.coverage_revision_matches(uuid,date,integer,boolean),app.budget_revision_matches(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.coverage_revision_matches(uuid,date,integer,boolean),app.budget_revision_matches(uuid,integer) TO joint_app_runtime;
