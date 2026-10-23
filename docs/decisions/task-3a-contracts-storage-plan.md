# Task 3A — Wealth and goal contracts and storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish validated, versioned wealth/goal/projection contracts and safe additive storage for Phase 3 Task A.

**Architecture:** Existing strict Zod contracts define wire boundaries; Prisma and reviewed PostgreSQL constraints preserve tenant-matched references and immutable calculation evidence. This step adds no public finance route. Newly introduced storage is denied to runtime credentials until subsequent independently verified domain/API steps supply its authorisation model.

**Tech Stack:** Existing pinned TypeScript, Zod, Prisma/PostgreSQL, Vitest. No third-party dependency addition.

**Spec:** [Phase 3 Task A](../joint-app/phases/03-wealth-and-goal-projections.md), [financial rules](../joint-app/03-data-model-and-financial-rules.md), [projection conventions](../joint-app/05-local-ai-and-projections.md), [release scope](release-scope.md).

## Global Constraints

- All execution and data stay local. No deployment until the entire MVP is complete and explicit founder approval is received.
- Integer minor units, HALF_UP rounding, strict unknown-field rejection, explicit account grants, tenant-matched references; no money movement or model arithmetic.
- Reuse existing GBP Money. Other currencies require an explicitly implemented conversion and remain unsupported; never silently convert.
- Child profiles, guardian-management features, direct bank/broker feeds and provider entities remain deferred. No invented provider valuation, FX or approval.
- Preserve immutable originals and prior readable schema. Existing account/snapshot entities cover the manual-source baseline.
- Each delivery step receives its own locally checked PR, current CI and verified merge before the next begins.

## Review Focus

- Syntactically valid but impossible dates or noncanonical money/rates must be rejected, including year zero and negative zero.
- Unknown advanced assumptions must not enter the contribution-only BASIC input contract.
- Cross-household references and mismatched account valuation references must fail in the database.
- Historical scenario/run evidence must resist updates; deletion must be possible only through maintenance until authorised lifecycle handling exists.
- Runtime credentials must not gain access merely because new tables were added; existing tenant, leave/export/delete behaviour must remain intact.

## Task 1: Validated contracts and assumption convention

**Files:** create `packages/contracts/src/wealth.ts`, `goals.ts`, `projections.ts` plus focused shared primitives if needed; modify the existing contracts barrel. Create `packages/projections` with explicit exports of contract-backed types only, as requested by Task A; do not add a fake calculator. Create `docs/decisions/003-projection-conventions.md`. Test `tests/wealth-goal-contracts.test.ts`.

**Interfaces:** Export strict schemas and inferred types named WealthSummaryDto, GoalDto, GoalAllocationSetDto, ContributionPlanDto, ScenarioDto, ProjectionRunDto, ProjectionInputV1 and ProjectionResultV1. Use `schema`/`schemaVersion` or a literal version discriminator consistently; document the exact shape in the conventions record.

- [ ] Write and run failing tests for canonical money, dates, decimal rates, currency mismatches, unknown fields, allocation discriminators, BASIC-versus-ADVANCED separation and all seven specified result states.
- [ ] Define visible scope/completeness/valuation provenance and dataset/grant versions without inaccessible-account counts. Wealth input remains authorised manual account valuations; no unimplemented feed claim.
- [ ] Define goal lifecycle, adult beneficiary, priority/version and explicit fixed-money versus fractional allocation basis with eligible account/valuation references. Fractions are canonical decimal strings in (0,1], not percentages or money.
- [ ] Define monthly contribution plans and immutable scenario/run DTOs. Inputs record opening/target, first contribution date, bounded schedule, withdrawals, fixed fees/tax assumptions, effective annual growth/fee/inflation provenance, target basis and horizon 1..600. All money must share GBP; nonnegative amounts where required; arrays bounded by horizon. Results include exact money series, status, first qualifying date, contribution/growth/cost breakdown and warnings. Access failures remain API errors, never financial calculation states.
- [ ] BASIC input accepts contribution-only assumptions and rejects advanced-only fields. Document zero growth, no inflation/cost/tax modelling, Europe/London month-end contributions, effective annual convention, HALF_UP boundaries and canonical golden dates. No engine is implemented in this step.
- [ ] Build/typecheck contracts and type exports and run the new contract tests. Update version matrix only for new internal workspace package.

## Task 2: Additive protected storage

**Files:** modify `packages/database/prisma/schema.prisma`; create migration `20261023070000_wealth_goal_foundation/migration.sql` and additive guard migrations where already-applied history must be preserved; test `tests/wealth-goal-storage.integration.ts`.

**Interfaces:** Prisma models Goal, GoalAllocation, ContributionPlan, Scenario, ProjectionRun and explicit source-dependency records where needed. Preserve existing Account/BalanceSnapshot and household/member/user identities. Records reference matching household/goal/account/snapshot scopes. Persist immutable canonical input, SHA-256 inputHash, engineVersion, roundingConvention and source snapshot/grant/dataset revisions for each run; scenarioId nullable only for BASIC.

- [ ] Write/run failing real-database tests for mismatched household and account/snapshot references, invalid fixed/fraction allocation states, duplicate source dependencies, invalid mode/scenario linkage, and changed immutable scenario/run evidence.
- [ ] Add the minimal models, indexes and SQL constraints needed by those contracts. Goal has optimistic version, archival status, target/beneficiary/priority. Contributions and allocation intentions are planned data, never ledger writes. Store exact cash as bigint and fractions/rates as decimal strings or appropriate NUMERIC, never float.
- [ ] Enable and force RLS on every new table. Revoke PUBLIC/runtime access and add maintenance policy consistent with existing migrations. No runtime API writes or broadly privileged helper is introduced before Task C's ownership/allocation authorisation.
- [ ] Validate Prisma, apply migration to local development and a fresh disposable database, run restricted-role rejection and all integration regressions. Existing privacy purge must continue working; no runtime users can yet create new goal payloads. Document the required authorised export/delete/leave/source-revocation integrations before Task C enables writes.

## Task 3: Verify and deliver only Task A

- [ ] Inspect every changed file and diff. Record Task 1.6's verified merge and current Task A state in `docs/progress.md`; mark Task 1.6 canonical checklist only with its actual evidence.
- [ ] Run frozen installation, formatting, lint, type checks, unit tests, full integration tests and all builds; run existing browser regression because shared contracts/schema changed. Validate fresh migrations and seed twice.
- [ ] Obtain independent review of the contracts, immutable storage and access boundaries; resolve findings with regression tests. Public source and secret scans must pass.
- [ ] Commit/push and create Task 3A PR only after local verification; attach it. Verify current CI/test-merge and requirements, merge under standing authority, record host merge. No Task B implementation before that gate.

## Scope and recovery

This is a storage/contract foundation, not a usable wealth screen or completed Phase 3. No finance data is backfilled, no existing table is dropped, and no new user-facing feature is claimed. Rollback the application commit while retaining additive tables; use a forward fix for schema defects. Default-denied runtime access prevents premature exposure. Task B supplies valuation; Task C adds authorised goal operations and lifecycle/privacy integration; Task D adds the pure calculator. Those later implementations may refine additive storage after their own review and tests.
