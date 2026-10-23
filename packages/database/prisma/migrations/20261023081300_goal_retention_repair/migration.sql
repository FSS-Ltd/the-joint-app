BEGIN;
-- Repair any earlier local/intermediate purge that left data beyond all
-- surviving exit cutoffs. Unclassified legacy rows and live rights are untouched.
DO $$ DECLARE retained record; BEGIN
  FOR retained IN
    SELECT g.id,max(p."cutoffVersion") AS ceiling FROM app."Goal" g
      JOIN app."GoalParticipant" p ON p."goalId"=g.id
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
END $$;
COMMIT;
