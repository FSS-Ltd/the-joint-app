# Shared Contribution Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save one confirmed shared contribution capacity and dated goal requests, reporting exact priority-based shortfalls without moving money.

**Architecture:** Narrow PostgreSQL functions serialize household changes and preserve immutable participant-scoped history. Strict contracts and a pure calendar adapter feed the existing contribution-budget arithmetic. Thin NestJS services provide authenticated reads, replay, sealed cursors and free exports.

**Tech Stack:** Existing strict TypeScript, Zod, bigint, PostgreSQL/Prisma, NestJS, Vitest and Playwright. No new dependency.

**Spec:** [Contribution design](../../decisions/task-3c5-contribution-design.md), Phase 3 Task C and the existing shared-goal policy. One fresh builder check reports nothing important left.

## Global Constraints

- GBP nonnegative int64 source money, exact aggregate sums that may exceed int64, 1–600 month-end capacity months and increasing change points starting at month 1.
- One manually confirmed household capacity, not observed income or source assets. Never change balances, valuations, transactions, account grants or net worth.
- Capture current adult participants at creation; no implicit widening. Attach a goal only when every active budget participant already has goal rights.
- Freeze exit ceilings; preserve independently justified history through actual deletion and isolated journal restore. No legacy ownership/history backfill.
- Actor then household locks; recheck after waiting. Capacity, plans and affected goal metadata share the same revision/serialization boundary.
- Bound active plans to fifty and history pages to fifty. Unknown legacy plans block activation/admission rather than become verified.
- Over-budget intentions survive with explicit shortfalls. Assessment covers only confirmed capacity dates; nonzero requests outside the window remain unassessed.
- No engine, scenario, UI scaffold, polling, dependency, paid service, tunnel, deployment or personal database activation.
- Base is host-verified PR33 merge `d7ee55a3b00f5074f4fb77d3d2f039b703a77220`; do not begin the next build unit before this unit's verified PR/CI/merge gate.

## Review Focus

- A goal created before another adult joins cannot disclose its request through a shared remainder.
- Zero capacity is known evidence; absent/unverified capacity must never become a fabricated funded result.
- Dated plans beginning before or after the capacity window retain all nonzero requests without shifting dates or silently claiming funding.
- Metadata priority/archive edits must atomically invalidate shared assessments and preserve exit cutoffs.
- Deletion/replay must retain only independently justified history, with exact surviving timestamps and no authority-restoring session flag.

## Whole-branch delivery gate

- [ ] Obtain one fresh whole-branch review after all implementation tasks. Resolve material findings in one RED/GREEN correction pass and rerun affected/full checks; record rulings and deferred minors.
- [ ] Push/open and attach the unit's PR. Verify all applicable final-head/actual-test-merge checks, reviews, conversations and protections; perform authorized normal host merge, record evidence and refresh main before the next unit.

### Task 1: Strict contribution contracts and dated assessment

**Files:** create `packages/contracts/src/contribution-schedules.ts`, `contribution-assessment.ts`, `contribution-budget.ts`, `contribution-history.ts`; export from contracts index. Create `packages/domain/src/goals/dated-contributions.ts` and export from goals index. Create `tests/contribution-contracts.test.ts`, `tests/dated-contributions.test.ts` and focused fixtures `tests/fixtures/contribution-plans.ts` and `tests/fixtures/contribution-views.ts`. Preserve existing ContributionPlanDto and pure budget tests.

**Interfaces:**

