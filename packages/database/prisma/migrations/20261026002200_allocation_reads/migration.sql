BEGIN;
CREATE INDEX "AccountAllocationRevision_goal_page_idx" ON app."AccountAllocationRevision"("goalId","accountId",version);
CREATE FUNCTION app.read_goal_allocations(goal_id uuid, account_ids uuid[], after_cursor jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE archived boolean:=app.lock_allocation_scope(goal_id,account_ids); source_id uuid; ceiling integer; goal_version integer;
  hh uuid; sources jsonb:='[]'; intentions jsonb:='[]'; positions jsonb:='[]'; current_intention jsonb; entries jsonb; next_after jsonb;
  after_account uuid; after_version integer;
BEGIN
  IF after_cursor IS NOT NULL AND after_cursor<>'null'::jsonb THEN
    IF jsonb_typeof(after_cursor) IS DISTINCT FROM 'object' OR NOT after_cursor ?& ARRAY['accountId','version']
      OR after_cursor-ARRAY['accountId','version']<>'{}'::jsonb OR jsonb_typeof(after_cursor->'accountId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(after_cursor->'version') IS DISTINCT FROM 'number' OR (after_cursor->>'version') !~ '^[1-9][0-9]{0,9}$' THEN
      RAISE EXCEPTION 'Invalid allocation cursor' USING ERRCODE='22023';
    END IF;
    BEGIN after_account:=(after_cursor->>'accountId')::uuid; after_version:=(after_cursor->>'version')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid allocation cursor' USING ERRCODE='22023'; END;
    IF NOT after_account=ANY(account_ids) THEN RAISE EXCEPTION 'Invalid allocation cursor' USING ERRCODE='22023'; END IF;
  END IF;
  SELECT "householdId" INTO hh FROM app."Goal" WHERE id=goal_id;
  goal_version:=app.goal_ceiling(goal_id,archived);
  FOR source_id IN SELECT id FROM unnest(account_ids) id ORDER BY id LOOP
    ceiling:=app.allocation_source_ceiling(source_id,archived);
    IF source_id=after_account AND after_version>ceiling THEN RAISE EXCEPTION 'Invalid allocation cursor' USING ERRCODE='22023'; END IF;
    sources:=sources||jsonb_build_array(jsonb_build_object('accountId',source_id,'version',ceiling));
    SELECT r.allocation INTO current_intention FROM app."AccountAllocationRevision" r WHERE r."accountId"=source_id AND r."goalId"=goal_id AND r.version<=ceiling ORDER BY r.version DESC LIMIT 1;
    IF current_intention IS NOT NULL THEN intentions:=intentions||jsonb_build_array(current_intention); END IF;
    positions:=positions||jsonb_build_array(app.allocation_position(source_id,archived,current_intention));
  END LOOP;
  WITH bounded AS MATERIALIZED (
    SELECT r.*,row_number() OVER(ORDER BY r."accountId",r.version) AS position
      FROM app."AccountAllocationRevision" r WHERE r."goalId"=goal_id AND r."accountId"=ANY(account_ids)
        AND r.version<=app.allocation_source_ceiling(r."accountId",archived)
        AND (after_account IS NULL OR (r."accountId",r.version)>(after_account,after_version))
      ORDER BY r."accountId",r.version LIMIT 51
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('householdId',"householdId",'accountId',"accountId",'goalId',"goalId",'version',version,'allocation',allocation,
      'createdAt',to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY "accountId",version) FILTER(WHERE position<=50),'[]'::jsonb),
      CASE WHEN count(*)>50 THEN jsonb_build_object('accountId',(array_agg("accountId" ORDER BY position))[50],'version',(array_agg(version ORDER BY position))[50]) ELSE NULL END
    INTO entries,next_after FROM bounded;
  RETURN jsonb_build_object('view',jsonb_build_object('schema','goal-allocation-set','schemaVersion',2,'householdId',hh,'goalId',goal_id,'version',goal_version,
    'scope',jsonb_build_object('kind','CONTROLLED','accountIds',(SELECT jsonb_agg(id ORDER BY id) FROM unnest(account_ids) id),'sources',sources),
    'allocations',intentions,'positions',positions,'asOfDate',to_char(clock_timestamp() AT TIME ZONE 'Europe/London','YYYY-MM-DD'),
    'calculatedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),'history',entries,'nextAfter',next_after);
END $$;
REVOKE ALL ON FUNCTION app.read_goal_allocations(uuid,uuid[],jsonb) FROM PUBLIC,joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.read_goal_allocations(uuid,uuid[],jsonb) TO joint_app_runtime;
COMMIT;
