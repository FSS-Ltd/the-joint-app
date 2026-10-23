BEGIN;
-- No legacy participant backfill: an unclassified goal remains inaccessible.
CREATE TABLE app."GoalParticipant" (
  "householdId" uuid NOT NULL,
  "goalId" uuid NOT NULL,
  "membershipId" uuid NOT NULL,
  "cutoffVersion" integer CHECK ("cutoffVersion" > 0),
  PRIMARY KEY ("goalId", "membershipId"),
  FOREIGN KEY ("householdId", "goalId") REFERENCES app."Goal"("householdId",id) ON DELETE CASCADE,
  FOREIGN KEY ("householdId", "membershipId") REFERENCES app."Membership"("householdId",id) ON DELETE CASCADE
);
CREATE INDEX "GoalParticipant_membershipId_goalId_idx" ON app."GoalParticipant"("membershipId","goalId");
CREATE TABLE app."GoalRevision" (
  "householdId" uuid NOT NULL,
  "goalId" uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  data jsonb NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY ("goalId",version),
  FOREIGN KEY ("householdId","goalId") REFERENCES app."Goal"("householdId",id) ON DELETE CASCADE
);
ALTER TABLE app."GoalParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."GoalParticipant" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."GoalRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."GoalRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."GoalParticipant" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."GoalRevision" TO CURRENT_USER USING (true) WITH CHECK (true);
REVOKE ALL ON app."GoalParticipant",app."GoalRevision" FROM PUBLIC,joint_app_runtime;

CREATE FUNCTION app.goal_data(g app."Goal") RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('schema','goal','schemaVersion',1,'id',g.id,'householdId',g."householdId",
    'name',g.name,'status',g.status,'beneficiary',g.beneficiary,'priority',g.priority,'version',g.version,
    'target',jsonb_build_object('amountMinor',g."targetMinor"::text,'currency','GBP'),
    'targetDate',to_char(g."targetDate",'YYYY-MM-DD'))