- `contributionCapacitySchema` / `ContributionCapacity`: `{firstContributionDate, horizonMonths, monthlyContributions}` using existing month-end, nonnegative Money and monthlyContributionSchema. All change points must fit the horizon.
- `contributionPlanWriteSchema`: `{expectedGoalVersion, expectedPlanVersion, firstContributionDate, monthlyContributions}`; first plan version may be zero. Reuse existing ContributionPlanDto for persisted request schedules.
- `datedContributionInputSchema` validates the pure adapter boundary without adding a Zod dependency to domain. Export the existing monthEndAtOffset helper for that consumer.
- `contributionPlanEntrySchema` / `ContributionPlanEntry`: `{goalVersion, priority, status: ACTIVE|ARCHIVED, plan: ContributionPlanDto}`.
- `contributionBudgetDtoSchema`: `{schema: contribution-budget, schemaVersion: 1, id, householdId, version, updatedAt, capacity}`. Capacity is explicitly manual in documentation, with no account selector.
- `contributionRawViewSchema` / `ContributionRawView`: `{budget, plans: active entries, selectedPlan: entry|null}`. At most fifty distinct canonical goals; tenant IDs match. An active selected plan must match its entry in plans.
- `datedContributionAssessmentSchema` / `DatedContributionAssessment`: `{unfunded, firstContributionDate, lastContributionDate, months, unassessed}`. Each month adds an exact date to the existing helper's month/capacity/requested/planned/shortfall/goals shape. `unassessed` contains distinct `{goalId,beforeWindow,afterWindow}` entries only when some nonzero schedule lies outside capacity dates.
- `contributionBudgetViewSchema` / `ContributionBudgetView`: raw view plus assessment, with matching dates, horizon, active goal IDs/order and conserved sums. `assessDatedContributions({capacity,plans}): DatedContributionAssessment` validates input and aligns the dated schedules before calling existing `assessContributionBudget`. It never queries, clocks or mutates inputs.
- `contributionRevisionSchema`: `{budgetId,householdId,version,createdAt,change}`. Change is `{kind: CAPACITY,capacity}` or `{kind: PLAN|GOAL,entry}`. `contributionRawPageSchema`: `{view: raw view,history,nextAfterVersion}`; public page: `{view: calculated view,history,nextCursor}`. Ascending unique history stays within the authorized view ceiling. Raw/public continuation requires a full fifty-entry page.
- Strict optional-cursor query and archive-list schemas return at most fifty `{id,householdId}` entries with raw UUID/public sealed continuation.

- [x] Write new tests first, covering strict unknown-field/money/version rejection, missing or duplicate change points, horizon/date bounds, malformed tenant/history/assessment shapes and exact large aggregates. Run focused Vitest; expected FAIL for missing new modules.
- [x] Add contracts in focused files without replacing existing tests or changing dormant plan shape. Reuse existing canonical primitives and explicit exports. Run contract cases; expected PASS.
- [x] Write dated adapter tests before implementation: £500/two £300; deterministic priority ties; Nov/Dec/Jan/Feb and leap dates; plans starting before/inside/after window; nonzero requests outside window; zero/absent/archived plans; exact int64 aggregate overflow; 600 months; sparse/invalid lists; input immutability. Expected FAIL for missing adapter.
- [x] Implement the pure adapter. Align absolute month indexes; carry the applicable change point, use zero before a plan begins, retain final scheduled amount, and flag nonzero segments outside capacity dates. Call the existing finite-budget helper once on aligned active vectors. Expected focused PASS.
- [x] Run all unit tests, contracts/domain builds, strict package/test types, lint and formatting. Inspect all changed files/diff; commit the verified internal slice. Native task-done reruns the full unit suite. This is not unit delivery completion.

### Task 2: Scoped persistence and privacy lifecycle

**Files:** modify Prisma schema; add focused forward migrations starting `20261026003000_contribution_storage`, then scope/read/write/lifecycle/retention migrations. Create `tests/fixtures/contribution-budget.ts`, `tests/contribution-storage.integration.ts`, `contribution-writes.integration.ts`, `contribution-lifecycle.integration.ts`, `contribution-events.integration.ts`; extend isolated restore fixtures/proofs in focused contribution modules.

**Interfaces:**

