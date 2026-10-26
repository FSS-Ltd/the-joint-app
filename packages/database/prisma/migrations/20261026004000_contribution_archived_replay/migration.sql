BEGIN;
CREATE FUNCTION app.contribution_goal_shared(selected_budget uuid, selected_goal uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM app."Goal" g JOIN app."ContributionBudget" b ON b."householdId"=g."householdId"
    WHERE b.id=selected_budget AND g.id=selected_goal AND app.goal_ceiling(g.id,false) IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM app."ContributionBudgetParticipant" c
        JOIN app."Membership" m ON m.id=c."membershipId" JOIN app."User" u ON u.id=m."userId"
        WHERE c."budgetId"=b.id AND c."cutoffVersion" IS NULL AND m.status='ACTIVE' AND u.status='ACTIVE'
          AND NOT EXISTS(SELECT 1 FROM app."GoalParticipant" p
            WHERE p."goalId"=g.id AND p."membershipId"=m.id AND p."cutoffVersion" IS NULL)))
$$;
CREATE OR REPLACE FUNCTION app.contribution_goal_writable(selected_budget uuid, selected_goal uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM app."Goal" WHERE id=selected_goal AND status='ACTIVE')
    AND app.contribution_goal_shared(selected_budget,selected_goal)
$$;
-- Archival retains read/replay rights; the actual writer still requires ACTIVE.
CREATE OR REPLACE FUNCTION app.authorize_contribution_write(selected_goal uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scope record;
BEGIN
  SELECT * INTO scope FROM app.lock_contribution_scope(NULL,selected_goal IS NULL);
  IF scope.archived THEN RAISE EXCEPTION 'Unavailable contribution budget' USING ERRCODE='42501'; END IF;
  PERFORM app.assert_contribution_legacy_clear(nullif(current_setting('joint.household_id',true),'')::uuid);
  IF selected_goal IS NOT NULL THEN
    IF NOT app.contribution_goal_shared(scope.budget_id,selected_goal) THEN
      RAISE EXCEPTION 'Unavailable contribution plan' USING ERRCODE='P0002';
    END IF;
    PERFORM id FROM app."Goal" WHERE id=selected_goal FOR UPDATE;
    PERFORM id FROM app."ContributionPlan" WHERE "budgetId"=scope.budget_id AND "goalId"=selected_goal FOR UPDATE;
    SELECT * INTO scope FROM app.lock_contribution_scope(scope.budget_id,false);
    IF NOT app.contribution_goal_shared(scope.budget_id,selected_goal) THEN
      RAISE EXCEPTION 'Unavailable contribution plan' USING ERRCODE='P0002';
    END IF;
    PERFORM app.assert_contribution_legacy_clear(nullif(current_setting('joint.household_id',true),'')::uuid);
  END IF;
END $$;
REVOKE ALL ON FUNCTION app.contribution_goal_shared(uuid,uuid),app.contribution_goal_writable(uuid,uuid) FROM PUBLIC,joint_app_runtime;
COMMIT;
