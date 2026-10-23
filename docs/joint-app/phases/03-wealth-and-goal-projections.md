# Phase 3 — Wealth and goal projections

> **Current execution order, 23 October 2026:** The CSV-first baseline follows Phase 0 → Phase 1 → Phase 3 from manual/imported evidence → Phase 4 → Phase 5. Phase 2 bank/direct-source work and child profiles are deferred; live-source prerequisites below do not block the manual MVP. Retain source activation gates, local-AI/security/device requirements and the per-step PR/CI/merge gate. See [release scope](../../decisions/release-scope.md).

> **Scope revision, 23 October 2026:** Child profiles and child-specific UI/projections are post-MVP, per the [canonical product revision](../01-product-specification.md). Treat child-specific tasks below as deferred; retain the safeguards against double counting and including verified child-earmarked funds in adult spendable totals. All MVP UI is mobile first.

**Goal:** Produce permission-aware wealth totals and reproducible goal dates, including a useful free contribution-only baseline.

**Effort:** 8–12 engineer-days, excluding provider approval waits.

**Architecture:** NestJS owns authorisation and persistence; a pure TypeScript package owns arithmetic; Next.js presents results.

**Stack:** Existing pnpm monorepo, NestJS, Zod, Prisma/Postgres, decimal arithmetic, Vitest, API integration tests and Playwright.

**Specifications:** [Product](../01-product-specification.md), [architecture](../02-architecture-and-project-structure.md), [data rules](../03-data-model-and-financial-rules.md), [projection mathematics](../05-local-ai-and-projections.md).

**Global constraints:** Integer minor units, **HALF_UP** rounding, tenant-scoped repositories/RLS, explicit account grants, no money movement, no LLM calculations, child ownership preserved.

**Review focus:** Conservation of value, source completeness, allocation races, reproducibility, rate provenance and permission changes.

All files, interfaces and commands below are planned implementation work. They have not been created or executed by writing this plan.

## 1. Dependencies and entry checks

- [ ] Phase 1 identity, household, account grants, manual records, imports and entitlement checks have passed their isolation gates.
- [ ] Phase 2 exposes canonical accounts, booked transactions, complete balance/holding snapshots, source timestamps, capability flags and idempotent ingestion. Use synthetic adapters while approvals are pending; record this limitation.
- [ ] Resolve any disagreement between specifications before implementation. The canonical cash rounding rule is HALF_UP; source-reported money remains unchanged.
- [ ] Freeze the engine's first assumptions convention in `docs/decisions/003-projection-conventions.md`: Europe/London calendar, month-end contributions, 600-month horizon, effective annual rates and explicit inflation treatment.
- [ ] Preserve Phase 2 provider gates. A live bank or Trading 212 dependency must not be satisfied by relabelling a statement import.

An engineer can build the pure calculator and fixtures before live approval. Acceptance of the connected founder release remains conditional on approved real integrations.

## 2. Task A — Contracts and storage

**Planned files:** `packages/contracts/src/wealth.ts`, `goals.ts`, `projections.ts`; `packages/projections/src/types.ts`; `packages/database/prisma/schema.prisma` and one reviewed wealth/goals migration.

- [ ] Reuse canonical `Money` as `{ amountMinor: string; currency: CurrencyCode }`. Validate decimal rates, date-only strings and bounded ranges; reject unknown fields and mixed currencies without an explicit conversion.
- [ ] Define `WealthSummaryDto`, `GoalDto`, `GoalAllocationSetDto`, `ContributionPlanDto`, `ScenarioDto` and `ProjectionRunDto`. Include scope, completeness, valuation dates, dataset/grant versions and excluded reasons without revealing inaccessible accounts.
- [ ] Define `ProjectionInputV1` and `ProjectionResultV1`. Inputs contain opening money, target, first contribution date, monthly schedule, withdrawals, fees, tax assumptions, inflation, target basis and horizon. Results contain status, first qualifying month, monthly series, contributions, growth/cost breakdown and warnings.
- [ ] Add/version ChildProfile and AccountAuthority where needed, plus Goal, GoalAllocation, ContributionPlan, Scenario and ProjectionRun; reuse existing asset/holding/FX entities. Keep scenarios immutable once evaluated. Basic runs may have `scenarioId: null`; advanced runs require a saved scenario.
- [ ] Persist canonical input serialization, `inputHash`, `engineVersion`, rounding convention and source snapshot references. An edited goal or corrected source produces a new run, never an invisible rewrite.
- [ ] Add tenant-matched foreign keys, optimistic versions and locks on existing Account rows before checking and writing allocations. Verify migrations against a disposable database and preserve the preceding release's readable columns.

