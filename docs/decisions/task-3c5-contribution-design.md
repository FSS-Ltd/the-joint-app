# Task 3C.5 — Shared future contribution plans

## Purpose and authority

Complete the future-contributions portion of Phase 3 Task C, using the existing
shared-goal policy and exact priority-based budget arithmetic. Persist a manually
confirmed GBP capacity schedule and goal requests. Preserve requests when their
sum exceeds capacity and report explicit planned amounts and shortfalls. A plan
never creates an observed transaction, changes an account valuation, commits
source assets, transfers money or grants access to an account.

The user authorized continuation through the agreed project steps. This design
settles implementation details of the existing Phase 3 requirement. Shared goal
metadata remains shared; source funding remains permission controlled. No source
account is attached to this manual future budget. Income-derived suggestions,
projection calculation, scenarios, screens, direct providers and non-GBP funding
remain later units. No new dependency, service, tunnel, paid resource or deployment.

## Approach and privacy scope

Use one private, versioned contribution budget per household, with explicit
participant records and immutable change history. At first capacity creation,
capture current active adult memberships, following GoalParticipant. Both captured
adults can edit capacity and requests for goals they can access. A new member
does not inherit old budget data. Explicit resharing is outside this step, as it
is for existing goals. Before attaching a goal, every currently active budget
participant must already participate in that goal. No hidden goal can silently
consume capacity or expose its amount through a remainder.

Alternatives considered: independent per-goal budgets would count the same
capacity repeatedly; an automatically inferred household surplus would fabricate
confirmation and risk private-account disclosure. A versioned explicit shared
budget follows the agreed finite-capacity requirement without either problem.
The builder chooses the existing small-module implementation style and indexes;
the authority, bounds and lifecycle below are binding.

Leaving freezes a participant's budget revision before any later changes.
Archived reads use that immutable ceiling and require a currently valid archive
session. A new household/member cannot read the earlier budget. There is no public
participant-widening or budget-reset endpoint. A budget created before a second
adult joins remains private to its captured participant; this preserves the
existing goal-sharing policy rather than silently resharing financial plans.

## Schedule and assessment

Capacity has a first Europe/London calendar month-end, a horizon of 1–600 months,
and 1–600 increasing change points beginning at month 1. Each amount is canonical,
nonnegative GBP int64 minor units. Every change point is within the capacity
horizon. The first date plus the horizon must remain within year 9999. Zero
capacity is explicit evidence, distinct from an absent budget.

Goal schedules reuse ContributionPlanDto: first month-end and increasing change
points beginning at month 1, bounded to 600 months. Change points repeat until
the next change; the final amount continues within the assessment window.
Calendar alignment uses absolute year/month indexes, including leap February.
Months before a goal starts request zero. A goal schedule beginning before the
budget window uses its applicable change point, not a reset to its first amount.
All arithmetic is bigint and the aggregate request may exceed int64.

Only the explicit capacity window is assessed. Requests outside it are retained
and explicitly not assessed, never labelled funded or silently dropped. Reports
state the first/last assessed dates and each goal's coverage limitation. Requests
and capacity are never extrapolated into an unconfirmed capacity window.

Use the existing assessContributionBudget with aligned monthly vectors. Lower
saved Goal.priority wins, then canonical goal UUID. A £500 capacity and two £300
requests yield £300/£200 planned with a £100 shortfall. Capacity reductions and
over-budget requests are saved as intentions; they do not borrow or erase the
shortfall. Goal archival removes its request from current assessment and preserves
history. A goal priority/status edit changes the shared assessment revision in
the same transaction, so cached versions cannot remain current after reordering.

## Storage, concurrency and history

Add default-denied ContributionBudget, ContributionBudgetParticipant and
ContributionBudgetRevision tables. The budget head records a positive version
and exact timestamp. Revisions are append-only, one capacity or one goal-plan
snapshot per change, rather than repeated snapshots of the entire household.
Goal-plan events include the plan plus goal version, priority and status as of
the event. A metadata change records the affected plan's new ordering/status.
Revision pages contain at most fifty entries. Current assessment contains at
most fifty active goal plans; an additional active plan fails safely. Archived
plans remain exportable without consuming that current-plan limit.

Reuse dormant ContributionPlan/ContributionStep for current verified plan heads.
Add nullable budget/revision provenance. Existing rows stay unverified: no
participant, capacity, transaction or history backfill. Unknown legacy plans
block budget activation/admission rather than silently becoming verified or
being ignored. Current tables and helpers remain denied to the runtime role;
only narrow authenticated functions receive EXECUTE.

