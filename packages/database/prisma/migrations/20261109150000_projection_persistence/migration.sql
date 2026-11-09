BEGIN;

CREATE OR REPLACE FUNCTION app.write_scenario(
  selected_goal uuid,
  scenario_id uuid,
  canonical_input text,
  input_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  hh uuid := nullif(current_setting('joint.household_id', true), '')::uuid;
  mem uuid := nullif(current_setting('joint.membership_id', true), '')::uuid;
  input_hash char(64);
  next_ver integer;
  res jsonb;
BEGIN
  IF hh IS NULL OR mem IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app."Membership" m
    WHERE m."householdId" = hh AND m.id = mem AND m.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Active membership required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app."Goal" g WHERE g.id = selected_goal AND g."householdId" = hh
  ) THEN
    RAISE EXCEPTION 'Goal not found' USING ERRCODE = 'P0002';
  END IF;

  input_hash := encode(sha256(convert_to(canonical_input, 'UTF8')), 'hex');

  SELECT coalesce(max(version), 0) + 1 INTO next_ver
  FROM app."Scenario"
  WHERE "householdId" = hh AND "goalId" = selected_goal;

  INSERT INTO app."Scenario" (
    id, "householdId", "goalId", version, "canonicalInput", input, "inputHash", "createdAt"
  ) VALUES (
    scenario_id, hh, selected_goal, next_ver, canonical_input, input_data, input_hash, now()
  )
  RETURNING jsonb_build_object(
    'schema', 'scenario',
    'schemaVersion', 1,
    'id', id,
    'householdId', "householdId",
    'goalId', "goalId",
    'version', version,
    'input', input,
    'createdAt', to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) INTO res;

  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION app.read_scenario(selected_scenario uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  hh uuid := nullif(current_setting('joint.household_id', true), '')::uuid;
  res jsonb;
BEGIN
  IF hh IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'schema', 'scenario',
    'schemaVersion', 1,
    'id', s.id,
    'householdId', s."householdId",
    'goalId', s."goalId",
    'version', s.version,
    'input', s.input,
    'createdAt', to_char(s."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) INTO res
  FROM app."Scenario" s
  WHERE s.id = selected_scenario AND s."householdId" = hh;

  IF res IS NULL THEN
    RAISE EXCEPTION 'Scenario not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION app.list_scenarios(selected_goal uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  hh uuid := nullif(current_setting('joint.household_id', true), '')::uuid;
  res jsonb;
BEGIN
  IF hh IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app."Goal" g WHERE g.id = selected_goal AND g."householdId" = hh
  ) THEN
    RAISE EXCEPTION 'Goal not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'schema', 'scenario',
      'schemaVersion', 1,
      'id', s.id,
      'householdId', s."householdId",
      'goalId', s."goalId",
      'version', s.version,
      'input', s.input,
      'createdAt', to_char(s."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) ORDER BY s.version DESC
  ), '[]'::jsonb) INTO res
  FROM app."Scenario" s
  WHERE s."goalId" = selected_goal AND s."householdId" = hh;

  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION app.write_projection_run(
  selected_goal uuid,
  run_id uuid,
  selected_scenario uuid,
  run_mode app."ProjectionMode",
  canonical_input text,
  input_data jsonb,
  result_data jsonb,
  engine_ver varchar(32),
  dataset_ver integer,
  grant_ver integer,
  source_valuations jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  hh uuid := nullif(current_setting('joint.household_id', true), '')::uuid;
  mem uuid := nullif(current_setting('joint.membership_id', true), '')::uuid;
  input_hash char(64);
  valuations_out jsonb;
  src record;
BEGIN
  IF hh IS NULL OR mem IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app."Membership" m
    WHERE m."householdId" = hh AND m.id = mem AND m.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Active membership required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app."Goal" g WHERE g.id = selected_goal AND g."householdId" = hh
  ) THEN
    RAISE EXCEPTION 'Goal not found' USING ERRCODE = 'P0002';
  END IF;

  IF dataset_ver IS NULL OR dataset_ver <= 0 THEN
    SELECT coalesce(g.version, 1) INTO dataset_ver
    FROM app."Goal" g WHERE g.id = selected_goal AND g."householdId" = hh;
  END IF;

  IF grant_ver IS NULL OR grant_ver < 0 THEN
    grant_ver := coalesce(nullif(current_setting('joint.grant_version', true), '')::integer, 0);
  END IF;

  input_hash := encode(sha256(convert_to(canonical_input, 'UTF8')), 'hex');

  INSERT INTO app."ProjectionRun" (
    id, "householdId", "goalId", "scenarioId", mode, "canonicalInput", input, "inputHash",
    result, "engineVersion", "roundingConvention", "datasetVersion", "grantVersion", "createdAt"
  ) VALUES (
    run_id, hh, selected_goal, selected_scenario, run_mode, canonical_input, input_data, input_hash,
    result_data, engine_ver, 'HALF_UP_MINOR_UNIT', dataset_ver, grant_ver, now()
  );

  -- If source_valuations not provided, populate from current GoalAllocation
  IF source_valuations IS NULL OR jsonb_array_length(source_valuations) = 0 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'accountId', a."accountId",
      'valuationId', a."valuationId"
    )), '[]'::jsonb) INTO source_valuations
    FROM app."GoalAllocation" a
    WHERE a."householdId" = hh AND a."goalId" = selected_goal;
  END IF;

  IF source_valuations IS NOT NULL AND jsonb_array_length(source_valuations) > 0 THEN
    FOR src IN SELECT * FROM jsonb_to_recordset(source_valuations) AS x("accountId" uuid, "valuationId" uuid) LOOP
      INSERT INTO app."ProjectionSource" (id, "householdId", "runId", "accountId", "valuationId")
      VALUES (gen_random_uuid(), hh, run_id, src."accountId", src."valuationId");
    END LOOP;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'accountId', s."accountId",
    'valuationId', s."valuationId",
    'asOfDate', to_char(v."asOfDate", 'YYYY-MM-DD'),
    'source', 'MANUAL'
  )), '[]'::jsonb) INTO valuations_out
  FROM app."ProjectionSource" s
  JOIN app."BalanceSnapshot" v ON v."householdId" = s."householdId" AND v."accountId" = s."accountId" AND v.id = s."valuationId"
  WHERE s."runId" = run_id AND s."householdId" = hh;

  RETURN jsonb_build_object(
    'schema', 'projection-run',
    'schemaVersion', 1,
    'id', run_id,
    'householdId', hh,
    'goalId', selected_goal,
    'scenarioId', selected_scenario,
    'mode', run_mode::text,
    'input', input_data,
    'result', result_data,
    'inputHash', input_hash,
    'engineVersion', engine_ver,
    'roundingConvention', 'HALF_UP_MINOR_UNIT',
    'source', jsonb_build_object(
      'datasetVersion', dataset_ver,
      'grantVersion', grant_ver,
      'valuations', valuations_out
    ),
    'createdAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END $$;

CREATE OR REPLACE FUNCTION app.read_projection_run(selected_run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  hh uuid := nullif(current_setting('joint.household_id', true), '')::uuid;
  mem uuid := nullif(current_setting('joint.membership_id', true), '')::uuid;
  r app."ProjectionRun";
  valuations_out jsonb;
  res_warnings text[];
  src record;
  extra_warning text;
  result_json jsonb;
BEGIN
  IF hh IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r
  FROM app."ProjectionRun"
  WHERE id = selected_run AND "householdId" = hh;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Projection run not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'accountId', s."accountId",
    'valuationId', s."valuationId",
    'asOfDate', coalesce(to_char(v."asOfDate", 'YYYY-MM-DD'), to_char(r."createdAt", 'YYYY-MM-DD')),
    'source', 'MANUAL'
  )), '[]'::jsonb) INTO valuations_out
  FROM app."ProjectionSource" s
  LEFT JOIN app."BalanceSnapshot" v ON v."householdId" = s."householdId" AND v."accountId" = s."accountId" AND v.id = s."valuationId"
  WHERE s."runId" = r.id AND s."householdId" = hh;

  -- Reauthorise sources and evaluate staleness
  SELECT array(SELECT jsonb_array_elements_text(coalesce(r.result->'warnings', '[]'::jsonb))) INTO res_warnings;

  FOR src IN
    SELECT s."accountId", s."valuationId", v."asOfDate"
    FROM app."ProjectionSource" s
    LEFT JOIN app."BalanceSnapshot" v ON v."householdId" = s."householdId" AND v."accountId" = s."accountId" AND v.id = s."valuationId"
    WHERE s."runId" = r.id AND s."householdId" = hh
  LOOP
    -- Access check
    IF mem IS NOT NULL AND NOT app.account_access(src."accountId", 'TOTALS'::app."AccountGrantLevel") THEN
      IF NOT ('PARTIAL_SOURCE' = ANY(res_warnings)) THEN
        res_warnings := array_append(res_warnings, 'PARTIAL_SOURCE');
      END IF;
    END IF;

    -- Staleness check
    IF src."asOfDate" IS NOT NULL AND EXISTS (
      SELECT 1 FROM app."BalanceSnapshot" b
      WHERE b."householdId" = hh AND b."accountId" = src."accountId" AND b."asOfDate" > src."asOfDate"
    ) THEN
      IF NOT ('STALE_VALUATION' = ANY(res_warnings)) THEN
        res_warnings := array_append(res_warnings, 'STALE_VALUATION');
      END IF;
    END IF;
  END LOOP;

  result_json := r.result || jsonb_build_object('warnings', to_jsonb(res_warnings));

  RETURN jsonb_build_object(
    'schema', 'projection-run',
    'schemaVersion', 1,
    'id', r.id,
    'householdId', r."householdId",
    'goalId', r."goalId",
    'scenarioId', r."scenarioId",
    'mode', r.mode::text,
    'input', r.input,
    'result', result_json,
    'inputHash', r."inputHash",
    'engineVersion', r."engineVersion",
    'roundingConvention', r."roundingConvention",
    'source', jsonb_build_object(
      'datasetVersion', r."datasetVersion",
      'grantVersion', r."grantVersion",
      'valuations', valuations_out
    ),
    'createdAt', to_char(r."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END $$;

CREATE OR REPLACE FUNCTION app.list_projection_runs(selected_goal uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  hh uuid := nullif(current_setting('joint.household_id', true), '')::uuid;
  res jsonb;
BEGIN
  IF hh IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app."Goal" g WHERE g.id = selected_goal AND g."householdId" = hh
  ) THEN
    RAISE EXCEPTION 'Goal not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'schema', 'projection-run',
      'schemaVersion', 1,
      'id', r.id,
      'householdId', r."householdId",
      'goalId', r."goalId",
      'scenarioId', r."scenarioId",
      'mode', r.mode::text,
      'input', r.input,
      'result', r.result,
      'inputHash', r."inputHash",
      'engineVersion', r."engineVersion",
      'roundingConvention', r."roundingConvention",
      'source', jsonb_build_object(
        'datasetVersion', r."datasetVersion",
        'grantVersion', r."grantVersion",
        'valuations', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'accountId', s."accountId",
            'valuationId', s."valuationId",
            'asOfDate', coalesce(to_char(v."asOfDate", 'YYYY-MM-DD'), to_char(r."createdAt", 'YYYY-MM-DD')),
            'source', 'MANUAL'
          ))
          FROM app."ProjectionSource" s
          LEFT JOIN app."BalanceSnapshot" v ON v."householdId" = s."householdId" AND v."accountId" = s."accountId" AND v.id = s."valuationId"
          WHERE s."runId" = r.id AND s."householdId" = hh
        ), '[]'::jsonb)
      ),
      'createdAt', to_char(r."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) ORDER BY r."createdAt" DESC
  ), '[]'::jsonb) INTO res
  FROM app."ProjectionRun" r
  WHERE r."goalId" = selected_goal AND r."householdId" = hh;

  RETURN res;
