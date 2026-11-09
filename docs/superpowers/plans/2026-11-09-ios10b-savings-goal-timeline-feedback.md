# Design Document: IOS10b: Savings Impact and Goal Timeline Feedback

## 1. Problem Statement

Household budgeting and goal savings currently operate in isolation. While users establish category budget caps (IOS6) and define wealth goals with contribution schedules (IOS10a), spending overruns directly erode scheduled monthly savings without clear real-time feedback. Conversely, underspending in budgeted categories can free up qualified savings that can be intentionally allocated to goals at month-end.

Users need:

1. Cap-level and household-level savings impact feedback in budget views and monthly reviews.
2. Exact calculation of net overspend/underspend across budget caps, where confirmed savings (e.g. £200 scheduled) combined with net overspend (e.g. £15 across caps) yields a qualified net savings outcome (e.g. £185), ensuring underspend in one category offsets overspend in another without double deductions across goals.
3. Realistic timeline feedback: when goal inputs or permissions are insufficient, display amount-only feedback rather than inventing disposable cash or projecting reachable dates from mere cap remainders.
4. Month-end eligible allocation workflow: when period coverage is complete, offer a user-chosen confirmation to allocate eligible surplus towards a selected goal, verifying settled funds, source permissions, and allocation limits without creating phantom bank transfers.

## 2. Architecture Approach & Key Decisions

### A. Net Savings Impact Math (`savings-impact.ts`)

- Pure calculation functions in `@joint/domain` / `features/budgets/`:
  - Calculate per-category budget variance: `cap - actual`.
  - Aggregate across all active budget caps:
    - `totalCappedAllowance`: sum of active cap limits.
    - `totalCappedActual`: sum of actual spends in capped categories (handling net refunds gracefully).
    - `netCapVariance`: `totalCappedAllowance - totalCappedActual`.
    - When `netCapVariance < 0`, net overspend is `abs(netCapVariance)`.
    - When `netCapVariance >= 0`, net underspend is `netCapVariance`.
  - Qualified Monthly Savings:
    - Given scheduled savings `S` and net cap variance `V`:
    - If `V < 0`: qualified savings = `max(0, S - abs(V))` (£200 scheduled - £15 overspend = £185 qualified).
    - If `V >= 0`: qualified savings = `S` (scheduled savings preserved; underspend represents potential surplus allowance, not automatic cash).
    - No duplicate deduction across multiple goals: total overspend is apportioned or evaluated at household level before goal allocation.

### B. Amount-Only vs Projection Feedback

- If a goal has insufficient parameters (missing target, no opening valuation, or missing contribution schedule), or if source account access is revoked / totals-only, show amount-only variance.
- Never invent fictitious cash movements or project milestone dates based on unconfirmed cap allowances alone.

### C. Month-End Goal Surplus Confirmation Card

- Shown in `MonthlyReviewScreen` when:
  - Month is closed / reviewed (`report.coverage.complete === true`).
  - Net savings are positive or underspend exists.
  - User can choose an active goal and confirm allocating an eligible amount from an owned account.
  - Re-verifies source versions and settled balances via `writeAllocations`.

## 3. Data Model

- `CategoryVariance`:
  ```ts
  interface CategoryVariance {
    category: string;
    capMinor: string;
    actualMinor: string;
    varianceMinor: string; // positive = underspend, negative = overspend
    status: "under" | "reached" | "over";
  }
  ```
- `HouseholdSavingsImpact`:
  ```ts
  interface HouseholdSavingsImpact {
    scheduledSavingsMinor: string;
    totalCappedLimitMinor: string;
    totalCappedActualMinor: string;
    netCapVarianceMinor: string;
    netOverspendMinor: string;
    netUnderspendMinor: string;
    qualifiedSavingsMinor: string;
    impactExplanation: string;
  }
  ```

## 4. Failure Modes & Resilience

1. Net refunds in categories: If actual spend is negative (refunds exceed spend), `positive = 0` for consumption, and negative variance contributes positively to net allowance without breaking BigInt parsing.
2. Incomplete monthly coverage: If `report.coverage.complete === false`, savings surplus confirmation is disabled; warnings instruct user to complete account reviews first.
3. Stale goal version on allocation: Concurrency conflicts (HTTP 412) trigger immediate refresh with clear user retry prompt.
4. Totals-only or restricted accounts: Excluded from allocation confirmation options; user can only earmark fully owned accounts.

## 5. Security & Privacy

- Preserves tenant and household boundaries.
- No client-side financial mutations bypass server versioning (`If-Match`) or idempotency keys.
- No automatic transfers or phantom transactions created; intentions are strictly allocations in accordance with the domain model.

## 6. Rollout & Rollback Plan

- Implemented as part of mobile budget and review features.
- Fully backward compatible with existing spending reports, budget caps, and goal models.
- Reversible by reverting mobile UI integration without database schema changes.

## 7. Success Metrics

- 100% deterministic test coverage for cap math variations (£50/£35, £50/£50, £50/£65).
- Accurate qualified savings math (£200 planned - £15 overspend = £185).
- Zero flakiness or TypeScript errors across workspace.
- Passing iOS and Android bundle exports.
