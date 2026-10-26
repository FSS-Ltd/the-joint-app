BEGIN;

-- Only explicit interaction may advance lastSeenAt. Passive identity reads and
-- provider token refreshes retain their original inactivity deadline.
CREATE FUNCTION app.session_idle_deadline(session_id uuid, activity_age_ms integer)
RETURNS TABLE ("expiresAt" timestamptz, "serverTime" timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  session_row app."SessionRegistry"%ROWTYPE;
  observed_at timestamptz;
BEGIN
  IF activity_age_ms IS NOT NULL AND (activity_age_ms < 0 OR activity_age_ms > 5000) THEN
    RAISE EXCEPTION 'Session unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO session_row FROM app."SessionRegistry" WHERE id = session_id FOR UPDATE;
  observed_at := date_trunc('milliseconds', clock_timestamp());
  IF NOT FOUND OR session_row."revokedAt" IS NOT NULL
    OR session_row."expiresAt" <= observed_at
    OR session_row."lastSeenAt" <= observed_at - interval '10 minutes'
    OR NOT EXISTS (SELECT 1 FROM app."User" WHERE id = session_row."userId" AND status = 'ACTIVE')
    OR (session_row."householdId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM app."Membership" WHERE "userId" = session_row."userId"
        AND "householdId" = session_row."householdId" AND status = 'ACTIVE'
    )) THEN
    RAISE EXCEPTION 'Session unavailable' USING ERRCODE = '42501';
  END IF;
  IF activity_age_ms IS NOT NULL THEN
    session_row."lastSeenAt" := greatest(session_row."lastSeenAt", observed_at - activity_age_ms * interval '1 millisecond');
    UPDATE app."SessionRegistry" SET "lastSeenAt" = session_row."lastSeenAt" WHERE id = session_id;
  END IF;
  RETURN QUERY SELECT least(session_row."expiresAt", session_row."lastSeenAt" + interval '10 minutes'), observed_at;
END
$$;
REVOKE ALL ON FUNCTION app.session_idle_deadline(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.session_idle_deadline(uuid, integer) TO joint_app_runtime;

CREATE OR REPLACE FUNCTION app.scope_is_valid() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM app."Membership" m
    JOIN app."User" u ON u.id = m."userId" AND u.status = 'ACTIVE'
    JOIN app."SessionRegistry" s ON s."userId" = m."userId" AND s."householdId" = m."householdId"
    WHERE m.id = nullif(current_setting('joint.membership_id', true), '')::uuid
      AND m."userId" = nullif(current_setting('joint.user_id', true), '')::uuid
      AND m."householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
      AND m.status = 'ACTIVE' AND m."grantVersion"::text = current_setting('joint.grant_version', true)
      AND s.id = nullif(current_setting('joint.session_id', true), '')::uuid
      AND s."lastSeenAt" > clock_timestamp() - interval '10 minutes'
      AND s."revokedAt" IS NULL AND s."expiresAt" > clock_timestamp() AND s.purpose = 'NORMAL'
  )
$$;

CREATE OR REPLACE FUNCTION app.archive_scope_is_valid() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT current_setting('joint.archive', true) = 'owner' AND EXISTS (
    SELECT 1 FROM app."User" u JOIN app."SessionRegistry" s ON s."userId" = u.id
    WHERE u.id = nullif(current_setting('joint.user_id', true), '')::uuid
      AND u.status = 'ACTIVE'
      AND s.id = nullif(current_setting('joint.session_id', true), '')::uuid
      AND s."lastSeenAt" > clock_timestamp() - interval '10 minutes'
      AND s.purpose = 'NORMAL' AND s."revokedAt" IS NULL AND s."expiresAt" > clock_timestamp()
  )
$$;

CREATE OR REPLACE FUNCTION app.deletion_authorized() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(app.scope_has_recent_mfa(),false) AND EXISTS (
    SELECT 1 FROM app."User" u JOIN app."SessionRegistry" s ON s."userId" = u.id
    WHERE u.id = nullif(current_setting('joint.user_id',true),'')::uuid AND u.status = 'ACTIVE'
      AND s.id = nullif(current_setting('joint.session_id',true),'')::uuid
      AND s."lastSeenAt" > clock_timestamp() - interval '10 minutes'
      AND s.purpose = 'NORMAL' AND s."revokedAt" IS NULL AND s."expiresAt" > clock_timestamp()
  )
$$;

COMMIT;
