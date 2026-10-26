BEGIN;
CREATE FUNCTION app.contribution_plan_entry(selected_goal uuid, plan_id uuid, plan_version integer, input jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('goalVersion',g.version,'priority',g.priority,'status',g.status,
    'plan',jsonb_build_object('schema','contribution-plan','schemaVersion',1,'id',plan_id,'householdId',g."householdId",
      'goalId',g.id,'version',plan_version,'firstContributionDate',input->'firstContributionDate','monthlyContributions',input->'monthlyContributions'))
    FROM app."Goal" g WHERE g.id=selected_goal
$$;
CREATE FUNCTION app.write_contribution_plan(selected_goal uuid, expected_version integer, input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scope record; g app."Goal"; previous app."ContributionPlan"; prior jsonb;
  plan_id uuid; plan_version integer; next_version integer; entry jsonb;
BEGIN
  SELECT * INTO scope FROM app.lock_contribution_scope(NULL,false);
  IF scope.archived OR NOT app.contribution_goal_writable(scope.budget_id,selected_goal) THEN
    RAISE EXCEPTION 'Unavailable contribution plan' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO g FROM app."Goal" WHERE id=selected_goal FOR UPDATE;
  SELECT * INTO scope FROM app.lock_contribution_scope(scope.budget_id,false);
  IF NOT app.contribution_goal_writable(scope.budget_id,selected_goal) THEN
    RAISE EXCEPTION 'Unavailable contribution plan' USING ERRCODE='P0002';
  END IF;
  PERFORM app.assert_contribution_legacy_clear(g."householdId");
  IF expected_version IS NULL OR expected_version<0 THEN RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023'; END IF;
  PERFORM app.validate_contribution_schedule(input,false);
  SELECT * INTO previous FROM app."ContributionPlan" WHERE "householdId"=g."householdId" AND "goalId"=selected_goal FOR UPDATE;
  SELECT * INTO scope FROM app.lock_contribution_scope(scope.budget_id,false);
  IF NOT app.contribution_goal_writable(scope.budget_id,selected_goal) THEN
    RAISE EXCEPTION 'Unavailable contribution plan' USING ERRCODE='P0002';
  END IF;
  PERFORM app.assert_contribution_legacy_clear(g."householdId");
  IF scope.ceiling<>expected_version OR g.version<>(input->>'expectedGoalVersion')::integer
    OR coalesce(previous.version,0)<>(input->>'expectedPlanVersion')::integer THEN
    RAISE EXCEPTION 'Contribution version conflict' USING ERRCODE='40001';
  END IF;
  SELECT change->'entry'->'plan' INTO prior FROM app."ContributionBudgetRevision"
    WHERE "budgetId"=scope.budget_id AND "goalId"=selected_goal ORDER BY version DESC LIMIT 1;
  IF prior->'firstContributionDate'=input->'firstContributionDate' AND prior->'monthlyContributions'=input->'monthlyContributions' THEN
    PERFORM app.lock_contribution_scope(scope.budget_id,false);
    RETURN app.contribution_budget_view(scope.budget_id,scope.ceiling,false,selected_goal);
  END IF;
  IF previous.id IS NULL AND (SELECT count(*) FROM app."ContributionPlan" p JOIN app."Goal" other ON other.id=p."goalId"
    WHERE p."budgetId"=scope.budget_id AND other.status='ACTIVE')>=50 THEN
    RAISE EXCEPTION 'CONTRIBUTION_PLAN_LIMIT' USING ERRCODE='P0001';
  END IF;
  IF previous.version>=2147483647 THEN RAISE EXCEPTION 'Contribution version conflict' USING ERRCODE='40001'; END IF;
  plan_id:=coalesce(previous.id,gen_random_uuid()); plan_version:=coalesce(previous.version,0)+1;
  entry:=app.contribution_plan_entry(selected_goal,plan_id,plan_version,input);
  next_version:=app.record_contribution_revision(scope.budget_id,expected_version,selected_goal,jsonb_build_object('kind','PLAN','entry',entry));
  IF previous.id IS NULL THEN
    INSERT INTO app."ContributionPlan"(id,"householdId","goalId",version,"firstContributionDate","budgetId","sourceVersion")
      VALUES(plan_id,g."householdId",selected_goal,plan_version,(input->>'firstContributionDate')::date,scope.budget_id,next_version);
  ELSE
    UPDATE app."ContributionPlan" SET version=plan_version,"firstContributionDate"=(input->>'firstContributionDate')::date,
      "sourceVersion"=next_version WHERE id=plan_id;
    DELETE FROM app."ContributionStep" WHERE "planId"=plan_id;
  END IF;
  INSERT INTO app."ContributionStep"(id,"householdId","planId","fromMonth","amountMinor")
    SELECT gen_random_uuid(),g."householdId",plan_id,(step->>'fromMonth')::integer,(step->'amount'->>'amountMinor')::bigint
      FROM jsonb_array_elements(input->'monthlyContributions') step;
  UPDATE app."Household" SET revision=revision+1 WHERE id=g."householdId";
  INSERT INTO app."AuditEvent"(id,"userId","householdId",action)
    VALUES(gen_random_uuid(),nullif(current_setting('joint.user_id',true),'')::uuid,g."householdId",'CONTRIBUTION_PLAN_UPDATED');
  PERFORM app.lock_contribution_scope(scope.budget_id,false);
  RETURN app.contribution_budget_view(scope.budget_id,next_version,false,selected_goal);
END $$;
REVOKE ALL ON FUNCTION app.contribution_plan_entry(uuid,uuid,integer,jsonb),app.write_contribution_plan(uuid,integer,jsonb) FROM PUBLIC,joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.write_contribution_plan(uuid,integer,jsonb) TO joint_app_runtime;
COMMIT;
