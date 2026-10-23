BEGIN;
-- Expiry during purge must roll back its changes before another worker resumes.
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
  DELETE FROM app."Job" WHERE "resourceId" IN (SELECT b.id FROM app."ImportBatch" b WHERE b."requestedByUserId" = actor_id)
    OR "resourceId" IN (SELECT e.id FROM app."ExportRequest" e WHERE e."userId" = actor_id);
  DELETE FROM app."TransferLink" WHERE "fromAccountId" = ANY(eligible_ids) OR "toAccountId" = ANY(eligible_ids);
  DELETE FROM app."Account" WHERE id = ANY(eligible_ids);
  DELETE FROM app."RequestKey" WHERE "userId" = actor_id;
  DELETE FROM app."Invitation" WHERE "issuedByUserId" = actor_id;
  DELETE FROM app."SessionRegistry" WHERE "userId" = actor_id;
  UPDATE app."User" SET status = 'DELETED', "emailHash" = NULL WHERE id = actor_id;
  UPDATE app."DeletionRequest" SET state = 'PROVIDER_PENDING', "purgedAt" = coalesce("purgedAt",clock_timestamp()) WHERE id = request_id AND "leaseToken" = lease_token AND "leaseUntil" > clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable deletion lease' USING ERRCODE = '42501'; END IF;
END $$;

COMMIT;