`ProjectionRunDto.mode` is `BASIC | ADVANCED`. Calculation states are `already_achieved`, `reachable`, `insufficient_inputs`, `budget_deficit`, `depleted`, `unreachable_under_assumptions` and `beyond_horizon`, matching the public API and engine exactly. Access failures use the API's existing non-disclosing error policy; they are not financial calculation states.

## 3. Task B — Wealth valuation and ownership

**Planned files:** `packages/domain/src/wealth/value-accounts.ts`; `apps/api/src/modules/wealth/wealth.service.ts`, `wealth.controller.ts`, `wealth.repository.ts`; `packages/test-fixtures/wealth/`.

- [ ] Implement `valueAccounts(scopedSnapshots, fxSnapshot): WealthSummaryDto` as a pure calculation. The API chooses authorised snapshots first; the function cannot query the database.
- [ ] Prefer a current provider total when its coverage is known. Use holdings plus cash only as a separately identified complete alternative. Do not add portfolio total, pie grouping and constituent holdings together.
- [ ] Count a canonical joint account once across provider connections. Subtract positive debt balances once; normalise overdrafts consistently. Keep property and its mortgage separate.
- [ ] Return adult net worth, liquid adult assets and child-owned assets separately. Family-combined reporting is opt-in and retains ownership labels. Restricted pensions and child funds cannot become adult goal cash.
- [ ] Apply explicit FX source/date to original currency values. Missing price, quantity or FX yields an incomplete aggregate, never a fabricated zero or 1:1 conversion.
- [ ] Enforce freshness defaults from the data specification: 48 hours for bank/broker snapshots and 30 days for manual balances. Preserve historical as-of dates; fetching an old valuation does not make it current.
- [ ] Support TOTALS in permitted wealth aggregates but exclude transaction-derived categories and holdings detail. Label partial visibility “visible net worth”. Recheck scope before returning cached results.

## 4. Task C — Goals and shared funding

**Planned files:** `packages/domain/src/goals/allocations.ts`, `contribution-budget.ts`; `apps/api/src/modules/goals/goals.service.ts`, `goals.controller.ts`, `allocation.repository.ts`.

- [ ] Implement goal creation, editing, archival, target date, currency, beneficiary and priority. Archival preserves provenance and history.
- [ ] Model each allocation with an explicit basis: fixed cash minor units or a fraction of a named eligible account/asset valuation. Define fraction `0.25` as 25%, store decimal precision and valuation provenance; never confuse money, units and percentages.
- [ ] Require source-account ownership or separately recorded guardian-management authority for a child account to commit funding allocations; a read grant alone does not transfer control. Guardian authority does not change child legal ownership and cannot allocate child funds to an adult goal. Joint owners use the same allocation lock. A partner can view only permitted goal information.
- [ ] In one transaction, lock affected funding accounts, recompute available value, check existing allocations/reserves and commit. Two concurrent £300 allocations against £500 must not both succeed. Return `ALLOCATION_EXCEEDS_AVAILABLE` only to an authorised caller.
- [ ] Preserve an allocation intention after a valuation fall but flag it underfunded. Do not silently borrow, sell, transfer or invent cash. Exclude credit limits, unsettled proceeds and bill reserves from eligible funds.
- [ ] Share one future contribution budget across concurrent goals. Persist priority or proportions; mark an over-budget what-if unfunded. Planned contributions are never inserted as observed transactions.
- [ ] Revoke or rebuild derived goal views when source permissions narrow. A safely scoped privacy recomputation remains free; hiding a result safely is preferable to exposing it behind a paywall.

