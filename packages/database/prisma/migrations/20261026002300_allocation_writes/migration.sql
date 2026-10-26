BEGIN;
CREATE FUNCTION app.record_goal_allocation(account_id uuid, goal_id uuid, input jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE hh uuid; next_version integer; recorded_at timestamptz(3):=clock_timestamp();
BEGIN
  SELECT "householdId" INTO hh FROM app."Account" WHERE id=account_id FOR UPDATE;
  INSERT INTO app."AccountAllocationState" ("accountId","householdId",version,"updatedAt") VALUES(account_id,hh,1,recorded_at)
    ON CONFLICT("accountId") DO UPDATE SET version=app."AccountAllocationState".version+1,"updatedAt"=recorded_at RETURNING version INTO next_version;
  INSERT INTO app."AccountAllocationRevision" ("accountId","householdId","goalId",version,"valuationId",allocation,"createdAt")
    VALUES(account_id,hh,goal_id,next_version,(input->>'valuationId')::uuid,input,recorded_at);
  DELETE FROM app."GoalAllocation" WHERE "accountId"=account_id AND "goalId"=goal_id;
  IF input IS NOT NULL THEN
    INSERT INTO app."GoalAllocation" (id,"householdId","accountId","goalId","valuationId",basis,"amountMinor",fraction,"sourceVersion")
      VALUES(gen_random_uuid(),hh,account_id,goal_id,(input->>'valuationId')::uuid,(input->>'basis')::app."AllocationBasis",
        (input->'amount'->>'amountMinor')::bigint,(input->>'fraction')::numeric,next_version);
  END IF;
END $$;
CREATE FUNCTION app.write_goal_allocations(goal_id uuid, expected_goal_version integer, input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account_ids uuid[]; source_id uuid; entry jsonb; proposal jsonb; old_intention jsonb; canonical jsonb:='[]';
  expected integer; current_version integer; available numeric; committed numeric; previous numeric; replacement numeric; latest uuid; changed boolean:=false;
BEGIN
  IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR NOT input ?& ARRAY['accountIds','sourceVersions','allocations']
    OR input-ARRAY['accountIds','sourceVersions','allocations']<>'{}'::jsonb
    OR jsonb_typeof(input->'accountIds') IS DISTINCT FROM 'array' OR jsonb_typeof(input->'sourceVersions') IS DISTINCT FROM 'array'
    OR jsonb_typeof(input->'allocations') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid allocation input' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(input->'accountIds') NOT BETWEEN 1 AND 50 OR jsonb_array_length(input->'allocations')>50
    OR jsonb_array_length(input->'sourceVersions')<>jsonb_array_length(input->'accountIds')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(input->'accountIds') id WHERE jsonb_typeof(id) IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION 'Invalid allocation input' USING ERRCODE='22023'; END IF;
  BEGIN SELECT array_agg(id::uuid ORDER BY id::uuid) INTO account_ids FROM jsonb_array_elements_text(input->'accountIds') id;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid allocation input' USING ERRCODE='22023'; END;
  IF app.lock_allocation_scope(goal_id,account_ids) THEN RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app."Goal" WHERE id=goal_id AND status='ACTIVE' AND version=expected_goal_version) THEN
    RAISE EXCEPTION 'Allocation version conflict' USING ERRCODE='40001'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(input->'sourceVersions') LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR NOT entry ?& ARRAY['accountId','version'] OR entry-ARRAY['accountId','version']<>'{}'::jsonb
      OR jsonb_typeof(entry->'accountId') IS DISTINCT FROM 'string' OR jsonb_typeof(entry->'version') IS DISTINCT FROM 'number'
      OR (entry->>'version') !~ '^(0|[1-9][0-9]{0,9})$' THEN RAISE EXCEPTION 'Invalid allocation input' USING ERRCODE='22023'; END IF;
    BEGIN source_id:=(entry->>'accountId')::uuid; expected:=(entry->>'version')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid allocation input' USING ERRCODE='22023'; END;
    IF NOT source_id=ANY(account_ids) THEN RAISE EXCEPTION 'Invalid allocation input' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT (value->>'accountId')::uuid) FROM jsonb_array_elements(input->'sourceVersions'))<>cardinality(account_ids) THEN
    RAISE EXCEPTION 'Invalid allocation input' USING ERRCODE='22023'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(input->'allocations') LOOP
    BEGIN
      source_id:=(entry->>'accountId')::uuid;
      entry:=jsonb_set(jsonb_set(entry,'{accountId}',to_jsonb(source_id::text)),'{valuationId}',to_jsonb(((entry->>'valuationId')::uuid)::text));
      IF source_id IS NULL OR NOT source_id=ANY(account_ids) OR NOT coalesce(app.valid_allocation_revision(entry,source_id,(entry->>'valuationId')::uuid),false) THEN
        RAISE EXCEPTION 'Invalid allocation input' USING ERRCODE='22023'; END IF;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid allocation input' USING ERRCODE='22023'; END;
    canonical:=canonical||jsonb_build_array(entry);
  END LOOP;
  IF (SELECT count(DISTINCT value->>'accountId') FROM jsonb_array_elements(canonical))<>jsonb_array_length(canonical) THEN
    RAISE EXCEPTION 'Invalid allocation input' USING ERRCODE='22023'; END IF;
  -- All authority is already checked. No partial admission or source information escapes a failure.
  FOREACH source_id IN ARRAY account_ids LOOP
    SELECT (value->>'version')::integer INTO expected FROM jsonb_array_elements(input->'sourceVersions') WHERE (value->>'accountId')::uuid=source_id;
    current_version:=app.allocation_source_ceiling(source_id,false);
    IF expected<>current_version OR current_version=2147483647 THEN RAISE EXCEPTION 'Allocation version conflict' USING ERRCODE='40001'; END IF;
    SELECT value INTO proposal FROM jsonb_array_elements(canonical) WHERE (value->>'accountId')::uuid=source_id;
    SELECT r.allocation INTO old_intention FROM app."GoalAllocation" a JOIN app."AccountAllocationRevision" r
      ON r."accountId"=a."accountId" AND r.version=a."sourceVersion" AND r."goalId"=a."goalId" WHERE a."accountId"=source_id AND a."goalId"=goal_id;
    IF EXISTS(SELECT 1 FROM app."GoalAllocation" WHERE "accountId"=source_id AND "goalId"=goal_id AND "sourceVersion" IS NULL) THEN
      RAISE EXCEPTION 'Funding source unavailable' USING ERRCODE='P0003'; END IF;
    IF proposal IS NOT DISTINCT FROM old_intention THEN CONTINUE; END IF;
    IF proposal IS NOT NULL THEN
      available:=app.allocation_available(source_id); committed:=app.allocation_committed(source_id); previous:=app.allocation_amount(old_intention); replacement:=app.allocation_amount(proposal);
      SELECT id INTO latest FROM app."BalanceSnapshot" WHERE "householdId"=nullif(current_setting('joint.household_id',true),'')::uuid AND "accountId"=source_id ORDER BY "asOfDate" DESC,"createdAt" DESC,id LIMIT 1;
      IF available IS NULL OR committed IS NULL OR previous IS NULL OR replacement IS NULL OR (proposal->>'valuationId')::uuid IS DISTINCT FROM latest THEN
        RAISE EXCEPTION 'Funding source unavailable' USING ERRCODE='P0003'; END IF;
      IF committed-previous+replacement>available AND replacement>previous THEN
        RAISE EXCEPTION 'Allocation exceeds available funding' USING ERRCODE='P0005'; END IF;
    END IF;
    PERFORM app.record_goal_allocation(source_id,goal_id,proposal); changed:=true;
  END LOOP;
  IF changed THEN
    INSERT INTO app."AuditEvent" (id,"userId","householdId",action) VALUES(gen_random_uuid(),nullif(current_setting('joint.user_id',true),'')::uuid,nullif(current_setting('joint.household_id',true),'')::uuid,'GOAL_ALLOCATIONS_UPDATED');
  END IF;
  RETURN app.read_goal_allocations(goal_id,account_ids,NULL);
END $$;
REVOKE ALL ON FUNCTION app.record_goal_allocation(uuid,uuid,jsonb),app.write_goal_allocations(uuid,integer,jsonb) FROM PUBLIC,joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.write_goal_allocations(uuid,integer,jsonb) TO joint_app_runtime;
CREATE TRIGGER allocation_change AFTER INSERT ON app."AccountAllocationRevision" FOR EACH ROW EXECUTE FUNCTION app.notify_status_wakeup();
COMMIT;
