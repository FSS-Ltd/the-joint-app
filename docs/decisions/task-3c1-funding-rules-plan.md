# Task 3C.1 — Pure funding rules implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` inline, retaining the current project's execution method. These are implementation slices of one standalone build step. Task C remains incomplete until its later authorized writers and lifecycle are delivered.

**Goal:** Establish exact, testable allocation and shared contribution-budget arithmetic without activating persistence.

**Architecture:** Pure TypeScript functions consume explicitly authorized, dated manual funding evidence and canonical intentions. They neither fetch accounts nor infer control from a viewing grant. A later scoped transaction must select all active claims, lock accounts and persist atomically; this step cannot authorize or commit money.

**Tech Stack:** Existing strict TypeScript, bigint, Zod contracts and Vitest. No new dependency.

**Spec:** Phase 3 Task C in `docs/joint-app/phases/03-wealth-and-goal-projections.md`; section 6 of `docs/joint-app/03-data-model-and-financial-rules.md`; `docs/decisions/release-scope.md`; preceding Task 3A/3B contracts and conventions.

## Global constraints

- Preserve integer minor units and HALF_UP rounding. No floating-point money or rates, database, clock, network, FX, model calls or transaction insertion.
- Keep Goal, GoalAllocation, ContributionPlan, ContributionStep, Scenario and ProjectionRun runtime writes denied. No goal route, UI, grant model or deployment in this step.
- Manual GBP, household adults only. Source ownership and settled eligibility are explicit inputs; read-only access, legal title and net worth never imply allocatable funds.
- Exclude locked/restricted assets, property, pensions, liabilities, child earmarks, credit limits and unsettled value. Bill reserves reduce available value, clamped at zero.
- Original valuations and allocation intentions remain unchanged. A fall can cause underfunding; it cannot silently reduce intentions or create cash.
- Shared future budgets use supplied priorities; ties resolve by canonical goal UUID. Requested contributions stay unchanged when a plan is unfunded.
- Current constraints remain local-only until the entire MVP is complete and the founder explicitly approves deployment.
- Predecessor PR 15 merged at `db8029f88446dec953f64f4979f68eb397fa1c8e`, required CI 39924874648 passed on head `8683170a964340b6e9f8bbb91d817414bf3ec0d8` and test merge `cd547ab8b1e15ae5bfe3ed5addcc42e7045a04fa`. This step gets its own PR and current CI/merge gate.

## Scope and implementation decisions

Task C combines independent arithmetic, authorization/lifecycle and atomic writers. Deliver pure rules first so permission-sensitive storage can be reviewed separately against stable results. This is a builder's decomposition of the approved phase scope, not a claim that future writers or permissions are approved or implemented.

A funding account supplies source `money`, nullable `adultMoney`, nullable owner-attested `settledAdultMoney`, nullable `billReserves`, source completeness/date, latest valuation ID, account kind/liquidity and `authority: OWNER | VIEW_ONLY`. Settled adult value is at most the nonnegative adult portion. It is an explicit additional fact; never fill it from adult net worth or an investment total. Reserves may exceed settled value, yielding known zero availability. CURRENT, SAVINGS, INVESTMENT and OTHER_ASSET can be eligible when AVAILABLE and supported by explicit settled evidence. Property/pension/liability kinds cannot become goal funds through liquidity metadata. No new field is added to source storage now; the later writer must persist and validate this evidence before use.

Fractions apply to the named valuation's settled adult eligible base, before separately held bill reserves, with canonical precision up to 12 decimals. Existing intentions retain their named historical base. New non-null replacements require the latest current valuation; historical bases never fall back to a current value. HALF_UP applies once when resolving each fraction to minor units; fixed money is exact. Capacity uses the latest settled value minus current reserves.

