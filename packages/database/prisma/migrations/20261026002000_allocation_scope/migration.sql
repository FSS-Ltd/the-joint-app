BEGIN;
-- The entire selected scope is authorized before any financial assessment.
CREATE FUNCTION app.lock_allocation_scope(goal_id uuid, account_ids uuid[]) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE archived boolean:=app.lock_goal_scope(); source_id uuid; g app."Goal";
BEGIN
  IF account_ids IS NULL OR cardinality(account_ids) NOT BETWEEN 1 AND 50
    OR array_ndims(account_ids)<>1 OR array_position(account_ids,NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(account_ids) id)<>cardinality(account_ids) THEN
    RAISE EXCEPTION 'Invalid allocation scope' USING ERRCODE='22023';
  END IF;
  IF app.goal_ceiling(goal_id,archived) IS NULL THEN RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='P0002'; END IF;
  FOR source_id IN SELECT id FROM unnest(account_ids) id ORDER BY id LOOP
    PERFORM 1 FROM app."Account" WHERE id=source_id AND (archived OR "householdId"=nullif(current_setting('joint.household_id',true),'')::uuid) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='P0002'; END IF;
  END LOOP;
  SELECT * INTO g FROM app."Goal" WHERE id=goal_id
    AND (archived OR "householdId"=nullif(current_setting('joint.household_id',true),'')::uuid) FOR UPDATE;
  IF g.id IS NULL OR app.goal_ceiling(goal_id,archived) IS NULL
    OR EXISTS(SELECT 1 FROM app."Account" WHERE id=ANY(account_ids) AND "householdId"<>g."householdId") THEN
    RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='P0002';
  END IF;
  IF archived THEN
    IF NOT coalesce(app.archive_scope_is_valid(),false) THEN RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='42501'; END IF;
    IF EXISTS(SELECT 1 FROM unnest(account_ids) selected(source_id) WHERE NOT EXISTS(
      SELECT 1 FROM app."AccountOwner" o JOIN app."Membership" m ON m.id=o."membershipId"
      WHERE o."accountId"=selected.source_id AND o."userId"=nullif(current_setting('joint.user_id',true),'')::uuid
        AND o.status='ARCHIVED' AND m.status='LEFT')) THEN
      RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='P0002';
    END IF;
  ELSE
    IF NOT coalesce(app.scope_is_valid(),false) THEN RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='42501'; END IF;
    IF EXISTS(SELECT 1 FROM unnest(account_ids) id WHERE NOT app.owns_account(id))
      OR EXISTS(SELECT 1 FROM app."Account" WHERE id=ANY(account_ids) AND "archivedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='P0002';
    END IF;
  END IF;
  RETURN archived;
END $$;
CREATE FUNCTION app.allocation_source_ceiling(account_id uuid, archived boolean) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT CASE WHEN archived THEN least(coalesce(s.version,0),o."allocationCutoffVersion") ELSE coalesce(s.version,0) END
  FROM app."AccountOwner" o LEFT JOIN app."AccountAllocationState" s ON s."accountId"=o."accountId"
  WHERE o."accountId"=account_id AND o."userId"=nullif(current_setting('joint.user_id',true),'')::uuid
$$;
REVOKE ALL ON FUNCTION app.lock_allocation_scope(uuid,uuid[]),app.allocation_source_ceiling(uuid,boolean) FROM PUBLIC,joint_app_runtime;
COMMIT;
