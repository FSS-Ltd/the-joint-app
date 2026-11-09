# Design Plan: IOS9 — Projection persistence and permission-safe API

## 1. Problem Statement

IOS8 established the deterministic calculation engine and mathematical models for financial projections in \`@joint/projections\`.
IOS9 connects this engine to the database, implementing permission-safe, immutable persistence for projection runs and what-if scenarios, gated by entitlement capabilities (\`projections.basic\` free and \`projections.advanced\` paid PLUS), protected by tenancy boundaries, and cached via idempotency replay.

## 2. Architecture & Design Decisions

### 2.1 Database & Security Foundation

- **Table Security:** \`Scenario\`, \`ProjectionRun\`, and \`ProjectionSource\` have row-level security enabled and forced, with direct table access revoked from \`joint_app_runtime\`.
- **Scoped SQL Stored Procedures:**
  - \`app.write_scenario(goal_id, scenario_id, canonical_input, input, input_hash)\`: validates active household membership, checks goal ownership, computes next version, and inserts scenario.
  - \`app.read_scenario(scenario_id)\`: enforces household tenancy and returns \`ScenarioDto\`.
  - \`app.list_scenarios(goal_id)\`: lists all scenarios for a goal within caller's household.
  - \`app.write_projection_run(goal_id, run_id, scenario_id, mode, canonical_input, input, input_hash, result, engine_version, dataset_version, grant_version, source_valuations)\`: validates goal, tenancy, grant version, inserts run and atomic source links in \`ProjectionSource\`.
  - \`app.read_projection_run(run_id)\`: reads run and associated sources, checking current caller access.
  - \`app.list_projection_runs(goal_id)\`: lists runs for a goal.
  - Granted execute access to \`joint_app_runtime\`.

### 2.2 Entitlement & Downgrade Boundaries

- **Free Tier (\`projections.basic\`):**
  - Allows creating and persisting \`BASIC\` projection runs (mode \`BASIC\`, \`FIXED_NOMINAL\`, zero growth/inflation/fees/tax).
  - Advanced scenario creation or advanced runs rejected with \`403 Forbidden\` (\`ENTITLEMENT_REQUIRED\`).
- **Plus Tier (\`projections.advanced\`):**
  - Allows creating immutable \`Scenario\` entities and running \`ADVANCED\` projections.
- **Downgrade Preservation:**
  - Existing saved scenarios and projection runs remain readable after subscription expiration or downgrade.

### 2.3 Replay & Idempotency

- Uses \`RequestReplay\` backed by \`IdentityVault\`.
- Repeated requests with matching \`Idempotency-Key\` and input digest return identical saved responses without recalculation.
- Key reuse with conflicting input digest returns \`409 Conflict\`.

### 2.4 Staleness & Source Re-evaluation

- When reading a projection run via \`GET H/projections/:projectionId\`, the service re-inspects source valuations. If a newer valuation has been committed or an account has been unlinked/revoked, calculation warnings reflect the discrepancy (\`STALE_VALUATION\`, \`PARTIAL_SOURCE\`).

## 3. Contracts & Schemas

- Add request schemas in \`packages/contracts/src/projections.ts\`:
  - \`createBasicProjectionRunRequestSchema\`
  - \`createScenarioRequestSchema\`
  - \`createAdvancedProjectionRunRequestSchema\`
- Export new DTO types.

## 4. API Endpoints

- \`POST /v1/households/:householdId/projections/basic\`: Free baseline run
- \`POST /v1/households/:householdId/scenarios\`: Advanced scenario creation
- \`GET /v1/households/:householdId/scenarios/:scenarioId\`: Scenario read
- \`GET /v1/households/:householdId/goals/:goalId/scenarios\`: Goal scenarios list
- \`POST /v1/households/:householdId/projections\`: Advanced run from scenario
- \`GET /v1/households/:householdId/projections/:projectionId\`: Projection run read
- \`GET /v1/households/:householdId/goals/:goalId/projections\`: Goal projection runs list

## 5. Verification Plan

- Unit tests for service logic, replay, entitlement checking, and staleness detection.
- Integration tests in \`tests/projection-api.integration.ts\` validating:
  - Cross-tenant read/write isolation
  - Stale grantVersion rejection
  - Free basic vs advanced entitlement gating
  - Replay deduplication and conflict detection
  - Retention after downgrade
