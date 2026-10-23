BEGIN;
CREATE TABLE app."DeletionRequest" (
  id uuid PRIMARY KEY,
  "userId" uuid NOT NULL UNIQUE REFERENCES app."User"(id) ON DELETE RESTRICT,
  "statusTokenHash" char(64) NOT NULL CHECK ("statusTokenHash" ~ '^[0-9a-f]{64}$'),
  "statusExpiresAt" timestamptz(3) NOT NULL,
  "requestedAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  state varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','PROVIDER_PENDING','COMPLETED')),
  "leaseToken" uuid,
  "leaseUntil" timestamptz(3),
  "purgedAt" timestamptz(3),
  "providerDeletedAt" timestamptz(3),
  "completedAt" timestamptz(3),
  CONSTRAINT deletion_lease_pair CHECK (("leaseToken" IS NULL) = ("leaseUntil" IS NULL)),
  CONSTRAINT deletion_completion CHECK (state <> 'COMPLETED' OR ("purgedAt" IS NOT NULL AND "providerDeletedAt" IS NOT NULL AND "completedAt" IS NOT NULL))
);
CREATE INDEX "DeletionRequest_state_requestedAt_idx" ON app."DeletionRequest" (state,"requestedAt");
ALTER TABLE app."DeletionRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."DeletionRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."DeletionRequest" TO CURRENT_USER USING (true) WITH CHECK (true);
REVOKE ALL ON app."DeletionRequest" FROM PUBLIC, joint_app_runtime;

-- Only trusted definer callers may use this shared exit routine. They lock the
-- actor then household and validate their distinct live authority first.
CREATE FUNCTION app.exit_household_member(actor_id uuid, household_id uuid, member_id uuid) RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE source_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(o."accountId" ORDER BY o."accountId"), ARRAY[]::uuid[]) INTO source_ids
    FROM app."AccountOwner" o WHERE o."householdId" = household_id
      AND o."membershipId" = member_id AND o."userId" = actor_id AND o.status = 'ACTIVE';
  PERFORM 1 FROM app."Account" WHERE id = ANY(source_ids) ORDER BY id FOR UPDATE;
  UPDATE app."AccountGrant" SET level = 'NONE', version = version + 1
    WHERE "householdId" = household_id AND ("membershipId" = member_id OR "accountId" = ANY(source_ids));
  UPDATE app."AccountOwner" SET status = 'ARCHIVED'
    WHERE "householdId" = household_id AND "membershipId" = member_id AND "userId" = actor_id AND status = 'ACTIVE';
  UPDATE app."Account" a SET "archivedAt" = clock_timestamp()
    WHERE a.id = ANY(source_ids) AND NOT EXISTS (
      SELECT 1 FROM app."AccountOwner" o WHERE o."accountId" = a.id AND o.status = 'ACTIVE'
    );
  IF EXISTS (SELECT 1 FROM app."Membership" WHERE id = member_id AND role = 'ADMIN') THEN
    UPDATE app."Membership" SET role = 'ADMIN' WHERE id = (
      SELECT m.id FROM app."Membership" m JOIN app."User" u ON u.id = m."userId" AND u.status = 'ACTIVE'
        WHERE m."householdId" = household_id AND m.status = 'ACTIVE' AND m.id <> member_id ORDER BY m.id LIMIT 1
    );
  END IF;
  UPDATE app."Membership" SET "grantVersion" = "grantVersion" + 1
    WHERE "householdId" = household_id AND status = 'ACTIVE';
  UPDATE app."Membership" SET status = 'LEFT', slot = NULL WHERE id = member_id;
  UPDATE app."SessionRegistry" SET "revokedAt" = clock_timestamp(), "providerTokens" = NULL
    WHERE "householdId" = household_id AND "revokedAt" IS NULL;
  UPDATE app."Invitation" SET "revokedAt" = clock_timestamp()
    WHERE "householdId" = household_id AND "consumedAt" IS NULL AND "revokedAt" IS NULL;
  PERFORM app.invalidate_household_privacy_exports(household_id);
  UPDATE app."Household" SET revision = revision + 1 WHERE id = household_id;
  INSERT INTO app."AuditEvent" (id, "userId", "householdId", action)
    VALUES (gen_random_uuid(), actor_id, household_id, 'HOUSEHOLD_LEFT');
  RETURN QUERY SELECT unnest(source_ids);
