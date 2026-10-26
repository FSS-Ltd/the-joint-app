BEGIN;
CREATE FUNCTION app.purge_contribution_participation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected uuid[]; budget_id uuid; head record;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='DELETED' THEN
    SELECT coalesce(array_agg(p."budgetId" ORDER BY p."budgetId"),ARRAY[]::uuid[]) INTO affected
      FROM app."ContributionBudgetParticipant" p JOIN app."Membership" m ON m.id=p."membershipId" WHERE m."userId"=NEW.id;
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
-- Goal participant purge runs first; deleted rights cannot justify this history.
CREATE TRIGGER zz_contribution_purge AFTER UPDATE OF status ON app."User" FOR EACH ROW EXECUTE FUNCTION app.purge_contribution_participation();
REVOKE ALL ON FUNCTION app.purge_contribution_participation() FROM PUBLIC,joint_app_runtime;
COMMIT;
