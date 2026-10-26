BEGIN;
CREATE OR REPLACE FUNCTION app.purge_contribution_participation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected uuid[]; budget_id uuid; head record;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='DELETED' THEN
    -- Discover related goal history before goal-participant cleanup removes its links.
    SELECT coalesce(array_agg(related.id ORDER BY related.id),ARRAY[]::uuid[]) INTO affected FROM (
      SELECT p."budgetId" AS id FROM app."ContributionBudgetParticipant" p
        JOIN app."Membership" m ON m.id=p."membershipId" WHERE m."userId"=NEW.id
      UNION
      SELECT b.id FROM app."ContributionBudget" b JOIN app."GoalParticipant" p ON p."householdId"=b."householdId"
        JOIN app."Membership" m ON m.id=p."membershipId" WHERE m."userId"=NEW.id
          AND EXISTS(SELECT 1 FROM app."ContributionBudgetRevision" r WHERE r."budgetId"=b.id AND r."goalId"=p."goalId")
    ) related;
    PERFORM b.id FROM app."ContributionBudget" b WHERE b.id=ANY(affected) ORDER BY b.id FOR UPDATE;
    DELETE FROM app."ContributionBudgetParticipant" p USING app."Membership" m
      WHERE m.id=p."membershipId" AND m."userId"=NEW.id;
    FOREACH budget_id IN ARRAY affected LOOP
      IF NOT EXISTS(SELECT 1 FROM app."ContributionBudgetParticipant" WHERE "budgetId"=budget_id) THEN
        DELETE FROM app."ContributionBudget" WHERE id=budget_id;
      ELSIF NOT EXISTS(SELECT 1 FROM app."ContributionBudgetParticipant" p
        JOIN app."Membership" m ON m.id=p."membershipId" JOIN app."User" u ON u.id=m."userId"
        WHERE p."budgetId"=budget_id AND p."cutoffVersion" IS NULL AND m.status='ACTIVE' AND u.status='ACTIVE') THEN
        -- Read-only archives reconstruct retained intent from immutable events.
        DELETE FROM app."ContributionPlan" WHERE "budgetId"=budget_id;
        DELETE FROM app."ContributionBudgetRevision" r WHERE r."budgetId"=budget_id
          AND NOT app.contribution_revision_is_retained(r."budgetId",r.version,r."goalId",(r.change#>>'{entry,goalVersion}')::integer);
        SELECT r.version,r."createdAt" INTO head FROM app."ContributionBudgetRevision" r
          WHERE r."budgetId"=budget_id ORDER BY r.version DESC LIMIT 1;
        IF head.version IS NULL THEN DELETE FROM app."ContributionBudget" WHERE id=budget_id;
        ELSE UPDATE app."ContributionBudget" SET version=head.version,"updatedAt"=head."createdAt" WHERE id=budget_id;
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
-- User is already DELETED, so the retention predicate excludes their rights.
-- Run before goal cleanup; afterward a non-budget participant's links are gone.
DROP TRIGGER zz_contribution_purge ON app."User";
CREATE TRIGGER contribution_participant_purge AFTER UPDATE OF status ON app."User"
  FOR EACH ROW EXECUTE FUNCTION app.purge_contribution_participation();
REVOKE ALL ON FUNCTION app.purge_contribution_participation() FROM PUBLIC,joint_app_runtime;
COMMIT;
