BEGIN;
CREATE FUNCTION app.contribution_budget_authorized(selected_budget uuid, maximum_version integer, archived boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT NOT EXISTS(SELECT 1 FROM (
    SELECT DISTINCT ON(r."goalId") r."goalId",r."householdId",(r.change#>>'{entry,goalVersion}')::integer AS goal_version
      FROM app."ContributionBudgetRevision" r WHERE r."budgetId"=selected_budget AND r.version<=maximum_version AND r."goalId" IS NOT NULL
      ORDER BY r."goalId",r.version DESC
  ) latest WHERE NOT EXISTS(
    SELECT 1 FROM app."GoalParticipant" p JOIN app."Membership" m ON m.id=p."membershipId" JOIN app."Goal" g ON g.id=p."goalId"
      WHERE p."goalId"=latest."goalId" AND p."householdId"=latest."householdId"
        AND m."userId"=nullif(current_setting('joint.user_id',true),'')::uuid
        AND ((archived AND m.status='LEFT' AND p."cutoffVersion">=latest.goal_version)
          OR (NOT archived AND m.status='ACTIVE' AND p."cutoffVersion" IS NULL
            AND m.id=nullif(current_setting('joint.membership_id',true),'')::uuid AND g.version>=latest.goal_version))
  ))
$$;
CREATE FUNCTION app.lock_contribution_scope(requested_budget_id uuid, permit_creation boolean)
RETURNS TABLE(budget_id uuid, ceiling integer, archived boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE latest integer; hh uuid:=nullif(current_setting('joint.household_id',true),'')::uuid;
BEGIN
  archived:=app.lock_goal_scope();
  SELECT b.id,b.version INTO budget_id,latest FROM app."ContributionBudget" b
    WHERE (requested_budget_id IS NULL OR b.id=requested_budget_id)
      AND ((archived AND requested_budget_id IS NOT NULL) OR (NOT archived AND b."householdId"=hh));
  IF NOT FOUND THEN
    IF permit_creation AND NOT archived AND requested_budget_id IS NULL THEN
      budget_id:=NULL; ceiling:=0; RETURN NEXT; RETURN;
    END IF;
    RAISE EXCEPTION 'Unavailable contribution budget' USING ERRCODE='P0002';
  END IF;
  IF archived THEN
    SELECT least(p."cutoffVersion",latest) INTO ceiling FROM app."ContributionBudgetParticipant" p
      JOIN app."Membership" m ON m.id=p."membershipId"
      WHERE p."budgetId"=budget_id AND p."cutoffVersion" IS NOT NULL AND m.status='LEFT'
        AND m."userId"=nullif(current_setting('joint.user_id',true),'')::uuid;
  ELSE
    SELECT latest INTO ceiling FROM app."ContributionBudgetParticipant" p
      JOIN app."Membership" m ON m.id=p."membershipId"
      WHERE p."budgetId"=budget_id AND p."cutoffVersion" IS NULL AND m.status='ACTIVE'
        AND m.id=nullif(current_setting('joint.membership_id',true),'')::uuid
        AND m."userId"=nullif(current_setting('joint.user_id',true),'')::uuid;
  END IF;
  IF ceiling IS NULL THEN RAISE EXCEPTION 'Unavailable contribution budget' USING ERRCODE='P0002'; END IF;
  IF NOT app.contribution_budget_authorized(budget_id,ceiling,archived) THEN
    RAISE EXCEPTION 'Unavailable contribution budget' USING ERRCODE='P0002';
  END IF;
  RETURN NEXT;
END $$;
CREATE FUNCTION app.contribution_goal_writable(selected_budget uuid, selected_goal uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM app."Goal" g JOIN app."ContributionBudget" b ON b."householdId"=g."householdId"
    WHERE b.id=selected_budget AND g.id=selected_goal AND g.status='ACTIVE'
      AND app.goal_ceiling(g.id,false) IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM app."ContributionBudgetParticipant" c
        JOIN app."Membership" m ON m.id=c."membershipId" JOIN app."User" u ON u.id=m."userId"
        WHERE c."budgetId"=b.id AND c."cutoffVersion" IS NULL AND m.status='ACTIVE' AND u.status='ACTIVE'
          AND NOT EXISTS(SELECT 1 FROM app."GoalParticipant" p
            WHERE p."goalId"=g.id AND p."membershipId"=m.id AND p."cutoffVersion" IS NULL)))
$$;
CREATE FUNCTION app.assert_contribution_legacy_clear(selected_household uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM app."ContributionPlan" WHERE "householdId"=selected_household AND "budgetId" IS NULL) THEN
    RAISE EXCEPTION 'Unavailable contribution budget' USING ERRCODE='P0002';
  END IF;
END $$;
REVOKE ALL ON FUNCTION app.contribution_budget_authorized(uuid,integer,boolean),app.lock_contribution_scope(uuid,boolean),app.contribution_goal_writable(uuid,uuid),app.assert_contribution_legacy_clear(uuid) FROM PUBLIC,joint_app_runtime;
COMMIT;
