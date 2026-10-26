BEGIN;
-- Authorize first creation and new plans without performing a financial write.
CREATE FUNCTION app.authorize_contribution_write(selected_goal uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scope record;
BEGIN
  SELECT * INTO scope FROM app.lock_contribution_scope(NULL,selected_goal IS NULL);
  IF scope.archived THEN RAISE EXCEPTION 'Unavailable contribution budget' USING ERRCODE='42501'; END IF;
  PERFORM app.assert_contribution_legacy_clear(nullif(current_setting('joint.household_id',true),'')::uuid);
  IF selected_goal IS NOT NULL THEN
    IF NOT app.contribution_goal_writable(scope.budget_id,selected_goal) THEN
      RAISE EXCEPTION 'Unavailable contribution plan' USING ERRCODE='P0002';
    END IF;
    PERFORM id FROM app."Goal" WHERE id=selected_goal FOR UPDATE;
    PERFORM id FROM app."ContributionPlan" WHERE "budgetId"=scope.budget_id AND "goalId"=selected_goal FOR UPDATE;
    SELECT * INTO scope FROM app.lock_contribution_scope(scope.budget_id,false);
    IF NOT app.contribution_goal_writable(scope.budget_id,selected_goal) THEN
      RAISE EXCEPTION 'Unavailable contribution plan' USING ERRCODE='P0002';
    END IF;
    PERFORM app.assert_contribution_legacy_clear(nullif(current_setting('joint.household_id',true),'')::uuid);
  END IF;
END $$;
REVOKE ALL ON FUNCTION app.authorize_contribution_write(uuid) FROM PUBLIC,joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.authorize_contribution_write(uuid) TO joint_app_runtime;
COMMIT;