$$;
CREATE FUNCTION app.capture_goal_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  INSERT INTO app."GoalRevision" ("householdId","goalId",version,data)
    VALUES (NEW."householdId",NEW.id,NEW.version,app.goal_data(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER goal_revision AFTER INSERT OR UPDATE ON app."Goal"
  FOR EACH ROW EXECUTE FUNCTION app.capture_goal_revision();
CREATE FUNCTION app.guard_goal_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' OR EXISTS (SELECT 1 FROM app."Goal" WHERE id=OLD."goalId") THEN
    RAISE EXCEPTION 'Goal history is immutable' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER goal_revision_immutable BEFORE UPDATE OR DELETE ON app."GoalRevision"
  FOR EACH ROW EXECUTE FUNCTION app.guard_goal_revision();

-- Membership status transitions are shared by normal exit, deletion and restore replay.
CREATE FUNCTION app.freeze_goal_participation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.status='ACTIVE' AND NEW.status='LEFT' THEN
    UPDATE app."GoalParticipant" p SET "cutoffVersion"=g.version FROM app."Goal" g
      WHERE p."membershipId"=OLD.id AND p."goalId"=g.id AND p."cutoffVersion" IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER goal_participant_exit AFTER UPDATE OF status ON app."Membership"
  FOR EACH ROW EXECUTE FUNCTION app.freeze_goal_participation();
CREATE FUNCTION app.purge_goal_participation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected uuid[];
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='DELETED' THEN
    SELECT coalesce(array_agg(p."goalId"),ARRAY[]::uuid[]) INTO affected FROM app."GoalParticipant" p
      JOIN app."Membership" m ON m.id=p."membershipId" WHERE m."userId"=NEW.id;
    DELETE FROM app."GoalParticipant" p USING app."Membership" m
      WHERE m.id=p."membershipId" AND m."userId"=NEW.id;
    DELETE FROM app."Goal" g WHERE g.id=ANY(affected)
      AND NOT EXISTS (SELECT 1 FROM app."GoalParticipant" p WHERE p."goalId"=g.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER goal_participant_purge AFTER UPDATE OF status ON app."User"
  FOR EACH ROW EXECUTE FUNCTION app.purge_goal_participation();

-- All public functions lock the actor before the household and recheck authority.
-- Archive reads use immutable revisions and cutoffs; no remaining member's live state.
CREATE FUNCTION app.lock_goal_scope() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM 1 FROM app."User" WHERE id=nullif(current_setting('joint.user_id',true),'')::uuid AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable goal scope' USING ERRCODE='42501'; END IF;
  IF current_setting('joint.archive',true)='owner' THEN
    IF NOT coalesce(app.archive_scope_is_valid(),false) THEN
      RAISE EXCEPTION 'Unavailable goal scope' USING ERRCODE='42501';
    END IF;
    RETURN true;
  END IF;
  PERFORM 1 FROM app."Household" WHERE id=nullif(current_setting('joint.household_id',true),'')::uuid FOR UPDATE;
  IF NOT coalesce(app.scope_is_valid(),false) THEN
    RAISE EXCEPTION 'Unavailable goal scope' USING ERRCODE='42501';
  END IF;
  RETURN false;
END $$;
CREATE FUNCTION app.goal_ceiling(goal_id uuid, archived boolean) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT CASE WHEN archived THEN p."cutoffVersion" ELSE g.version END
    FROM app."GoalParticipant" p JOIN app."Membership" m ON m.id=p."membershipId"
    JOIN app."Goal" g ON g.id=p."goalId"
    WHERE g.id=goal_id AND m."userId"=nullif(current_setting('joint.user_id',true),'')::uuid
    AND ((archived AND m.status='LEFT' AND p."cutoffVersion" IS NOT NULL)
      OR (NOT archived AND m.status='ACTIVE' AND p."cutoffVersion" IS NULL
        AND m.id=nullif(current_setting('joint.membership_id',true),'')::uuid
        AND m."householdId"=nullif(current_setting('joint.household_id',true),'')::uuid))
$$;
CREATE FUNCTION app.write_goal(goal_id uuid, expected_version integer, input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE hh uuid:=nullif(current_setting('joint.household_id',true),'')::uuid;
  g app."Goal"; amount bigint; target_date date;
BEGIN
  IF app.lock_goal_scope() THEN RAISE EXCEPTION 'Unavailable goal' USING ERRCODE='42501'; END IF;
  IF goal_id IS NULL OR expected_version IS NULL OR expected_version<0 OR expected_version>=2147483647
    OR jsonb_typeof(input) IS DISTINCT FROM 'object'
    OR NOT input ?& ARRAY['name','status','beneficiary','priority','target','targetDate']
    OR (SELECT count(*) FROM jsonb_object_keys(input))<>6
    OR jsonb_typeof(input->'name') IS DISTINCT FROM 'string'
    OR length(btrim(input->>'name')) NOT BETWEEN 1 AND 120
    OR input->>'status' NOT IN ('ACTIVE','ARCHIVED')
    OR input->>'beneficiary' IS DISTINCT FROM 'ADULT'
    OR jsonb_typeof(input->'priority') IS DISTINCT FROM 'number'
    OR (input->>'priority') !~ '^[1-9][0-9]{0,3}$'
    OR (input->>'priority')::integer>1000
    OR jsonb_typeof(input->'target') IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(input->'target'))<>2
    OR input->'target'->>'currency' IS DISTINCT FROM 'GBP'
    OR jsonb_typeof(input->'target'->'amountMinor') IS DISTINCT FROM 'string'
    OR (input->'target'->>'amountMinor') !~ '^(0|[1-9][0-9]{0,18})$' THEN
    RAISE EXCEPTION 'Invalid goal input' USING ERRCODE='22023';
  END IF;
  BEGIN
    amount:=(input->'target'->>'amountMinor')::bigint;
    IF input->'targetDate'<>'null'::jsonb THEN
      IF jsonb_typeof(input->'targetDate') IS DISTINCT FROM 'string'
        OR (input->>'targetDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'Invalid goal input' USING ERRCODE='22023';
      END IF;
      target_date:=(input->>'targetDate')::date;
      IF to_char(target_date,'YYYY-MM-DD')<>input->>'targetDate' THEN
        RAISE EXCEPTION 'Invalid goal input' USING ERRCODE='22023';
      END IF;
    END IF;
  EXCEPTION WHEN numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Invalid goal input' USING ERRCODE='22023';
  END;
  SELECT * INTO g FROM app."Goal" WHERE id=goal_id FOR UPDATE;
  IF NOT FOUND THEN
    IF expected_version<>0 OR input->>'status'<>'ACTIVE' THEN
      RAISE EXCEPTION 'Unavailable goal' USING ERRCODE='P0002';
    END IF;
    INSERT INTO app."Goal" (id,"householdId",name,status,beneficiary,priority,"targetMinor","targetDate")
      VALUES (goal_id,hh,btrim(input->>'name'),'ACTIVE','ADULT',(input->>'priority')::integer,amount,target_date) RETURNING * INTO g;
    INSERT INTO app."GoalParticipant" ("householdId","goalId","membershipId")
      SELECT hh,goal_id,m.id FROM app."Membership" m JOIN app."User" u ON u.id=m."userId"
      WHERE m."householdId"=hh AND m.status='ACTIVE' AND u.status='ACTIVE';
  ELSE
    IF app.goal_ceiling(goal_id,false) IS NULL THEN RAISE EXCEPTION 'Unavailable goal' USING ERRCODE='P0002'; END IF;
    IF g.version<>expected_version OR g.status='ARCHIVED' THEN
      RAISE EXCEPTION 'Goal version conflict' USING ERRCODE='40001';
    END IF;
    IF input->>'status'='ARCHIVED' AND EXISTS (SELECT 1 FROM app."GoalAllocation" WHERE "goalId"=goal_id) THEN
      RAISE EXCEPTION 'Goal funding lifecycle unavailable' USING ERRCODE='40001';
    END IF;
    UPDATE app."Goal" SET name=btrim(input->>'name'),status=(input->>'status')::app."GoalStatus",
      priority=(input->>'priority')::integer,"targetMinor"=amount,"targetDate"=target_date,version=version+1
      WHERE id=goal_id RETURNING * INTO g;
  END IF;
  UPDATE app."Household" SET revision=revision+1 WHERE id=hh;
  INSERT INTO app."AuditEvent" (id,"userId","householdId",action)
    VALUES (gen_random_uuid(),nullif(current_setting('joint.user_id',true),'')::uuid,hh,'GOAL_UPDATED');
  RETURN app.goal_data(g);
END $$;
CREATE FUNCTION app.read_goal(goal_id uuid, after_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE archived boolean:=app.lock_goal_scope(); ceiling integer; latest jsonb; entries jsonb; next_version integer;
BEGIN
  IF after_version IS NULL OR after_version<0 THEN RAISE EXCEPTION 'Invalid goal cursor' USING ERRCODE='22023'; END IF;
  ceiling:=app.goal_ceiling(goal_id,archived);
  IF ceiling IS NULL THEN RAISE EXCEPTION 'Unavailable goal' USING ERRCODE='P0002'; END IF;
  SELECT data INTO latest FROM app."GoalRevision" WHERE "goalId"=goal_id AND version=ceiling;
  IF latest IS NULL THEN RAISE EXCEPTION 'Unavailable goal' USING ERRCODE='P0002'; END IF;
  WITH bounded AS MATERIALIZED (
    SELECT *,row_number() OVER (ORDER BY version) AS position FROM app."GoalRevision"
      WHERE "goalId"=goal_id AND version>after_version AND version<=ceiling ORDER BY version LIMIT 51
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('goal',data,'createdAt',to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY version) FILTER (WHERE position<=50),'[]'::jsonb),
      CASE WHEN count(*)>50 THEN max(version) FILTER (WHERE position<=50) ELSE NULL END
    INTO entries,next_version FROM bounded;
  RETURN jsonb_build_object('goal',latest,'revisions',entries,'nextAfterVersion',next_version);
END $$;
CREATE FUNCTION app.list_goals(after_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE archived boolean:=app.lock_goal_scope(); result jsonb;
BEGIN
  WITH bounded AS MATERIALIZED (
    SELECT g.id,r.data,row_number() OVER (ORDER BY g.id) AS position FROM app."GoalParticipant" p
      JOIN app."Membership" m ON m.id=p."membershipId" JOIN app."Goal" g ON g.id=p."goalId"
      JOIN app."GoalRevision" r ON r."goalId"=g.id AND r.version=CASE WHEN archived THEN p."cutoffVersion" ELSE g.version END
      WHERE m."userId"=nullif(current_setting('joint.user_id',true),'')::uuid AND (after_id IS NULL OR g.id>after_id)
      AND ((archived AND m.status='LEFT' AND p."cutoffVersion" IS NOT NULL)
        OR (NOT archived AND m.status='ACTIVE' AND p."cutoffVersion" IS NULL
          AND m.id=nullif(current_setting('joint.membership_id',true),'')::uuid
          AND m."householdId"=nullif(current_setting('joint.household_id',true),'')::uuid))
      ORDER BY g.id LIMIT 51
  ) SELECT jsonb_build_object('goals',coalesce(jsonb_agg(data ORDER BY id) FILTER (WHERE position<=50),'[]'::jsonb),
      'nextAfterId',CASE WHEN count(*)>50 THEN (array_agg(id ORDER BY id) FILTER (WHERE position<=50))[50] ELSE NULL END)
    INTO result FROM bounded;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.goal_data(app."Goal"),app.capture_goal_revision(),app.guard_goal_revision(),
  app.freeze_goal_participation(),app.purge_goal_participation(),app.lock_goal_scope(),app.goal_ceiling(uuid,boolean),
  app.write_goal(uuid,integer,jsonb),app.read_goal(uuid,integer),app.list_goals(uuid) FROM PUBLIC,joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.write_goal(uuid,integer,jsonb),app.read_goal(uuid,integer),app.list_goals(uuid) TO joint_app_runtime;
COMMIT;