END $$;

REVOKE ALL ON FUNCTION app.write_scenario(uuid, uuid, text, jsonb) FROM PUBLIC, joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.write_scenario(uuid, uuid, text, jsonb) TO joint_app_runtime;

REVOKE ALL ON FUNCTION app.read_scenario(uuid) FROM PUBLIC, joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.read_scenario(uuid) TO joint_app_runtime;

REVOKE ALL ON FUNCTION app.list_scenarios(uuid) FROM PUBLIC, joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.list_scenarios(uuid) TO joint_app_runtime;

REVOKE ALL ON FUNCTION app.write_projection_run(uuid, uuid, uuid, app."ProjectionMode", text, jsonb, jsonb, varchar, integer, integer, jsonb) FROM PUBLIC, joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.write_projection_run(uuid, uuid, uuid, app."ProjectionMode", text, jsonb, jsonb, varchar, integer, integer, jsonb) TO joint_app_runtime;

REVOKE ALL ON FUNCTION app.read_projection_run(uuid) FROM PUBLIC, joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.read_projection_run(uuid) TO joint_app_runtime;

REVOKE ALL ON FUNCTION app.list_projection_runs(uuid) FROM PUBLIC, joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.list_projection_runs(uuid) TO joint_app_runtime;

COMMIT;