Lock actor then household, then the affected goal where required. Recheck live
session, membership, budget participation and goal authority after waits. All
capacity/plan/priority writes serialize through the same household lock. Capacity
writes compare the budget version (zero means first creation). Plan writes compare
budget, goal and plan versions (zero plan version means first creation). A stale
or mixed-tenant request changes nothing. No source-account lock or permission
change is required because this step allocates no observed assets.

Current views reconstruct the applicable capacity and latest per-goal events at
the authorized ceiling. They include only active goals for the assessment;
goal-specific history preserves archived plans. Keep exact immutable timestamps.
Identical writes with current versions make no revision. Encrypted idempotent
replay requires complete current authority before reading the stored response;
the same key/body returns exactly its original response with no new audit or hint.

## Deletion and recovery

Membership exit captures a revision ceiling, including existing privacy and
signed-journal replay transitions. Actual deletion removes that user's budget
participation. No remaining participant means purge the budget and its verified
plan heads/history. Surviving active participants justify shared history. With
only frozen participants, remove changes above their maximum cutoff and restore
the surviving head version/timestamp exactly. Current plan caches can be removed
for such read-only budgets: archive views reconstruct retained immutable history.
Goal deletion cascades its plan/events; one person's budget right alone cannot
retain a goal for which no participant has rights. No session flag or runtime
table grant can bypass immutable-history guards.

Verify actual deletion jobs and isolated signed-journal restore, not only direct
maintenance updates. Preserve other participants' independently justified data.
Use additive migrations and rehearse populated legacy upgrades. On regression,
disable contribution routes while retaining history; correct through reviewed
forward migrations. Do not drop financial history or reset personal storage.

## API and events

Thin NestJS routes use strict Zod contracts and existing scoped/archive database,
safe error, IdentityVault, RequestReplay and encrypted cursor conventions:

- GET/PUT `/v1/households/:householdId/contribution-budget`.
- GET `/v1/households/:householdId/contribution-budget/history` and `/export`.
- GET/PUT `/v1/households/:householdId/goals/:goalId/contribution-plan`.
- GET goal plan `/history` and `/export` under that goal path.
- Read-only equivalents under `/v1/me/archive/contribution-budgets/:budgetId`
  and its goal subpaths. An archive list returns at most fifty budget IDs and
  sealed continuation, authorized through captured participation.

PUT requires Idempotency-Key and quoted budget If-Match; plan input also includes
expectedGoalVersion and expectedPlanVersion. Request bodies contain editable
fields only, not trusted household IDs, participant lists or assessment results.
Successful writes return a versioned current view; histories use separate GETs.
Strict date/money/version validation exists in both API and SQL. Public errors
contain no exception, host or connection details. Reads are no-store.

Exports are free paginated JSON with fresh MFA checked before and after reading.
Cursors bind actor, session, active membership/grant epoch or archive mode,
budget, optional goal and operation. Every page reauthorizes. Active pages are
current authorized views, not a frozen multi-request export snapshot.

Commit empty PostgreSQL status hints after durable revision changes. Reads,
rollbacks, unchanged intentions and exact replay produce no new change event.
No polling, timer-based database discovery or new event service. Client
subscription registration/reconnect UI remains Task E and must reconcile through
these authenticated reads before displaying data.

## Acceptance and delivery

Prove strict inputs, cross-tenant/default-denied storage, two-adult shared edits,
canonical priority ties, calendar alignment, 600 months, exact large aggregates,
capacity drops/zero/absence, stale concurrent writes, unchanged/replay behavior,
goal archive/priority changes, late membership/session changes, new-member denial,
frozen archive cutoffs, actual deletion/restore, free fresh-MFA exports and cursor
revocation. Compare assessment against the existing pure budget helper. Verify
unchanged account balances, valuations, transactions and net worth.

Run frozen installation, formatting, lint, builds, package/test types and full
unit/integration/browser suites in an owned secret-free copy. Review every
changed file, scan public paths/secrets and obtain one final whole-branch review.
Deliver one 3C.5 branch/PR from verified PR33 merge d7ee55a; wait for successful
current-head and actual test-merge CI, verify authorized host merge and refresh
main before the engine or screens begin. Phase 3 and MVP remain incomplete.