## 5. Task D — Pure engine and separately verified assumptions

**Planned files:** `packages/projections/src/project-monthly.ts`, `calendar.ts`, `scenario-hash.ts`, `index.ts`; `apps/api/src/modules/projections/projections.service.ts`, `assumptions.service.ts`, `projections.controller.ts`.

- [ ] Export `projectMonthly(input: ProjectionInputV1): ProjectionResultV1` with no clock, network, Prisma or model dependency. Inject dates and all assumptions.
- [ ] Implement month-end recurrence `B[m] = round_HALF_UP(B[m-1] * g + C[m] - W[m] - fixedFees[m] - tax[m])`, where `g = ((1+grossAnnual)*(1-feeAnnual))^(1/12)`. Keep decimal intermediate precision and version rounding boundaries.
- [ ] Handle zero growth directly; negative growth, depletion, target already reached and a finite horizon have explicit outcomes. “Beyond horizon” must not be represented as mathematical impossibility.
- [ ] Separate nominal targets from today's-money targets. Inflate the latter or deflate balances consistently; do not apply both adjustments to the same comparison. Contribution escalation is explicit.
- [ ] Record each rate's `sourceKind` (`USER`, `VERIFIED_PROVIDER`, `ILLUSTRATION`), source reference, effective date and annual convention. Validate provider-derived rates independently of the model. No assumed “current savings rate”, future market return or tax allowance is inferred from model text.
- [ ] Keep the free BASIC path under `projections.basic` contribution-only: zero growth, no inflation, costs or taxes; disclose those exclusions. Reject advanced-only fields. The user can edit their manual goal and obtain another free baseline.
- [ ] Gate new saved what-if scenarios and advanced runs with `projections.advanced`; founder access uses the audited entitlement grant. Existing authorised results and exports remain readable after downgrade.
- [ ] Implement `packages/domain/src/spending/recurring-costs.ts` and `apps/api/src/modules/categories/rules.service.ts` from the precedence/cadence rules in 03. Expose recurring candidates and rule CRUD from 07; test manual override preservation, irregular cafe false matches, variable bills, transfers and refunds. Paid rule execution and scheduled insights recheck entitlements.
- [ ] Build 3/6/12 complete-month baselines with explicit coverage, transfer exclusions and one-off rules. Genuine zero-income months count; missing months do not. Variable-income assumptions require user confirmation or a manual contribution plan.

## 6. Task E — API and usable web screens

Use `H = /v1/households/{householdId}`. Generate OpenAPI from validated contracts.

| Route                                    | Contract and rule                                               |
| ---------------------------------------- | --------------------------------------------------------------- |
| `GET H/wealth`                           | `WealthSummaryDto`; visible scope only.                         |
| `GET/POST H/goals`                       | List/create `GoalDto`.                                          |
| `GET/PATCH H/goals/{goalId}`             | Read/update with optimistic version.                            |
| `PUT H/goals/{goalId}/allocations`       | Atomic `GoalAllocationSetDto` replacement.                      |
| `PUT H/goals/{goalId}/contribution-plan` | Validated `ContributionPlanDto`.                                |
| `POST H/projections/basic`               | Free baseline; `ProjectionRunDto`; no advanced Scenario needed. |
| `POST H/scenarios`                       | Create immutable `ScenarioDto`; advanced entitlement.           |
| `POST H/projections`                     | `{ scenarioId }` → `ProjectionRunDto`; advanced entitlement.    |
| `GET H/projections/{projectionId}`       | Reauthorise source dependencies, including saved history.       |

