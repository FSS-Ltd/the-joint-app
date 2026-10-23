# Task 3C.2 — Shared goal lifecycle implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` inline, retaining the project's Native execution method. One fresh whole-branch review follows local verification.

**Goal:** Enable shared adult goal metadata, immutable history and free export without activating funding or projection writers.

**Architecture:** Narrow database functions enforce current session/membership, explicit participant snapshots and optimistic versions. Runtime table access remains denied. Thin API controllers validate strict contracts. Leaving freezes a participant's accessible revision; deletion removes their participation and exclusively retained goals.

**Tech Stack:** Existing NestJS, strict TypeScript, Zod, PostgreSQL/Prisma and Vitest; no dependency changes.

**Spec:** Phase 3 Task C in `docs/joint-app/phases/03-wealth-and-goal-projections.md`, product section 5 and `08-security-privacy-and-compliance.md`. Founder confirmed shared household goal details with separately permission-controlled funding.

## Global constraints

- Predecessor PR 16 is host-verified MERGED at `b8a295fd096fb61f892ed88313559b59f61b2479`; current head `812951a9db8b191cb9cee57561e558174b508706`, required CI 39928846881 SUCCESS, actual checkout `be9e0f2a9a50a791053b76b59ba7e3b5007cead3`.
- GBP, adult beneficiary only; exact nonnegative int64 minor units, canonical dates and positive versions reuse existing schemas.
- Share metadata with current active adults at creation. A future household member receives no access to an existing goal. No implicit account permission, allocation, valuation, projected total or private note is included.
- Leave is independent: freeze accessible revision in the existing membership transition, including deletion/restore replay paths. Remaining participants can continue editing; departed adults see only frozen history through authenticated archive routes.
- Goal archive preserves history and is read-only. No hard-delete or unarchive API. Existing allocation rows prevent this metadata-only archive operation; the later funding writer must implement account-lock ordering and release semantics before activation.
- Deletion removes that adult's participant links; records remain only to the extent another participant retains rights. With only frozen participants, prune above their maximum cutoff and restore the exact surviving immutable head/timestamp. Goals with no participants are purged, including history. Legacy goals receive no invented participants or backfill access.
- Free JSON export is paginated metadata/history only, read on demand without stored objects or download tokens. It requires fresh MFA and current authorization for each page; account CSV exports remain unchanged. No entitlement check.
- No deployment, hosted resource, paid change, UI or next build step before the current step's PR passes current CI and is host-verified merged.

## Review focus

1. A replacement household member must not inherit goal metadata or earlier history.
2. A leaving participant must not observe a later edit, even with a fresh archive session.
3. Invalid/cross-household IDs and stale optimistic writes must not leak data or create history.
4. A deletion or restore replay must remove exclusively retained goals while preserving another participant's records.
5. Paginated export must remain free, bounded, strictly validated and freshly authorized, with no funding-source information.

## Task 1: Contracts and database lifecycle

**Files:** create `packages/contracts/src/goal-lifecycle.ts`, `tests/goal-lifecycle.test.ts`, `tests/goal-lifecycle.integration.ts`, additive migrations `20261023081000_shared_goal_lifecycle/migration.sql` and `20261023081100_goal_input_boundary/migration.sql`; update contract exports and Prisma schema.

**Interfaces:** `goalWriteSchema` contains name/status/beneficiary/priority/target/targetDate; `goalPageDtoSchema` contains goal, immutable revision entries (goal plus timestamp) and encrypted nextCursor; `goalListDtoSchema` contains goals and encrypted nextCursor. Strict query schemas permit only an opaque cursor. Internal revision page/list schemas validate database nextAfterVersion/nextAfterId fields before the service seals them. `app.write_goal(uuid,integer,jsonb)` creates at expected version zero or edits at exact current version. `app.read_goal(uuid,integer)` returns a bounded history page and latest accessible metadata. `app.list_goals(uuid)` returns fifty goals and a continuation. The functions are usable in active scope or read-only archive scope as appropriate; runtime direct tables remain inaccessible.

