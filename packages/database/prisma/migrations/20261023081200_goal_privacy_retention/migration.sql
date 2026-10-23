BEGIN;
-- A frozen participant justifies only the history through their exit cutoff.
CREATE OR REPLACE FUNCTION app.capture_goal_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.version<OLD.version THEN
    -- Privacy maintenance may restore only the exact surviving immutable head.
    -- There is no session flag or runtime table privilege that can enable this.
    IF EXISTS (SELECT 1 FROM app."GoalRevision" r WHERE r."goalId"=NEW.id
        AND r.version=NEW.version AND r.data=app.goal_data(NEW))
      AND NEW.version=(SELECT max(p."cutoffVersion") FROM app."GoalParticipant" p WHERE p."goalId"=NEW.id)
      AND NOT EXISTS (SELECT 1 FROM app."GoalParticipant" p WHERE p."goalId"=NEW.id AND p."cutoffVersion" IS NULL) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Goal history is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.version<>OLD.version+1 THEN
    RAISE EXCEPTION 'Goal version must advance once' USING ERRCODE='23514';
  END IF;
  INSERT INTO app."GoalRevision" ("householdId","goalId",version,data)
    VALUES (NEW."householdId",NEW.id,NEW.version,app.goal_data(NEW));
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app.guard_goal_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' OR (
    EXISTS (SELECT 1 FROM app."Goal" WHERE id=OLD."goalId")
    AND EXISTS (SELECT 1 FROM app."GoalParticipant" p WHERE p."goalId"=OLD."goalId"
      AND (p."cutoffVersion" IS NULL OR p."cutoffVersion">=OLD.version))
  ) THEN
    RAISE EXCEPTION 'Goal history is immutable' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
END $$;
CREATE OR REPLACE FUNCTION app.purge_goal_participation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected uuid[]; retained record;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='DELETED' THEN
    SELECT coalesce(array_agg(p."goalId"),ARRAY[]::uuid[]) INTO affected FROM app."GoalParticipant" p
      JOIN app."Membership" m ON m.id=p."membershipId" WHERE m."userId"=NEW.id;
    DELETE FROM app."GoalParticipant" p USING app."Membership" m
      WHERE m.id=p."membershipId" AND m."userId"=NEW.id;
    DELETE FROM app."Goal" g WHERE g.id=ANY(affected)
      AND NOT EXISTS (SELECT 1 FROM app."GoalParticipant" p WHERE p."goalId"=g.id);
    FOR retained IN
      SELECT g.id,max(p."cutoffVersion") AS ceiling FROM app."Goal" g
        JOIN app."GoalParticipant" p ON p."goalId"=g.id WHERE g.id=ANY(affected)
        GROUP BY g.id HAVING count(*)=count(p."cutoffVersion") AND max(p."cutoffVersion")<g.version
        ORDER BY g.id
    LOOP
      DELETE FROM app."GoalRevision" WHERE "goalId"=retained.id AND version>retained.ceiling;
      UPDATE app."Goal" g SET name=r.data->>'name',status=(r.data->>'status')::app."GoalStatus",
        beneficiary=r.data->>'beneficiary',priority=(r.data->>'priority')::integer,
        "targetMinor"=(r.data->'target'->>'amountMinor')::bigint,"targetDate"=(r.data->>'targetDate')::date,
        version=retained.ceiling FROM app."GoalRevision" r
        WHERE g.id=retained.id AND r."goalId"=g.id AND r.version=retained.ceiling;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
COMMIT;
