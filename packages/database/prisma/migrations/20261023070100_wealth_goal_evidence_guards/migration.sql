BEGIN;

-- CHECK treats UNKNOWN as success. Force each discriminated shape to TRUE.
ALTER TABLE app."GoalAllocation" DROP CONSTRAINT "GoalAllocation_basis_value";
ALTER TABLE app."GoalAllocation" ADD CONSTRAINT "GoalAllocation_basis_value" CHECK ((
  (basis = 'FIXED' AND "amountMinor" IS NOT NULL AND "amountMinor" >= 0 AND fraction IS NULL)
  OR (basis = 'FRACTION' AND "amountMinor" IS NULL AND fraction IS NOT NULL AND fraction > 0 AND fraction <= 1)
) IS TRUE);

ALTER TABLE app."Scenario" DROP CONSTRAINT "Scenario_input_evidence";
ALTER TABLE app."Scenario" ADD CONSTRAINT "Scenario_input_evidence" CHECK ((
  jsonb_typeof(input) = 'object'
  AND input = "canonicalInput"::jsonb
  AND "inputHash" = encode(sha256(convert_to("canonicalInput", 'UTF8')), 'hex')
  AND input->>'mode' = 'ADVANCED'
  AND input->>'scenarioId' = id::text
) IS TRUE);

ALTER TABLE app."ProjectionRun" DROP CONSTRAINT "ProjectionRun_evidence";
ALTER TABLE app."ProjectionRun" ADD CONSTRAINT "ProjectionRun_evidence" CHECK ((
  jsonb_typeof(input) = 'object' AND jsonb_typeof(result) = 'object'
  AND input = "canonicalInput"::jsonb
  AND "inputHash" = encode(sha256(convert_to("canonicalInput", 'UTF8')), 'hex')
  AND ((mode = 'BASIC' AND "scenarioId" IS NULL AND input->>'mode' = 'BASIC')
    OR (mode = 'ADVANCED' AND "scenarioId" IS NOT NULL
      AND input->>'mode' = 'ADVANCED' AND input->>'scenarioId' = "scenarioId"::text))
  AND "engineVersion" ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
  AND "roundingConvention" = 'HALF_UP_MINOR_UNIT'
  AND "datasetVersion" > 0 AND "grantVersion" >= 0
) IS TRUE);

ALTER TABLE app."Goal" ADD CONSTRAINT "Goal_targetDate_year" CHECK ("targetDate" IS NULL OR "targetDate" >= date '0001-01-01');
ALTER TABLE app."ContributionPlan" ADD CONSTRAINT "ContributionPlan_year" CHECK ("firstContributionDate" >= date '0001-01-01');

CREATE TRIGGER "ProjectionSource_immutable" BEFORE UPDATE ON app."ProjectionSource"
  FOR EACH ROW EXECUTE FUNCTION app.guard_projection_evidence();

COMMIT;