A known source with overcommitted existing intentions reports the exact shortfall. Replacing one's claim is evaluated after removing that goal's existing claim. An increase beyond capacity is denied; a reduction/release remains permitted even if other intentions still leave the account underfunded. Unknown/stale/incomplete/ineligible evidence cannot support a new claim. An owner can fully release an intention without fresh money evidence. VIEW_ONLY receives no financial totals and cannot release or commit a claim. These are pure policy checks, never substitutes for server-side authority.

Contribution inputs are already aligned relative monthly vectors. Calendar alignment and persistence belong to the later contribution writer. The supplied capacity vector defines 1–600 months; every goal request vector has the same length. For each month, lower numerical priority is served first, then canonical UUID. Planned funding is `min(requested, remaining capacity)`; shortfalls stay explicit and the original request is preserved. No inference from observed income or unconfirmed history.

## Review focus

1. A viewing grant or unknown ownership/settlement must never turn a visible balance into available funding.
2. Historical fraction claims must retain their original named base after price/valuation changes.
3. Replacing an allocation must not count its prior claim twice or block safe releases during a shortfall.
4. Competing goals must share the same finite future capacity; reordering inputs must not alter funding.
5. HALF_UP boundaries, int64 extremes and malformed rates must not round through floating point or expose input values in errors.

## Task 1: Allocation assessment

**Files:** create `packages/domain/src/goals/funding-types.ts`, `allocations.ts`, `funding-source.ts`, `tests/goal-allocations.test.ts`; add the explicit `@joint/domain/goals` export through `packages/domain/src/goals/index.ts` and package.json. Export the existing `bookedDateSchema` from the contracts root so pure consumers reuse its canonical year/date boundary; do not duplicate validation. Keep goals index as exports only.

**Interfaces:**

- `FundingAccount`: `{id, kind, liquidity, money, adultMoney, settledAdultMoney, billReserves, latestValuationId, asOfDate, complete, authority}` using readonly fields, existing account kind/liquidity types and source money strings/currencies.
- `AllocationIntent`: `{goalId}` plus existing `goalAllocationSchema` fields; it must reference the assessed account. Existing input represents every active claim on that account, one per canonical goal ID.
- `ValuationBasis`: `{accountId, valuationId, settledAdultMoney}`; historical named bases are immutable inputs, not inferred balances.
- `AllocationAssessmentInput`: `{account, asOfDate, replacementGoalId, existing, proposed: AllocationIntent | null, valuationBases}`.
- `assessAllocationChange(input: AllocationAssessmentInput): AllocationAssessment`.
- `AllocationAssessment`: `{allowed: boolean, status: FUNDED | UNDERFUNDED | UNAVAILABLE, reason: null | FUNDING_UNAVAILABLE | ALLOCATION_EXCEEDS_AVAILABLE, available: AggregateMoney | null, committed: AggregateMoney | null, proposed: AggregateMoney | null, shortfall: AggregateMoney | null}`. `committed` is the prior total; `proposed` is the total after replacement. UNAVAILABLE withholds all four amounts. An unauthorized source never receives a monetary-limit error.

- [ ] Write failing `tests/goal-allocations.test.ts`: £500 capacity permits one £300 claim, denies a second £300, and leaves inputs unchanged. Replacing an existing £300 claim with £400 checks £400 rather than £700. Existing £300+£300 against fallen £500 reports £100 shortfall; reducing one claim to £250 is allowed with £50 still short; increasing it is denied. Full release works when source is unknown/stale, but VIEW_ONLY cannot release.
- [ ] Assert mixed original £10,000/adult £7,000/settled £6,000/reserve £1,000 gives £5,000 capacity. Unknown adult/settled/reserve values, stale day 31, future date, incomplete source, non-GBP, restricted liquidity, property/pension/liability and attempted over-attestation cannot support a new claim. Day 30 is valid. Reserves above settled money give zero, not negative capacity. Child-earmarked adult zero and overdrafts do not create funds.
- [ ] Assert named historical £100 base at fraction 0.25 remains £25 after latest source falls to £50; a new claim against the old valuation is refused. A missing historical base or a new claim naming an old valuation returns UNAVAILABLE. Mismatched account references, duplicate canonical goal/valuation IDs and malformed intentions throw only `Invalid funding input`; never include supplied values. Invalid or unsupported source money/date returns UNAVAILABLE. Never substitute a different valuation base. Test 0.5 of one minor unit resolves to one, 0.25 resolves to zero, exact 12-decimal precision and int64-boundary multiplication.
- [ ] Run `pnpm exec vitest run tests/goal-allocations.test.ts`; observe the missing behavior fail. Implement focused source assessment, immutable intention resolution and replacement comparison. Money/rate boundary errors must not include supplied values. Re-run to PASS.
- [ ] Commit this tested slice before task completion; future writer design must use the complete existing-claim input and account locks, not truncate or trust client authority.

