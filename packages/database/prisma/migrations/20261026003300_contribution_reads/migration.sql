BEGIN;
CREATE FUNCTION app.contribution_budget_view(selected_budget uuid, maximum_version integer, archived boolean, selected_goal uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b app."ContributionBudget"; capacity jsonb; stamp timestamptz; plans jsonb; selected jsonb;
BEGIN
  SELECT * INTO b FROM app."ContributionBudget" WHERE id=selected_budget;
  SELECT change->'capacity' INTO capacity FROM app."ContributionBudgetRevision"
    WHERE "budgetId"=selected_budget AND version<=maximum_version AND "goalId" IS NULL ORDER BY version DESC LIMIT 1;
  SELECT "createdAt" INTO stamp FROM app."ContributionBudgetRevision" WHERE "budgetId"=selected_budget AND version=maximum_version;
  IF b.id IS NULL OR capacity IS NULL OR stamp IS NULL THEN
    RAISE EXCEPTION 'Unavailable contribution budget' USING ERRCODE='P0002';
  END IF;
  WITH latest AS (
    SELECT DISTINCT ON(r."goalId") r."goalId",r.change->'entry' AS entry FROM app."ContributionBudgetRevision" r
      WHERE r."budgetId"=selected_budget AND r.version<=maximum_version AND r."goalId" IS NOT NULL
      ORDER BY r."goalId",r.version DESC
  ), bounded AS (SELECT * FROM latest WHERE entry->>'status'='ACTIVE' ORDER BY "goalId" LIMIT 51)
  SELECT coalesce(jsonb_agg(entry ORDER BY "goalId"),'[]'::jsonb) INTO plans FROM bounded;
  IF jsonb_array_length(plans)>50 THEN RAISE EXCEPTION 'CONTRIBUTION_PLAN_LIMIT' USING ERRCODE='P0001'; END IF;
  IF selected_goal IS NOT NULL THEN
    SELECT change->'entry' INTO selected FROM app."ContributionBudgetRevision"
      WHERE "budgetId"=selected_budget AND "goalId"=selected_goal AND version<=maximum_version ORDER BY version DESC LIMIT 1;
    IF selected IS NULL THEN RAISE EXCEPTION 'Unavailable contribution plan' USING ERRCODE='P0002'; END IF;
  END IF;
  IF NOT app.contribution_budget_authorized(selected_budget,maximum_version,archived) THEN
    RAISE EXCEPTION 'Unavailable contribution budget' USING ERRCODE='P0002';
  END IF;
  RETURN jsonb_build_object('budget',jsonb_build_object('schema','contribution-budget','schemaVersion',1,
    'id',b.id,'householdId',b."householdId",'version',maximum_version,
    'updatedAt',to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'capacity',capacity),
    'plans',plans,'selectedPlan',selected);
END $$;
CREATE FUNCTION app.read_contribution_budget(requested_budget uuid, selected_goal uuid, after_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scope record; view jsonb; entries jsonb; next_version integer;
BEGIN
  SELECT * INTO scope FROM app.lock_contribution_scope(requested_budget,false);
  IF after_version IS NULL OR after_version<0 THEN RAISE EXCEPTION 'Invalid contribution cursor' USING ERRCODE='22023'; END IF;
  view:=app.contribution_budget_view(scope.budget_id,scope.ceiling,scope.archived,selected_goal);
  WITH bounded AS MATERIALIZED (
    SELECT *,row_number() OVER(ORDER BY version) AS position FROM app."ContributionBudgetRevision"
      WHERE "budgetId"=scope.budget_id AND version>after_version AND version<=scope.ceiling
        AND (selected_goal IS NULL OR "goalId" IS NULL OR "goalId"=selected_goal) ORDER BY version LIMIT 51
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('budgetId',"budgetId",'householdId',"householdId",'version',version,
      'createdAt',to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'change',change)
      ORDER BY version) FILTER(WHERE position<=50),'[]'::jsonb),
      CASE WHEN count(*)>50 THEN max(version) FILTER(WHERE position<=50) ELSE NULL END INTO entries,next_version FROM bounded;
  PERFORM app.lock_contribution_scope(scope.budget_id,false);
  RETURN jsonb_build_object('view',view,'history',entries,'nextAfterVersion',next_version);
END $$;
CREATE FUNCTION app.list_archived_contribution_budgets(after_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entries jsonb; next_id uuid;
BEGIN
  IF NOT app.lock_goal_scope() THEN RAISE EXCEPTION 'Unavailable contribution archive' USING ERRCODE='42501'; END IF;
  WITH bounded AS MATERIALIZED (
    SELECT b.id,b."householdId",row_number() OVER(ORDER BY b.id) AS position FROM app."ContributionBudget" b
      JOIN app."ContributionBudgetParticipant" p ON p."budgetId"=b.id JOIN app."Membership" m ON m.id=p."membershipId"
      WHERE m."userId"=nullif(current_setting('joint.user_id',true),'')::uuid AND m.status='LEFT' AND p."cutoffVersion" IS NOT NULL
        AND (after_id IS NULL OR b.id>after_id) ORDER BY b.id LIMIT 51
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'householdId',"householdId") ORDER BY id) FILTER(WHERE position<=50),'[]'::jsonb),
    CASE WHEN count(*)>50 THEN (array_agg(id ORDER BY id) FILTER(WHERE position<=50))[50] ELSE NULL END INTO entries,next_id FROM bounded;
  IF NOT coalesce(app.archive_scope_is_valid(),false) THEN RAISE EXCEPTION 'Unavailable contribution archive' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('budgets',entries,'nextAfterId',next_id);
END $$;
REVOKE ALL ON FUNCTION app.contribution_budget_view(uuid,integer,boolean,uuid),app.read_contribution_budget(uuid,uuid,integer),app.list_archived_contribution_budgets(uuid) FROM PUBLIC,joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.read_contribution_budget(uuid,uuid,integer),app.list_archived_contribution_budgets(uuid) TO joint_app_runtime;
COMMIT;