- Private ContributionBudget (household unique, version/timestamp), ContributionBudgetParticipant (membership/nullable cutoff), ContributionBudgetRevision (budget/version, optional goal, typed change JSON/timestamp). Tenant-matched FKs and forced RLS, no runtime table/helper grants.
- Nullable verified budget/revision provenance on existing ContributionPlan. Legacy null rows remain unverified; no automatic participants/capacity/history. Current ContributionStep remains the request schedule.
- `app.write_contribution_capacity(expected_budget_version integer,input jsonb) RETURNS jsonb` and `app.write_contribution_plan(goal_id uuid,expected_budget_version integer,input jsonb) RETURNS jsonb` return ContributionRawView.
- `app.read_contribution_budget(budget_id uuid,goal_id uuid,after_version integer) RETURNS jsonb` returns ContributionRawPage. Null budget ID resolves active household; archive requires an explicit ID. Optional selected goal must have independently valid participation and verified history. Goal-specific history includes capacity events and that goal's events. Full budget history includes all authorized changes.
- `app.list_archived_contribution_budgets(after_id uuid) RETURNS jsonb`: `{budgets:[{id,householdId}],nextAfterId}` through captured frozen participation only.
- Current view reconstructs latest capacity and per-goal event at the authorized ceiling. Goal metadata triggers append the affected plan with new priority/status and advance the budget once. History changes emit the existing empty committed status hint.
- Exit freezes budget ceilings; deletion removes participants, purges exclusively retained data and prunes above maximum surviving frozen cutoff. Read-only frozen budgets may discard current plan caches while retaining the immutable request evidence. Actual restore proof compares retained revisions/head timestamps and removes exclusive/later data idempotently.

- [x] Write real restricted-role tests for absent storage/functions, legacy default denial and exact populated upgrade preservation; observe missing-table/function RED before migrations.
- [x] Add storage and strict independent SQL schedule guards, private helpers and narrow public functions. Prove shared edits, first version zero, stale concurrent capacity/plan writes, all-or-none rollback, unknown legacy rejection, tenant/participant denial and source financial nonmutation. Expected PASS.
- [x] Add and observe RED lifecycle tests: metadata priority/archive changes, new-member/hidden-goal denial, delayed exit/session changes, frozen reads and no later leak. Implement transactional triggers and ceiling reads, rechecking scope after waits. Expected PASS.
- [x] Add and observe RED actual deletion/isolated signed-journal restore cases for exclusive/shared/frozen retention and exact timestamps; implement scoped cleanup with no mutation flag. Expected PASS, including repeated restore.
- [x] Prove commit-only hints and no read/rollback/unchanged hint. Run all affected and full integration tests using an owned disposable database with validated loopback Auth fixture settings only. Keep existing deadlines, concurrency and security assertions unchanged.
- [x] Run schema generation/builds, types/test types, lint, format and unit suite; inspect grants, indexes, cascade order, every changed file and populated upgrade evidence. Commit internal persistence slice. Native task-done reruns the full owned integration suite; personal storage is untouched.

### Task 3: API, replay and free exports

**Files:** focused controllers/service/cursors/query/error modules under `apps/api/src/modules/goals/contributions/`; identity composition and safe error registration only as needed. Add a narrow replay-authorization forward migration when required to authenticate initial capacity and new-plan requests without executing a write. Create contribution service/HTTP integration tests and fixtures. Add `docs/api/contribution-plans.md` and update `docs/progress.md`.

**Interfaces:** routes exactly as design. `ContributionService` uses scoped/archive database, IdentityVault and RequestReplay; pure assessment builds strict public views. PUT requires UUID Idempotency-Key and quoted budget If-Match (zero for capacity creation); plan expected versions are strict body fields. Writes replay the original view only after complete current scope authorization. Cursor binding includes actor/session/membership/grant epoch or archive mode, budget, selected goal and operation. Free exports require fresh MFA before and after reading. No-store responses, safe nondisclosing errors, no entitlement for manual intentions or exports.

- [x] Write real service/HTTP RED cases for missing routes, invalid/missing headers, safe errors, exact replay, changed-body conflict, revoked authority, free/downgraded export and MFA expiring during a wait.
- [x] Implement thin validated controllers and focused service, reusing existing scope/error/replay patterns. SQL raw results are validated before dated assessment. Canonicalize UUID route IDs and idempotency input; seal raw continuation. Expected focused PASS.
- [x] Run a fresh secret-free frozen installation, all builds, formatting/lint, package/test types and full unit/integration/browser suites; fresh/populated migration checks and public path/exact-secret scan. Inspect every changed file and final diff. Record exact source revision and all limitations, including no new contribution UI or personal stack activation.
- [ ] Commit the verified API slice and finish native task-done on the final owned full verification. Then follow the separate whole-branch delivery gate; do not mark Phase 3 complete.
