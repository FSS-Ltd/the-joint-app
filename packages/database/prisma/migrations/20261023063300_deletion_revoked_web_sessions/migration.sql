BEGIN;
-- A revoked WEB session still requires its hash until the purge removes it.
-- Revocation and cleared provider tokens immediately deny all app authority.
CREATE OR REPLACE FUNCTION app.request_deletion(request_id uuid, status_hash text, status_expiry timestamptz)
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
    "providerExpiresAt" = NULL WHERE "userId" = actor_id;
  UPDATE app."Invitation" SET "revokedAt" = clock_timestamp() WHERE "revokedAt" IS NULL AND ("issuedByUserId" = actor_id OR "emailHash" IN (SELECT u."emailHash" FROM app."User" u WHERE u.id = actor_id));
  UPDATE app."ExportRequest" SET state = 'INVALIDATED' WHERE "userId" = actor_id AND "ExportRequest".state IN ('QUEUED','PROCESSING','READY');
  UPDATE app."Job" SET state = 'CANCELLED', "leaseToken" = NULL, "leaseUntil" = NULL, "leaseOwner" = NULL
    WHERE "Job".state IN ('QUEUED','LEASED','RETRY_WAIT') AND ("resourceId" IN (SELECT b.id FROM app."ImportBatch" b WHERE b."requestedByUserId" = actor_id)
      OR "resourceId" IN (SELECT e.id FROM app."ExportRequest" e WHERE e."userId" = actor_id));
  INSERT INTO app."AuditEvent" (id,"userId",action) VALUES (gen_random_uuid(),actor_id,'DELETION_REQUESTED');
  RETURN QUERY SELECT d.id,d.state::text,d."requestedAt",d."completedAt" FROM app."DeletionRequest" d WHERE d.id = request_id;
END $$;

COMMIT;
