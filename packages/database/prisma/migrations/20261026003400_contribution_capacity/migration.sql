BEGIN;
CREATE FUNCTION app.record_contribution_revision(selected_budget uuid, expected_version integer, selected_goal uuid, payload jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE next_version integer; hh uuid; stamp timestamptz(3):=clock_timestamp();
BEGIN
  IF expected_version=0 THEN
    UPDATE app."ContributionBudget" b SET "updatedAt"=stamp WHERE b.id=selected_budget AND b.version=1
      AND NOT EXISTS(SELECT 1 FROM app."ContributionBudgetRevision" r WHERE r."budgetId"=b.id)
      RETURNING b.version,b."householdId" INTO next_version,hh;
  ELSE
    UPDATE app."ContributionBudget" b SET version=b.version+1,"updatedAt"=stamp
      WHERE b.id=selected_budget AND b.version=expected_version AND b.version<2147483647
      RETURNING b.version,b."householdId" INTO next_version,hh;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contribution version conflict' USING ERRCODE='40001'; END IF;
  INSERT INTO app."ContributionBudgetRevision"("householdId","budgetId",version,"goalId",change,"createdAt")
    VALUES(hh,selected_budget,next_version,selected_goal,payload,stamp);
  RETURN next_version;
END $$;
CREATE FUNCTION app.write_contribution_capacity(expected_version integer, input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scope record; hh uuid:=nullif(current_setting('joint.household_id',true),'')::uuid;
  previous jsonb; next_version integer;
BEGIN
  SELECT * INTO scope FROM app.lock_contribution_scope(NULL,true);
  IF scope.archived THEN RAISE EXCEPTION 'Unavailable contribution budget' USING ERRCODE='42501'; END IF;
  PERFORM app.assert_contribution_legacy_clear(hh);
  IF expected_version IS NULL OR expected_version<0 THEN RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023'; END IF;
  PERFORM app.validate_contribution_schedule(input,true);
  IF scope.budget_id IS NULL THEN
    IF expected_version<>0 THEN RAISE EXCEPTION 'Unavailable contribution budget' USING ERRCODE='P0002'; END IF;
    INSERT INTO app."ContributionBudget"("householdId") VALUES(hh) RETURNING id INTO scope.budget_id;
    INSERT INTO app."ContributionBudgetParticipant"("householdId","budgetId","membershipId")
      SELECT hh,scope.budget_id,m.id FROM app."Membership" m JOIN app."User" u ON u.id=m."userId"
        WHERE m."householdId"=hh AND m.status='ACTIVE' AND u.status='ACTIVE';
  ELSE
    IF scope.ceiling<>expected_version THEN RAISE EXCEPTION 'Contribution version conflict' USING ERRCODE='40001'; END IF;
    SELECT change->'capacity' INTO previous FROM app."ContributionBudgetRevision"
      WHERE "budgetId"=scope.budget_id AND "goalId" IS NULL ORDER BY version DESC LIMIT 1;
    IF previous=input THEN
      PERFORM app.lock_contribution_scope(scope.budget_id,false);
      RETURN app.contribution_budget_view(scope.budget_id,scope.ceiling,false,NULL);
    END IF;
  END IF;
  next_version:=app.record_contribution_revision(scope.budget_id,expected_version,NULL,jsonb_build_object('kind','CAPACITY','capacity',input));
  UPDATE app."Household" SET revision=revision+1 WHERE id=hh;
  INSERT INTO app."AuditEvent"(id,"userId","householdId",action)
    VALUES(gen_random_uuid(),nullif(current_setting('joint.user_id',true),'')::uuid,hh,'CONTRIBUTION_CAPACITY_UPDATED');
  PERFORM app.lock_contribution_scope(scope.budget_id,false);
  RETURN app.contribution_budget_view(scope.budget_id,next_version,false,NULL);
END $$;
REVOKE ALL ON FUNCTION app.record_contribution_revision(uuid,integer,uuid,jsonb),app.write_contribution_capacity(integer,jsonb) FROM PUBLIC,joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.write_contribution_capacity(integer,jsonb) TO joint_app_runtime;
COMMIT;
