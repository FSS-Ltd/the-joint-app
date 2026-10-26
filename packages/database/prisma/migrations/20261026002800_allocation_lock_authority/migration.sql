BEGIN;
CREATE FUNCTION app.allocation_source_is_authorized(account_id uuid, goal_id uuid, archived boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM app."Account" a JOIN app."Goal" g ON g."householdId"=a."householdId"
    WHERE a.id=account_id AND g.id=goal_id AND CASE WHEN archived THEN EXISTS(
      SELECT 1 FROM app."AccountOwner" o JOIN app."Membership" m ON m.id=o."membershipId"
      WHERE o."accountId"=a.id AND o."userId"=nullif(current_setting('joint.user_id',true),'')::uuid
        AND o.status='ARCHIVED' AND m.status='LEFT')
    ELSE a."archivedAt" IS NULL AND app.owns_account(a.id) END)
$$;
CREATE OR REPLACE FUNCTION app.lock_allocation_scope(goal_id uuid, account_ids uuid[]) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE archived boolean:=app.lock_goal_scope(); source_id uuid; g app."Goal";
BEGIN
  IF account_ids IS NULL OR cardinality(account_ids) NOT BETWEEN 1 AND 50
    OR array_ndims(account_ids)<>1 OR array_position(account_ids,NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(account_ids) id)<>cardinality(account_ids) THEN
    RAISE EXCEPTION 'Invalid allocation scope' USING ERRCODE='22023';
  END IF;
  -- Denied selections must not acquire another owner's locks, including while
  -- waiting for a later source in a mixed selection. Recheck after all waits.
  IF app.goal_ceiling(goal_id,archived) IS NULL
    OR EXISTS(SELECT 1 FROM unnest(account_ids) selected(id) WHERE NOT app.allocation_source_is_authorized(selected.id,goal_id,archived)) THEN
    RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='P0002';
  END IF;
  FOR source_id IN SELECT id FROM unnest(account_ids) id ORDER BY id LOOP
    PERFORM 1 FROM app."Account" WHERE id=source_id AND "householdId"=(SELECT "householdId" FROM app."Goal" WHERE id=goal_id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='P0002'; END IF;
  END LOOP;
  SELECT * INTO g FROM app."Goal" WHERE id=goal_id
    AND (archived OR "householdId"=nullif(current_setting('joint.household_id',true),'')::uuid) FOR UPDATE;
  IF g.id IS NULL OR app.goal_ceiling(goal_id,archived) IS NULL THEN
    RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='P0002';
  END IF;
  IF archived THEN
    IF NOT coalesce(app.archive_scope_is_valid(),false) THEN RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='42501'; END IF;
  ELSE
    IF NOT coalesce(app.scope_is_valid(),false) THEN RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='42501'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(account_ids) selected(id) WHERE NOT app.allocation_source_is_authorized(selected.id,goal_id,archived)) THEN
    RAISE EXCEPTION 'Unavailable allocation scope' USING ERRCODE='P0002';
  END IF;
  RETURN archived;
END $$;
REVOKE ALL ON FUNCTION app.allocation_source_is_authorized(uuid,uuid,boolean),app.lock_allocation_scope(uuid,uuid[]) FROM PUBLIC,joint_app_runtime;
COMMIT;
