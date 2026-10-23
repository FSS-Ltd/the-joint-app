BEGIN;
-- A failed identity provider must not monopolise the global deletion queue.
ALTER TABLE app."DeletionRequest" ADD COLUMN attempt integer NOT NULL DEFAULT 0 CHECK (attempt>=0),
  ADD COLUMN "runAfter" timestamptz(3) NOT NULL DEFAULT clock_timestamp();
CREATE INDEX "DeletionRequest_state_runAfter_requestedAt_idx" ON app."DeletionRequest" (state,"runAfter","requestedAt");
CREATE FUNCTION app.deletion_retry_delay(attempt integer) RETURNS interval
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT make_interval(secs => least(900,5*(1 << least(greatest(attempt,1)-1,8))))
$$;
CREATE OR REPLACE FUNCTION app.claim_deletion_request(request_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,"userId" uuid,"leaseToken" uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  WITH candidate AS (
    SELECT d.id FROM app."DeletionRequest" d WHERE d.state IN ('PENDING','PROVIDER_PENDING')
      AND (request_id IS NULL OR d.id = request_id) AND d."runAfter" <= clock_timestamp()
      AND (d."leaseUntil" IS NULL OR d."leaseUntil" <= clock_timestamp())
    ORDER BY d."requestedAt",d.id FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE app."DeletionRequest" d SET "leaseToken" = gen_random_uuid(),
    "leaseUntil" = clock_timestamp() + interval '30 seconds',
    attempt = least(d.attempt,2147483646)+1,
    "runAfter" = clock_timestamp() + interval '30 seconds' + app.deletion_retry_delay(least(d.attempt,2147483646)+1)
  FROM candidate c WHERE d.id=c.id RETURNING d.id,d."userId",d."leaseToken"
$$;

-- Acquire shared-household/account locks before this fresh eligibility read.
-- ACTIVE or DISABLED owners still need their history. A DELETED tombstone
-- cannot keep finance records after the final independently verified purge.
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
    WHERE o."userId" = actor_id AND NOT EXISTS (SELECT 1 FROM app."AccountOwner" other_owner JOIN app."User" other_user ON other_user.id = other_owner."userId" WHERE other_owner."accountId" = o."accountId" AND other_owner."userId" <> actor_id AND other_user.status <> 'DELETED');
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


CREATE OR REPLACE FUNCTION app.finish_deletion_request(request_id uuid, lease_token uuid, provider_deleted boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM app."DeletionRequest" d WHERE d.id = request_id AND d."leaseToken" = lease_token AND d."leaseUntil" > clock_timestamp()
    AND d.state = 'PROVIDER_PENDING' AND d."purgedAt" IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable deletion lease' USING ERRCODE = '42501'; END IF;
  UPDATE app."DeletionRequest" SET state = CASE WHEN provider_deleted THEN 'COMPLETED' ELSE 'PROVIDER_PENDING' END,
    "providerDeletedAt" = CASE WHEN provider_deleted THEN clock_timestamp() ELSE NULL END,
    "completedAt" = CASE WHEN provider_deleted THEN clock_timestamp() ELSE NULL END,
    "leaseToken" = NULL, "leaseUntil" = NULL,
    "runAfter" = CASE WHEN provider_deleted THEN "runAfter" ELSE clock_timestamp() + app.deletion_retry_delay(attempt) END
    WHERE id = request_id;
END $$;
REVOKE ALL ON FUNCTION app.deletion_retry_delay(integer) FROM PUBLIC;
COMMIT;
