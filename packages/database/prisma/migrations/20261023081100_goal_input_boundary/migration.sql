BEGIN;
-- Preserve the applied migration; reject JSON null status and avoid foreign household row locks.
CREATE OR REPLACE FUNCTION app.write_goal(goal_id uuid, expected_version integer, input jsonb) RETURNS jsonb
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
    OR jsonb_typeof(input->'status') IS DISTINCT FROM 'string'
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
  IF EXISTS (SELECT 1 FROM app."Goal" WHERE id=goal_id AND "householdId"<>hh) THEN
    RAISE EXCEPTION 'Unavailable goal' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO g FROM app."Goal" WHERE id=goal_id AND "householdId"=hh FOR UPDATE;
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
COMMIT;
