BEGIN;
-- Read-only TOTALS projection versions start at 1 on upgrade. They never
-- authorize writes; owners retain the existing optimistic Account.version.
ALTER TABLE app."Account" ADD COLUMN "totalsVersion" integer NOT NULL DEFAULT 1 CHECK ("totalsVersion">0);
-- Table-level INSERT remains available, but the server-owned projection starts
-- at its canonical initial value even for direct restricted-role statements.
CREATE POLICY account_totals_create ON app."Account" AS RESTRICTIVE FOR INSERT TO joint_app_runtime WITH CHECK ("totalsVersion"=1);
CREATE FUNCTION app.advance_account_totals_metadata() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF (NEW.label,NEW.kind,NEW.currency,NEW."legalOwnerKind",NEW.liquidity,NEW."archivedAt") IS DISTINCT FROM
    (OLD.label,OLD.kind,OLD.currency,OLD."legalOwnerKind",OLD.liquidity,OLD."archivedAt") THEN
    NEW."totalsVersion" = OLD."totalsVersion" + 1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_totals_metadata BEFORE UPDATE ON app."Account"
  FOR EACH ROW EXECUTE FUNCTION app.advance_account_totals_metadata();
CREATE FUNCTION app.advance_account_totals_balance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  -- These triggers sort before export_balance_* so account locks precede
  -- export revision locks, matching request/worker/download lock ordering.
  PERFORM 1 FROM app."Account" a WHERE a.id IN (SELECT DISTINCT "accountId" FROM changed) ORDER BY a.id FOR UPDATE;
  UPDATE app."Account" a SET "totalsVersion"="totalsVersion"+1
    WHERE a.id IN (SELECT DISTINCT "accountId" FROM changed);
  RETURN NULL;
END $$;
CREATE TRIGGER account_totals_balance_insert AFTER INSERT ON app."BalanceSnapshot" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.advance_account_totals_balance();
CREATE TRIGGER account_totals_balance_update AFTER UPDATE ON app."BalanceSnapshot" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.advance_account_totals_balance();
CREATE TRIGGER account_totals_balance_delete AFTER DELETE ON app."BalanceSnapshot" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION app.advance_account_totals_balance();
REVOKE ALL ON FUNCTION app.advance_account_totals_metadata(),app.advance_account_totals_balance() FROM PUBLIC;

-- Author epochs have no remaining purpose after the author's note purge.
CREATE OR REPLACE FUNCTION app.purge_deletion_request(request_id uuid, lease_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor_id uuid; eligible_ids uuid[];
BEGIN
  SELECT d."userId" INTO actor_id FROM app."DeletionRequest" d WHERE d.id = request_id;
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Unavailable deletion lease' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM app."User" WHERE id = actor_id FOR UPDATE;
  PERFORM 1 FROM app."Household" h WHERE h.id IN (SELECT m."householdId" FROM app."Membership" m WHERE m."userId" = actor_id) ORDER BY h.id FOR UPDATE;
  PERFORM 1 FROM app."DeletionRequest" d WHERE d.id = request_id AND d."leaseToken" = lease_token AND d."leaseUntil" > clock_timestamp()
    AND d.state IN ('PENDING','PROVIDER_PENDING') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable deletion lease' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM app."Account" a WHERE a.id IN (SELECT o."accountId" FROM app."AccountOwner" o WHERE o."userId" = actor_id) ORDER BY a.id FOR UPDATE;
  SELECT coalesce(array_agg(o."accountId"),ARRAY[]::uuid[]) INTO eligible_ids FROM app."AccountOwner" o
    WHERE o."userId" = actor_id AND NOT EXISTS (SELECT 1 FROM app."AccountOwner" other_owner WHERE other_owner."accountId" = o."accountId" AND other_owner."userId" <> actor_id);
  DELETE FROM app."BudgetScope" s WHERE EXISTS (SELECT 1 FROM app."BudgetScopeAccount" a WHERE a."scopeId" = s.id AND a."accountId" = ANY(eligible_ids));
  DELETE FROM app."TransactionNote" WHERE "authorUserId" = actor_id;
  DELETE FROM app."ExportNoteRevision" WHERE "userId" = actor_id;
  DELETE FROM app."Job" WHERE "resourceId" IN (SELECT b.id FROM app."ImportBatch" b WHERE b."requestedByUserId" = actor_id)
    OR "resourceId" IN (SELECT e.id FROM app."ExportRequest" e WHERE e."userId" = actor_id);
  DELETE FROM app."TransferLink" WHERE "fromAccountId" = ANY(eligible_ids) OR "toAccountId" = ANY(eligible_ids);
  DELETE FROM app."Account" WHERE id = ANY(eligible_ids);
  DELETE FROM app."RequestKey" WHERE "userId" = actor_id;
  DELETE FROM app."Invitation" WHERE "issuedByUserId" = actor_id OR "emailHash" IN (SELECT u."emailHash" FROM app."User" u WHERE u.id = actor_id);
  DELETE FROM app."SessionRegistry" WHERE "userId" = actor_id;
  UPDATE app."User" SET status = 'DELETED', "emailHash" = NULL WHERE id = actor_id;
  UPDATE app."DeletionRequest" SET state = 'PROVIDER_PENDING', "purgedAt" = coalesce("purgedAt",clock_timestamp()) WHERE id = request_id AND "leaseToken" = lease_token AND "leaseUntil" > clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable deletion lease' USING ERRCODE = '42501'; END IF;
END $$;

COMMIT;
