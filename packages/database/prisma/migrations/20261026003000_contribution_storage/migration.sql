BEGIN;
-- Capture no legacy capacity, participants or history. Dormant plans stay unverified.
CREATE TABLE app."ContributionBudget" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "householdId" uuid NOT NULL UNIQUE REFERENCES app."Household"(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE("householdId",id)
);
CREATE TABLE app."ContributionBudgetParticipant" (
  "householdId" uuid NOT NULL,
  "budgetId" uuid NOT NULL,
  "membershipId" uuid NOT NULL,
  "cutoffVersion" integer CHECK("cutoffVersion">0),
  PRIMARY KEY("budgetId","membershipId"),
  FOREIGN KEY("householdId","budgetId") REFERENCES app."ContributionBudget"("householdId",id) ON DELETE CASCADE,
  FOREIGN KEY("householdId","membershipId") REFERENCES app."Membership"("householdId",id) ON DELETE CASCADE
);
CREATE INDEX "ContributionBudgetParticipant_membershipId_budgetId_idx" ON app."ContributionBudgetParticipant"("membershipId","budgetId");
CREATE TABLE app."ContributionBudgetRevision" (
  "householdId" uuid NOT NULL,
  "budgetId" uuid NOT NULL,
  version integer NOT NULL CHECK(version>0),
  "goalId" uuid,
  change jsonb NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY("budgetId",version),
  CONSTRAINT "ContributionBudgetRevision_scope_key" UNIQUE("householdId","budgetId","goalId",version),
  FOREIGN KEY("householdId","budgetId") REFERENCES app."ContributionBudget"("householdId",id) ON DELETE CASCADE,
  FOREIGN KEY("householdId","goalId") REFERENCES app."Goal"("householdId",id) ON DELETE CASCADE,
  CONSTRAINT "ContributionBudgetRevision_change" CHECK((jsonb_typeof(change)='object' AND (
    (change->>'kind'='CAPACITY' AND "goalId" IS NULL AND jsonb_typeof(change->'capacity')='object'
      AND change ?& ARRAY['kind','capacity'] AND change-'kind'-'capacity'='{}'::jsonb)
    OR (change->>'kind' IN ('PLAN','GOAL') AND "goalId" IS NOT NULL
      AND change ?& ARRAY['kind','entry'] AND change-'kind'-'entry'='{}'::jsonb
      AND jsonb_typeof(change->'entry')='object'
      AND CASE WHEN jsonb_typeof(change#>'{entry,goalVersion}')='number'
        AND change#>>'{entry,goalVersion}' ~ '^[1-9][0-9]{0,9}$'
        THEN (change#>>'{entry,goalVersion}')::numeric BETWEEN 1 AND 2147483647 ELSE false END
      AND change#>>'{entry,plan,goalId}'="goalId"::text
      AND change#>>'{entry,plan,householdId}'="householdId"::text)
  )) IS TRUE)
);
CREATE INDEX "ContributionBudgetRevision_goal_head_idx" ON app."ContributionBudgetRevision"("budgetId","goalId",version DESC);
CREATE INDEX "ContributionBudgetRevision_goal_idx" ON app."ContributionBudgetRevision"("goalId");
ALTER TABLE app."ContributionPlan" ADD COLUMN "budgetId" uuid, ADD COLUMN "sourceVersion" integer;
ALTER TABLE app."ContributionPlan" ADD CONSTRAINT "ContributionPlan_verified_provenance" CHECK((
  ("budgetId" IS NULL AND "sourceVersion" IS NULL)
  OR ("budgetId" IS NOT NULL AND "sourceVersion" IS NOT NULL AND "sourceVersion">0)
) IS TRUE);
ALTER TABLE app."ContributionPlan" ADD CONSTRAINT "ContributionPlan_budget_fkey"
  FOREIGN KEY("householdId","budgetId") REFERENCES app."ContributionBudget"("householdId",id) ON DELETE CASCADE;
ALTER TABLE app."ContributionPlan" ADD CONSTRAINT "ContributionPlan_sourceRevision_fkey"
  FOREIGN KEY("householdId","budgetId","goalId","sourceVersion")
    REFERENCES app."ContributionBudgetRevision"("householdId","budgetId","goalId",version) ON DELETE NO ACTION;
CREATE INDEX "ContributionPlan_source_revision_idx" ON app."ContributionPlan"("householdId","budgetId","goalId","sourceVersion");

ALTER TABLE app."ContributionBudget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ContributionBudget" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."ContributionBudgetParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ContributionBudgetParticipant" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."ContributionBudgetRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ContributionBudgetRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."ContributionBudget" TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY maintenance ON app."ContributionBudgetParticipant" TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY maintenance ON app."ContributionBudgetRevision" TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON app."ContributionBudget",app."ContributionBudgetParticipant",app."ContributionBudgetRevision" FROM PUBLIC,joint_app_runtime;

CREATE FUNCTION app.contribution_revision_is_retained(budget_id uuid, revision_version integer, goal_id uuid, goal_version integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM app."ContributionBudgetParticipant" b
    JOIN app."Membership" m ON m.id=b."membershipId" JOIN app."User" u ON u.id=m."userId"
    WHERE b."budgetId"=budget_id AND u.status<>'DELETED'
      AND (b."cutoffVersion" IS NULL OR b."cutoffVersion">=revision_version)
      AND (goal_id IS NULL OR EXISTS(SELECT 1 FROM app."GoalParticipant" p
        WHERE p."membershipId"=b."membershipId" AND p."goalId"=goal_id
          AND (p."cutoffVersion" IS NULL OR p."cutoffVersion">=goal_version))))
$$;
CREATE FUNCTION app.guard_contribution_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' OR (
    EXISTS(SELECT 1 FROM app."ContributionBudget" WHERE id=OLD."budgetId")
    AND (OLD."goalId" IS NULL OR EXISTS(SELECT 1 FROM app."Goal" WHERE id=OLD."goalId"))
    AND app.contribution_revision_is_retained(OLD."budgetId",OLD.version,OLD."goalId",(OLD.change#>>'{entry,goalVersion}')::integer)
  ) THEN RAISE EXCEPTION 'Contribution history is immutable' USING ERRCODE='23514'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER contribution_revision_immutable BEFORE UPDATE OR DELETE ON app."ContributionBudgetRevision"
  FOR EACH ROW EXECUTE FUNCTION app.guard_contribution_revision();
REVOKE ALL ON FUNCTION app.contribution_revision_is_retained(uuid,integer,uuid,integer),app.guard_contribution_revision() FROM PUBLIC,joint_app_runtime;
COMMIT;
