BEGIN;

CREATE TYPE app."GoalStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE app."AllocationBasis" AS ENUM ('FIXED', 'FRACTION');
CREATE TYPE app."ProjectionMode" AS ENUM ('BASIC', 'ADVANCED');

-- Existing snapshot identity needs a tenant and account matched target for new references.
CREATE UNIQUE INDEX "BalanceSnapshot_householdId_accountId_id_key"
  ON app."BalanceSnapshot"("householdId", "accountId", id);

CREATE TABLE app."Goal" (
  id uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES app."Household"(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  status app."GoalStatus" NOT NULL DEFAULT 'ACTIVE',
  beneficiary varchar(10) NOT NULL DEFAULT 'ADULT',
  priority integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  "targetMinor" bigint NOT NULL,
  "targetDate" date,
  CONSTRAINT "Goal_valid_fields" CHECK (
    length(btrim(name)) BETWEEN 1 AND 120 AND beneficiary = 'ADULT'
    AND priority BETWEEN 1 AND 1000 AND version > 0 AND "targetMinor" >= 0
  ),
  CONSTRAINT "Goal_householdId_id_key" UNIQUE ("householdId", id)
);
CREATE INDEX "Goal_householdId_status_priority_idx" ON app."Goal"("householdId", status, priority);

CREATE TABLE app."GoalAllocation" (
  id uuid PRIMARY KEY,
  "householdId" uuid NOT NULL,
  "goalId" uuid NOT NULL,
  "accountId" uuid NOT NULL,
  "valuationId" uuid NOT NULL,
  basis app."AllocationBasis" NOT NULL,
  "amountMinor" bigint,
  fraction numeric(13,12),
  CONSTRAINT "GoalAllocation_goal_fkey" FOREIGN KEY ("householdId", "goalId")
    REFERENCES app."Goal"("householdId", id) ON DELETE CASCADE,
  CONSTRAINT "GoalAllocation_account_fkey" FOREIGN KEY ("householdId", "accountId")
    REFERENCES app."Account"("householdId", id),
  CONSTRAINT "GoalAllocation_valuation_fkey" FOREIGN KEY ("householdId", "accountId", "valuationId")
    REFERENCES app."BalanceSnapshot"("householdId", "accountId", id),
  CONSTRAINT "GoalAllocation_basis_value" CHECK (
    (basis = 'FIXED' AND "amountMinor" >= 0 AND fraction IS NULL)
    OR (basis = 'FRACTION' AND "amountMinor" IS NULL AND fraction > 0 AND fraction <= 1)
  ),
  CONSTRAINT "GoalAllocation_goal_account_key" UNIQUE ("householdId", "goalId", "accountId")
);
CREATE INDEX "GoalAllocation_valuation_idx" ON app."GoalAllocation"("householdId", "accountId", "valuationId");

CREATE TABLE app."ContributionPlan" (
  id uuid PRIMARY KEY,
  "householdId" uuid NOT NULL,
  "goalId" uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  "firstContributionDate" date NOT NULL,
  CONSTRAINT "ContributionPlan_month_end" CHECK (
    "firstContributionDate" = (date_trunc('month', "firstContributionDate"::timestamp) + interval '1 month - 1 day')::date
    AND "firstContributionDate" <= date '9950-01-31'
  ),
  CONSTRAINT "ContributionPlan_goal_fkey" FOREIGN KEY ("householdId", "goalId")
    REFERENCES app."Goal"("householdId", id) ON DELETE CASCADE,
  CONSTRAINT "ContributionPlan_goal_key" UNIQUE ("householdId", "goalId"),
  CONSTRAINT "ContributionPlan_household_id_key" UNIQUE ("householdId", id)
);
CREATE TABLE app."ContributionStep" (
  id uuid PRIMARY KEY,
  "householdId" uuid NOT NULL,
  "planId" uuid NOT NULL,
  "fromMonth" integer NOT NULL CHECK ("fromMonth" BETWEEN 1 AND 600),
  "amountMinor" bigint NOT NULL CHECK ("amountMinor" >= 0),
  CONSTRAINT "ContributionStep_plan_fkey" FOREIGN KEY ("householdId", "planId")
    REFERENCES app."ContributionPlan"("householdId", id) ON DELETE CASCADE,
  CONSTRAINT "ContributionStep_month_key" UNIQUE ("householdId", "planId", "fromMonth")
);

-- canonicalInput is exact supplied text; input is its JSON representation.
-- SHA-256 binds the exact bytes, including key order and whitespace.
CREATE TABLE app."Scenario" (
  id uuid PRIMARY KEY,
  "householdId" uuid NOT NULL,
  "goalId" uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  "canonicalInput" text NOT NULL,
  input jsonb NOT NULL,
  "inputHash" char(64) NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Scenario_goal_fkey" FOREIGN KEY ("householdId", "goalId")
    REFERENCES app."Goal"("householdId", id) ON DELETE CASCADE,
  CONSTRAINT "Scenario_input_evidence" CHECK (
    input = "canonicalInput"::jsonb
    AND "inputHash" = encode(sha256(convert_to("canonicalInput", 'UTF8')), 'hex')
    AND input->>'mode' = 'ADVANCED'
    AND input->>'scenarioId' = id::text
  ),
  CONSTRAINT "Scenario_household_goal_id_key" UNIQUE ("householdId", "goalId", id)
);
CREATE INDEX "Scenario_goal_created_idx" ON app."Scenario"("householdId", "goalId", "createdAt");

CREATE TABLE app."ProjectionRun" (
  id uuid PRIMARY KEY,
  "householdId" uuid NOT NULL,
  "goalId" uuid NOT NULL,
  "scenarioId" uuid,
  mode app."ProjectionMode" NOT NULL,
  "canonicalInput" text NOT NULL,
  input jsonb NOT NULL,
  "inputHash" char(64) NOT NULL,
  result jsonb NOT NULL,
  "engineVersion" varchar(32) NOT NULL,
  "roundingConvention" varchar(24) NOT NULL DEFAULT 'HALF_UP_MINOR_UNIT',
  "datasetVersion" integer NOT NULL,
  "grantVersion" integer NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectionRun_goal_fkey" FOREIGN KEY ("householdId", "goalId")
    REFERENCES app."Goal"("householdId", id) ON DELETE CASCADE,
  CONSTRAINT "ProjectionRun_scenario_fkey" FOREIGN KEY ("householdId", "goalId", "scenarioId")
    REFERENCES app."Scenario"("householdId", "goalId", id),
  CONSTRAINT "ProjectionRun_evidence" CHECK (
    input = "canonicalInput"::jsonb
    AND "inputHash" = encode(sha256(convert_to("canonicalInput", 'UTF8')), 'hex')
    AND ((mode = 'BASIC' AND "scenarioId" IS NULL AND input->>'mode' = 'BASIC')
      OR (mode = 'ADVANCED' AND "scenarioId" IS NOT NULL
        AND input->>'mode' = 'ADVANCED' AND input->>'scenarioId' = "scenarioId"::text))
    AND "engineVersion" ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    AND "roundingConvention" = 'HALF_UP_MINOR_UNIT'
    AND "datasetVersion" > 0 AND "grantVersion" >= 0
  ),
  CONSTRAINT "ProjectionRun_household_id_key" UNIQUE ("householdId", id)
);
CREATE INDEX "ProjectionRun_goal_created_idx" ON app."ProjectionRun"("householdId", "goalId", "createdAt");

CREATE TABLE app."ProjectionSource" (
  id uuid PRIMARY KEY,
  "householdId" uuid NOT NULL,
  "runId" uuid NOT NULL,
  "accountId" uuid NOT NULL,
  "valuationId" uuid NOT NULL,
  CONSTRAINT "ProjectionSource_run_fkey" FOREIGN KEY ("householdId", "runId")
    REFERENCES app."ProjectionRun"("householdId", id) ON DELETE CASCADE,
  CONSTRAINT "ProjectionSource_account_fkey" FOREIGN KEY ("householdId", "accountId")
    REFERENCES app."Account"("householdId", id),
  CONSTRAINT "ProjectionSource_valuation_fkey" FOREIGN KEY ("householdId", "accountId", "valuationId")
    REFERENCES app."BalanceSnapshot"("householdId", "accountId", id),
  CONSTRAINT "ProjectionSource_run_account_key" UNIQUE ("householdId", "runId", "accountId")
);
CREATE INDEX "ProjectionSource_valuation_idx" ON app."ProjectionSource"("householdId", "accountId", "valuationId");

CREATE FUNCTION app.guard_projection_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Projection evidence is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'ProjectionRun' AND NEW.mode = 'ADVANCED' AND NOT EXISTS (
    SELECT 1 FROM app."Scenario" s WHERE s."householdId" = NEW."householdId"
      AND s."goalId" = NEW."goalId" AND s.id = NEW."scenarioId" AND s.input = NEW.input
  ) THEN
    RAISE EXCEPTION 'Advanced run must use its saved scenario input' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Scenario_immutable" BEFORE UPDATE ON app."Scenario"
  FOR EACH ROW EXECUTE FUNCTION app.guard_projection_evidence();
CREATE TRIGGER "ProjectionRun_evidence_guard" BEFORE INSERT OR UPDATE ON app."ProjectionRun"
  FOR EACH ROW EXECUTE FUNCTION app.guard_projection_evidence();
REVOKE ALL ON FUNCTION app.guard_projection_evidence() FROM PUBLIC, joint_app_runtime;

-- No product path may access this storage until owner/grant and privacy services exist.
REVOKE ALL ON app."Goal", app."GoalAllocation", app."ContributionPlan", app."ContributionStep",
  app."Scenario", app."ProjectionRun", app."ProjectionSource" FROM PUBLIC, joint_app_runtime;
ALTER TABLE app."Goal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."Goal" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."GoalAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."GoalAllocation" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."ContributionPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ContributionPlan" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."ContributionStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ContributionStep" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."Scenario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."Scenario" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."ProjectionRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ProjectionRun" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."ProjectionSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ProjectionSource" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."Goal" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."GoalAllocation" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."ContributionPlan" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."ContributionStep" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."Scenario" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."ProjectionRun" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."ProjectionSource" TO CURRENT_USER USING (true) WITH CHECK (true);
DO $$ DECLARE blocked_role text; BEGIN
  FOREACH blocked_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = blocked_role) THEN
      EXECUTE format('REVOKE ALL ON app."Goal",app."GoalAllocation",app."ContributionPlan",app."ContributionStep",app."Scenario",app."ProjectionRun",app."ProjectionSource" FROM %I', blocked_role);
    END IF;
  END LOOP;
END $$;
COMMIT;