END $$;
CREATE OR REPLACE FUNCTION app.leave_household() RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  actor_id uuid := nullif(current_setting('joint.user_id',true),'')::uuid;
  household_id uuid := nullif(current_setting('joint.household_id',true),'')::uuid;
BEGIN
  PERFORM 1 FROM app."User" WHERE id = actor_id AND status = 'ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable actor' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM app."Household" WHERE id = household_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(app.scope_is_valid(),false) THEN
    RAISE EXCEPTION 'Unavailable membership' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT app.exit_household_member(actor_id,household_id,nullif(current_setting('joint.membership_id',true),'')::uuid);
END $$;

CREATE FUNCTION app.deletion_authorized() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(app.scope_has_recent_mfa(),false) AND EXISTS (
    SELECT 1 FROM app."User" u JOIN app."SessionRegistry" s ON s."userId" = u.id
    WHERE u.id = nullif(current_setting('joint.user_id',true),'')::uuid AND u.status = 'ACTIVE'
      AND s.id = nullif(current_setting('joint.session_id',true),'')::uuid
      AND s.purpose = 'NORMAL' AND s."revokedAt" IS NULL AND s."expiresAt" > clock_timestamp()
  )
$$;
CREATE FUNCTION app.request_deletion(request_id uuid, status_hash text, status_expiry timestamptz)
RETURNS TABLE(id uuid, state text, "requestedAt" timestamptz, "completedAt" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor_id uuid := nullif(current_setting('joint.user_id',true),'')::uuid; member_record record;
BEGIN
  PERFORM 1 FROM app."User" WHERE "User".id = actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable actor' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM app."DeletionRequest" d WHERE d.id = request_id AND d."userId" = actor_id AND d."statusTokenHash" = status_hash) THEN
    RETURN QUERY SELECT d.id,d.state::text,d."requestedAt",d."completedAt" FROM app."DeletionRequest" d WHERE d.id = request_id;
    RETURN;
  END IF;
  IF NOT coalesce(app.deletion_authorized(),false) OR status_hash !~ '^[0-9a-f]{64}$'
    OR status_expiry <= clock_timestamp() OR status_expiry > clock_timestamp() + interval '30 days' THEN
    RAISE EXCEPTION 'Verified deletion unavailable' USING ERRCODE = '42501';
  END IF;
  INSERT INTO app."DeletionRequest" (id,"userId","statusTokenHash","statusExpiresAt")
    VALUES (request_id,actor_id,status_hash,status_expiry);
  PERFORM 1 FROM app."Household" h WHERE h.id IN (
    SELECT m."householdId" FROM app."Membership" m WHERE m."userId" = actor_id AND m.status = 'ACTIVE'
  ) ORDER BY h.id FOR UPDATE;
  FOR member_record IN SELECT m.id,m."householdId" FROM app."Membership" m WHERE m."userId" = actor_id AND m.status = 'ACTIVE' ORDER BY m."householdId" LOOP
    PERFORM app.exit_household_member(actor_id,member_record."householdId",member_record.id);
  END LOOP;
  UPDATE app."User" SET status = 'DISABLED' WHERE "User".id = actor_id;
  UPDATE app."SessionRegistry" SET "revokedAt" = coalesce("revokedAt",clock_timestamp()), "providerTokens" = NULL,
    "providerExpiresAt" = NULL, "browserTokenHash" = NULL WHERE "userId" = actor_id;
  UPDATE app."Invitation" SET "revokedAt" = clock_timestamp() WHERE "revokedAt" IS NULL AND ("issuedByUserId" = actor_id OR "emailHash" IN (SELECT u."emailHash" FROM app."User" u WHERE u.id = actor_id));
  UPDATE app."ExportRequest" SET state = 'INVALIDATED' WHERE "userId" = actor_id AND "ExportRequest".state IN ('QUEUED','PROCESSING','READY');
  UPDATE app."Job" SET state = 'CANCELLED', "leaseToken" = NULL, "leaseUntil" = NULL, "leaseOwner" = NULL
    WHERE "Job".state IN ('QUEUED','LEASED','RETRY_WAIT') AND ("resourceId" IN (SELECT b.id FROM app."ImportBatch" b WHERE b."requestedByUserId" = actor_id)
      OR "resourceId" IN (SELECT e.id FROM app."ExportRequest" e WHERE e."userId" = actor_id));
  INSERT INTO app."AuditEvent" (id,"userId",action) VALUES (gen_random_uuid(),actor_id,'DELETION_REQUESTED');
  RETURN QUERY SELECT d.id,d.state::text,d."requestedAt",d."completedAt" FROM app."DeletionRequest" d WHERE d.id = request_id;
END $$;

CREATE FUNCTION app.claim_deletion_request(request_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,"userId" uuid,"leaseToken" uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH candidate AS (
    SELECT d.id FROM app."DeletionRequest" d WHERE d.state IN ('PENDING','PROVIDER_PENDING')
      AND (request_id IS NULL OR d.id = request_id)
      AND (d."leaseUntil" IS NULL OR d."leaseUntil" <= clock_timestamp())
    ORDER BY d."requestedAt",d.id FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE app."DeletionRequest" d SET "leaseToken" = gen_random_uuid(), "leaseUntil" = clock_timestamp() + interval '30 seconds'
  FROM candidate c WHERE d.id = c.id RETURNING d.id,d."userId",d."leaseToken"
$$;

CREATE FUNCTION app.purge_deletion_request(request_id uuid, lease_token uuid) RETURNS void
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
  UPDATE app."DeletionRequest" SET state = 'PROVIDER_PENDING', "purgedAt" = coalesce("purgedAt",clock_timestamp()) WHERE id = request_id;
END $$;

CREATE FUNCTION app.finish_deletion_request(request_id uuid, lease_token uuid, provider_deleted boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM app."DeletionRequest" d WHERE d.id = request_id AND d."leaseToken" = lease_token AND d."leaseUntil" > clock_timestamp()
    AND d.state = 'PROVIDER_PENDING' AND d."purgedAt" IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable deletion lease' USING ERRCODE = '42501'; END IF;
  UPDATE app."DeletionRequest" SET state = CASE WHEN provider_deleted THEN 'COMPLETED' ELSE 'PROVIDER_PENDING' END,
    "providerDeletedAt" = CASE WHEN provider_deleted THEN clock_timestamp() ELSE NULL END,
    "completedAt" = CASE WHEN provider_deleted THEN clock_timestamp() ELSE NULL END,
    "leaseToken" = NULL, "leaseUntil" = NULL WHERE id = request_id;
END $$;
CREATE FUNCTION app.status_deletion_request(request_id uuid, status_hash text)
RETURNS TABLE(id uuid,state text,"requestedAt" timestamptz,"completedAt" timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT d.id,d.state::text,d."requestedAt",d."completedAt" FROM app."DeletionRequest" d
    WHERE d.id = request_id AND d."statusTokenHash" = status_hash AND d."statusExpiresAt" > clock_timestamp()
$$;
REVOKE ALL ON FUNCTION app.exit_household_member(uuid,uuid,uuid),app.deletion_authorized(),app.request_deletion(uuid,text,timestamptz),
  app.claim_deletion_request(uuid),app.purge_deletion_request(uuid,uuid),app.finish_deletion_request(uuid,uuid,boolean),app.status_deletion_request(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.deletion_authorized(),app.request_deletion(uuid,text,timestamptz),app.claim_deletion_request(uuid),
  app.purge_deletion_request(uuid,uuid),app.finish_deletion_request(uuid,uuid,boolean),app.status_deletion_request(uuid,text) TO joint_app_runtime;
COMMIT;
