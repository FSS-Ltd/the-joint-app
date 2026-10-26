# Atomic Goal Allocations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Activate exact, owner-controlled atomic goal allocation replacement with frozen history and free exports.

**Architecture:** Default-denied PostgreSQL state/revision tables and narrow scoped functions own authorization, locking and capacity admission. Thin NestJS services/controllers use strict contracts, existing encrypted replay/cursors and the established pure funding rules.

**Tech Stack:** Existing strict TypeScript, NestJS, Zod, PostgreSQL/Prisma, Vitest and Playwright. No new dependency.

**Spec:** [Allocation design](../../decisions/task-3c4-allocation-design.md), Phase 3 Task C, existing 3C.1 arithmetic and 3C.3 evidence.

## Global Constraints

- GBP integer minor units, exact HALF_UP fractions, explicit current settlement/reserve evidence and 30-day manual freshness.
- Only source control plus goal participation authorizes writes. Read grants confer no control.
- Explicit selected scope of one to fifty accounts, goal If-Match and exact private source-version vector; all or none.
- No source balance, valuation, metadata version, transaction or net-worth mutation from an allocation.
- Preserve frozen ownership/goal cutoffs, existing privacy journal and default denial of unverified dormant rows.
- No contributions, projections, UI scaffolding, dependency, paid service, tunnel or deployment in this step.
- Predecessors 3C.3 PR18 and UI8 PR32 are host-verified merged. Current base6e12e906ef68ff7e936264603f6d365b17627a56. Own PR/current CI/test-merge/actual merge required before further work.

## Review Focus

- Mixed owned/hidden source selections fail before financial amounts or partial writes can leak.
- Co-owner and competing-goal requests share canonical source locks and cannot reserve the same money twice.
- Historic fractions survive valuation/reserve changes without rebasing or fabricating current evidence.
- Exit, archive, deletion and restored-journal replay retain only independently justified frozen history.
- Replay, cursor, commit notification and idle behavior preserve authority across revocation and reconnect.

## Whole-branch delivery gate

- [ ] Obtain one fresh whole-branch review. Resolve material findings with RED/GREEN and current green suites; record all rulings and deferred minors without a second review loop.
- [ ] Push/open own PR and attach it. Verify final-head/actual-test-merge CI, required reviews/protections and authorized host merge; record exact evidence and refresh main before contributions or other later work.

### Task 1: Contracts and private storage

**Files:** `packages/contracts/src/goal-allocations.ts`, contracts index and dormant allocation DTO in `goals.ts`; Prisma schema and new additive migrations under `20261026*_goal_allocations/`; `tests/goal-allocation-contracts.test.ts`, `tests/goal-allocation-storage.integration.ts`, existing contract/storage fixtures.

**Interfaces:** Export strict allocation write/view/page contracts and inferred types. A write contains selected account IDs, exact source-version entries and at most one existing FIXED/FRACTION intention per selected account. View contains goal metadata version, canonical controlled scope, exact source versions, original intentions, current funding assessment and evaluation date. Pages contain at most fifty immutable revisions and opaque continuation. New storage comprises AccountAllocationState, AccountAllocationRevision, nullable verified sourceVersion on GoalAllocation, and AccountOwner allocation cutoff.

- [x] Write failing contract cases for strict payloads, canonical duplicate IDs, missing/extra source-version entries, out-of-scope intentions, exact bounds/fractions and inconsistent views.
- [x] Run focused contract tests; observe missing exports/behavior before implementing contracts and updating never-exposed legacy DTO fixtures.
- [x] Add storage tests proving direct runtime denial, tenant-matched keys, immutable history, preserved legacy/null provenance and populated upgrade safety.
- [x] Add minimal additive schema/constraints/indexes and build contracts/database. Run the focused tests against an owned fresh database; commit verified contracts/storage.

### Task 2: Atomic allocation and privacy lifecycle

**Files:** focused forward migrations for allocation scope, read/write/history, archive/release and privacy retention; `tests/goal-allocations.integration.ts`, notification and actual purge/restore proof fixtures; focused domain helpers/tests only where current assessment needs shared arithmetic.

**Interfaces:** SQL `app.write_goal_allocations(goal_id uuid, expected_goal_version integer, input jsonb) RETURNS jsonb`; `app.read_goal_allocations(goal_id uuid, account_ids uuid[], after_cursor jsonb) RETURNS jsonb`. Private helpers authorize/lock, resolve immutable fraction bases, assess all source claims, append state/revisions and release on authorized lifecycle transitions. Internal pages return validated raw continuation; public cursors are sealed later.

- [x] Reproduce missing functions with real restricted-role tests: £500/two £300 concurrency, partial-batch rollback, co-owner lock race, stale source/goal versions, fractional HALF_UP, reserve excess, underfunded reductions, stale/unavailable release, hidden/cross-tenant denial and expired-session rejection after locks.
- [x] Implement deterministic locks, complete source admission and immutable append/replacement. Preserve source evidence; reject unknown legacy admission. Recheck after blocking locks.
- [x] Prove goal archive/last-owner exit releases live claims without rewriting frozen history. Prove later co-owner updates remain invisible after exit.
- [x] Extend actual purge and restored-journal fixtures/proofs. Observe the new retention assertions fail before implementing scoped pruning/counter repair; preserve joint justified history and exact timestamps.
- [x] Prove empty committed hints, no rollback/replay hint and read-only reconciliation. Run affected plus full integration, inspect grants/search_path/indexes/query bounds and commit the verified lifecycle.

### Task 3: Owner API and exports

**Files:** focused allocation services/controllers/cursors/errors under `apps/api/src/modules/goals/allocations/`, identity composition, API docs, endpoint tests and `docs/progress.md`.

**Interfaces:** GET/PUT `/v1/households/:householdId/goals/:goalId/allocations`, bounded history and free fresh-MFA export; read-only owner archive equivalents under `/v1/me/archive/goals/:goalId/allocations`. PUT uses canonical Idempotency-Key, quoted goal If-Match and body source versions. All selectors and successful database outputs are strict; responses are no-store.

- [x] Write failing HTTP/service cases for unavailable scope, required headers, atomic conflict mapping, canonical replay, revoked ownership/session replay, archive cutoff, cursor reuse denial and free export after downgrade.
- [x] Implement thin boundary validation, scoped authorization-before-replay, encrypted exact replay/cursors and safe public errors using existing patterns. Do not enable new raw table access.
- [x] Run frozen clean-source install, format, lint, all builds/types/test types, unit/integration/browser suites, fresh/populated migrations and public-file scan. Inspect every changed file/diff and actual current routes; record limits honestly.
