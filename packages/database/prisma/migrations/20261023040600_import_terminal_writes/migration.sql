BEGIN;
CREATE OR REPLACE FUNCTION app.import_job_context(job_id uuid, lease_token uuid)
RETURNS TABLE("userId" uuid, "membershipId" uuid, "householdId" uuid, "accountId" uuid, "batchId" uuid, "jobId" uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT b."requestedByUserId", b."requestedByMembershipId", b."householdId", b."accountId", b.id, j.id
 FROM app."Job" j JOIN app."ImportBatch" b ON b.id = j."resourceId" AND b."householdId" = j."householdId"
 JOIN app."Membership" m ON m.id = b."requestedByMembershipId" AND m."userId" = b."requestedByUserId" AND m."householdId" = b."householdId" AND m.status = 'ACTIVE'
 JOIN app."User" u ON u.id = m."userId" AND u.status = 'ACTIVE'
 JOIN app."AccountOwner" o ON o."accountId" = b."accountId" AND o."householdId" = b."householdId" AND o."userId" = m."userId" AND o."membershipId" = m.id AND o.status = 'ACTIVE'
 WHERE j.id = job_id AND j."leaseToken" = lease_token AND j.state = 'LEASED' AND j."leaseUntil" > clock_timestamp()
   AND jsonb_typeof(j.payload) = 'object' AND (j.payload - 'offset') = '{}'::jsonb
   AND (NOT (j.payload ? 'offset') OR (jsonb_typeof(j.payload->'offset') = 'number' AND j.payload->>'offset' ~ '^(0|[1-9][0-9]{0,4})$' AND (j.payload->>'offset')::integer BETWEEN 0 AND 50000))
   AND ((j.type = 'csv.preview') OR (j.type = 'csv.commit') OR (j.type = 'csv.restore'))
$$;


COMMIT;