- [ ] Implement `apps/web/app/(app)/wealth/page.tsx`, `goals/page.tsx`, `goals/[goalId]/page.tsx` and `apps/web/components/goals/GoalProjectionPanel.tsx`.
- [ ] Show accessible table plus chart, target assumptions, first payment date, source freshness and excluded funds. Render numbers from the DTO. “Projected September 2027” is conditional, not a guarantee.
- [ ] Expose incomplete, stale, underfunded, already-achieved and unreachable states. A paywall appears only on an explicit advanced action, never when viewing basic goals, history, ownership or privacy controls.

### Category-cap and savings feedback extension

- [ ] Extend the existing budgets/monthly review UI with category caps, a remaining-money countdown, steady red at zero and a brief gentle overspend pulse with reduced-motion support.
- [ ] Show the qualified effect of net budget variance on confirmed monthly savings/contributions and, only with sufficient authorised engine inputs, the goal timeline. Preserve shortfalls and avoid double-counting across goals.
- [ ] Add supportive month-end encouragement to plan an eligible leftover amount towards a user-selected savings/investment goal. Require explicit confirmation; no automatic transfer, trade or observed savings entry.
- [ ] Verify all examples, missing-data, permission, exact-money, mobile and accessibility outcomes in [category caps and savings requirements](../../decisions/category-caps-and-savings-plan.md). Deliver this extension through its own build-step gate; none of these requirements is complete yet.

## 7. Critical verification and planned commands

Create `packages/projections/src/__tests__/golden.test.ts`, `allocation-properties.test.ts` in the domain package, `apps/api/test/wealth-goals-projections.e2e-spec.ts` and `apps/web/tests/goals.spec.ts`. Cover these outcomes rather than snapshots of implementation details:

- [ ] £1,000 plus £250/month reaches £4,000 after exactly 12 payments; first 30 November 2026 means 31 October 2027. £290/month reaches it on 30 September 2027 after 11.
- [ ] Independent zero-growth arithmetic and nonzero-growth closed forms agree with the recurrence within explicitly justified rounding bounds; include negative rates, fees, inflation and HALF_UP boundary values.
- [ ] £10,000 broker total containing £2,000 cash/£8,000 holdings stays £10,000; £7,000 adult savings plus £3,000 child assets keeps adult assets at £7,000. A recorded guardian manager can maintain the child goal without becoming the legal owner; an unrelated household member cannot.
- [ ] Allocation concurrency permits at most one £300 claim against £500. Allocations never increase net worth; planned contributions never create cash events.
- [ ] TOTALS cannot retrieve spending/holdings. A revoked source invalidates prior results immediately. Alternating households on one pooled connection never leaks rows.
- [ ] Missing FX/history produces an explicit incomplete state. Free basic works; downgraded advanced creation fails while authorised historical reads and privacy operations succeed.

Register the named phase scripts in the relevant `package.json` files, then run from repository root:

```bash
pnpm install --frozen-lockfile
pnpm --dir packages/projections run test
pnpm --dir packages/domain run test:goals
pnpm --dir apps/api run test:phase03
pnpm --dir apps/web run test:phase03
pnpm run verify:phase03
```

`verify:phase03` performs type checking, lint, OpenAPI compatibility, builds and disposable-database migration validation. Preserve results and fixture versions in the phase acceptance record.

## 8. Exit, review and rollback

- [ ] Every critical assertion passes; no unresolved permission or monetary defect remains. Replaying an identical versioned input produces identical series and target date.
- [ ] Both adults can review permitted wealth, edit goals, see a free baseline and inspect advanced assumptions. The 600-month calculation target is under 250 ms at p95 on the staging host, excluding database/network time; record the actual measurement.
- [ ] Record approval/coverage gaps honestly. The connected core is partial if its required real connectors remain unavailable.
- [ ] An independent reviewer signs off arithmetic conventions, allocation locking, source-scope invalidation and provider-total reconciliation.

Rollback disables new advanced runs and allocation writes through server feature flags, preserves goal records and immutable runs, and restores the prior compatible API/UI. Keep old engine versions for historical interpretation. Rebuild incorrect derived aggregates from source snapshots; do not modify original provider rows or drop the new tables as an emergency rollback. Privacy revocation and free exports continue throughout.