- [ ] Write strict contract and real-runtime integration assertions first: two-adult edits, int64 amounts, history, stale concurrent writes, archived read-only, legacy default denial, cross-tenant denial, no raw privileges, exit cutoff, replacement-member denial and deletion retention.
- [ ] Run focused tests. Expected: FAIL because lifecycle contracts/functions do not exist.
- [ ] Implement contracts, two additive participant/revision tables, immutable capture, participant cutoffs and deletion hooks. Functions lock actor then household, recheck live scope and return only metadata. Bound list/history to fifty plus one. Validate SQL input independently; no dynamic SQL or exception payloads.
- [ ] Build contracts/database and run focused unit/integration tests. Expected: PASS; all existing dormant-storage denial assertions remain unchanged and pass.
- [ ] Commit `feat: add shared goal lifecycle and frozen participant history`.

## Task 2: API, free exports and delivery

**Files:** create focused services/controllers under `apps/api/src/modules/goals/`, endpoint tests; update identity registration, API documentation and `docs/progress.md`.

**Interfaces:** `POST /v1/households/:householdId/goals` with Idempotency-Key creates; `PUT /v1/households/:householdId/goals/:goalId` with strict goal metadata and positive quoted If-Match edits; GET collection/detail/history page and `/export` (JSON attachment with fresh MFA). Separate `/v1/me/archive/goals` list/detail/export uses recorded participant cutoff rather than caller household. Reads are no-store; archive has no writes. Safe unavailable/invalid/version errors reveal no source details.

- [ ] Write real service/HTTP assertions first: safe input rejection, active/archive dispatch, missing session, current-session revocation, fresh-MFA export requirement, free export with no entitlement and no funding fields. Expected focused run: FAIL because routes/services are missing.
- [ ] Implement thin controllers, small scoped service and safe database error mapping; register in the existing identity factory. Reuse existing identity/archive context and input helpers.
- [ ] Run focused tests, then frozen clean-checkout install, formatting, lint, all builds/types/unit/integration/browser suites and secret/private-file scan. Expected: PASS; inspect every changed file and final diff.
- [ ] Request one fresh whole-branch review. Fix material findings with observed RED→GREEN and green affected/full suites; record rulings and any deferred minors.
- [ ] Update docs with checked revisions/results, push own PR, attach it, wait for latest required CI, honour protections/reviews, merge only under existing user authority, verify actual host merge and refresh main. Task C remains incomplete until allocation/contribution writers are delivered.

## Recovery and limitations

This is an additive migration with no ownership backfill. Disable lifecycle routes to roll back application behavior while retaining immutable evidence; do not drop shared records. Participants cannot be widened in this step: explicit resharing requires a separate reviewed policy. Future funding activation must integrate account locks, source evidence, privacy fences and archive semantics. JSON pages are a new metadata-only export; they do not claim account history or stored export-job coverage. No UI or production performance claim is made.

Implementation refinement: public creation uses the existing encrypted RequestReplay convention, and public cursors are authenticated/encrypted with the existing IdentityVault and bound to user, session, active membership/grant scope, goal and operation. Internal SQL creation at expected version zero and raw database cursors are not exposed as public creation/pagination conventions. This corrects the draft interface against the canonical API rules before delivery.

Independent review correction: add forward migrations `20261023081200_goal_privacy_retention` and `20261023081300_goal_retention_repair`. A surviving frozen participant cannot justify a deleted adult's later revisions. Normal revision updates remain immutable; privacy may restore a head only to the exact immutable revision at the maximum surviving cutoff, with no live participant. Actual request/lease/purge and isolated restore replay verify removal, retention, repeat safety and unchanged timestamps. The repair also removes such unjustified data from earlier intermediate purges; unclassified legacy rows remain untouched.