## Task 2: Shared future contribution budget

**Files:** create `packages/domain/src/goals/contribution-budget.ts`, `tests/goal-contribution-budget.test.ts`; export through existing goals index from Task 1. Reuse existing money and priority bounds.

**Interfaces:**

- `ContributionBudgetInput`: `{capacity: readonly Money[], goals: readonly {goalId: string, priority: number, requested: readonly Money[]}[]}`.
- `assessContributionBudget(input: ContributionBudgetInput): ContributionBudgetAssessment`.
- `ContributionBudgetAssessment`: `{unfunded: boolean, months: {month: number, capacity: Money, requested: AggregateMoney, planned: Money, shortfall: AggregateMoney, goals: {goalId, requested: Money, planned: Money, shortfall: Money, status: FUNDED | UNFUNDED}[]}[]}`. Months are 1-based; goal rows follow priority/UUID order.

- [ ] Write failing tests: two £300 monthly plans share £500, giving the first £300 and the second £200 with a £100 explicit shortfall. Swap priorities and verify which receives the shortfall. Stable equal-priority UUID ordering survives input reorder. No goal/request/capacity input is mutated.
- [ ] Assert zero capacity, zero requests, no goals, changing monthly amounts, exact beyond-safe-integer amounts and 600 months. Sum of planned money never exceeds monthly capacity, and planned plus shortfall equals each original request and aggregate. Reject negative/non-GBP money, mismatched horizons, zero or 601-month capacity, invalid priorities and duplicate canonical goal IDs with safe generic errors.
- [ ] Run `pnpm exec vitest run tests/goal-contribution-budget.test.ts`; observe RED. Implement deterministic exact monthly allocation, preserving requested plans and shortfalls. Re-run to PASS and commit this tested slice.

## Final verification and delivery

- [ ] Self-review every changed file and the complete diff. Run frozen install on a clean committed-source checkout, format:check, lint, typecheck, test, build and existing integration/browser regression suites. No database or dependency migration is expected.
- [ ] An unchanged local spending capacity timeout was observed in Task 3B while complete isolated CI passed. Report any current failure honestly; keep fixtures, deadlines and required CI unchanged.
- [ ] Dispatch one fresh whole-branch senior reviewer on the most capable available model, using this Review Focus and the ledger's rulings. Resolve material findings through RED-to-GREEN evidence.
- [ ] Update docs/progress.md, push and open this step's PR after local checks. If complete verification is blocked, use a draft and report the exact blocker. Required current-revision complete CI and actual host merge are mandatory before the next writer/lifecycle step. No deployment.

## Recovery and deferred activation

These helpers persist nothing. Recover by restoring the prior domain package while retaining original records. Database activation, goal ownership/sharing policy, archival/export/deletion behavior, account locking, derived-view permission checks, storage of settled/reserve evidence and alignment of dated contribution plans remain explicit prerequisites for later writers. No consumer may publish a financial result from invisible sources or treat an UNAVAILABLE assessment as zero. This step's output does not establish a real allocation or contribution.
