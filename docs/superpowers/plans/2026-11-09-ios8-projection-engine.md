# IOS8 Implementation Plan: Deterministic Projection Engine

## 1. Context and Goals

IOS8 finishes the deterministic projection engine in `packages/projections/src/` with independent golden fixtures, pure mathematical modeling, exact `HALF_UP` minor-unit rounding, and canonical SHA-256 hashing.

### Success Criteria:

- **Owns:** `packages/projections/src/` and independent golden fixtures.
- **Pure Arithmetic:** Reproducible money calculations using BigInt minor units. No floating-point rounding errors, no UI or LLM arithmetic, no external rate sources.
- **Coverage:**
  - All calculation statuses: `already_achieved`, `reachable`, `beyond_horizon`, `depleted`, `budget_deficit`, `unreachable_under_assumptions`, `insufficient_inputs`.
  - BASIC and ADVANCED modes.
  - Month-end calendar dates (Europe/London, February 28/29 leap years, 30/31 day months, up to month 600).
  - Effective annual rate compounding: `g = ((1 + grossAnnualRate) * (1 - proportionalFeeAnnualRate))^(1/12)`.
  - Inflation adjustment for `TODAYS_MONEY`: `target * (1 + inflationAnnualRate)^(m/12)`.
  - Exact `HALF_UP` rounding at monthly cash boundaries.
  - Conservation laws: `closing = opening + contributions - withdrawals + growth - proportionalFees - fixedFees - tax`.
  - Deterministic input hashing: SHA-256 over canonicalized JSON representation.

---

## 2. Mathematical Architecture

### 2.1 Calendar Progression

- Initial date `firstContributionDate` is validated as a month-end date (`YYYY-MM-DD`).
- For month index $m \in \{1, \dots, H\}$, calendar date is `monthEndAtOffset(firstContributionDate, m - 1)`.

### 2.2 Effective Annual Rate Compounding

- Given `grossAnnualRate` decimal string $r_g \in [-1, 1]$ and `proportionalFeeAnnualRate` decimal string $r_f \in [0, 1)$:
  - Monthly gross factor $g_m = (1 + r_g)^{1/12}$.
  - Monthly fee retention factor $f_m = (1 - r_f)^{1/12}$.
  - For high-precision calculation without binary float inaccuracies: compute using high-precision rational/decimal arithmetic ($10^{18}$ scaled fixed-point or BigInt decimal arithmetic).
- Monthly gross growth:
  $G[m] = \text{round\_HALF\_UP}(B[m-1] \times (g_m - 1))$
- Monthly proportional fee:
  $P_{fee}[m] = \text{round\_HALF\_UP}((B[m-1] + G[m]) \times (1 - f_m))$
- Balance after investment returns:
  $B_{invested}[m] = B[m-1] + G[m] - P_{fee}[m]$

### 2.3 Scheduled Cash Flows

- Scheduled contribution $C[m]$: active contribution for month $m$ from `monthlyContributions`.
- Scheduled withdrawal $W[m]$: from `withdrawals` entry matching month $m$ (default 0).
- Fixed fee $F_{fixed}[m]$: from `fixedFees` entry matching month $m$ (default 0).
- Scheduled tax $Tax[m]$: from `tax` entry matching month $m$ (default 0).

### 2.4 End-of-Month Closing Balance

- Net cash flow before depletion check:
  $B[m] = B_{invested}[m] + C[m] - W[m] - F_{fixed}[m] - Tax[m]$
- Depletion floor: If $B[m] \le 0$, balance clamps to 0.

### 2.5 Target Inflation

- Under `targetBasis: "FIXED_NOMINAL"`:
  $T[m] = T_{opening}$
- Under `targetBasis: "TODAYS_MONEY"`:
  $T[m] = \text{round\_HALF\_UP}(T_{opening} \times (1 + r_i)^{m/12})$

### 2.6 Calculation Status Evaluation

1. If `opening >= target`: status is `already_achieved`, `firstQualifyingDate = null`.
2. If at any month $m$, $B[m] \ge T[m]$:
   - First such month sets `status = "reachable"` and `firstQualifyingDate = date[m]`.
3. If balance drops to 0:
   - If scheduled outflows exceed remaining balance + inflow: `budget_deficit` or `depleted`.
4. If horizon is reached without hitting target:
   - If trajectory is positive/growth possible: `beyond_horizon`.
   - If trajectory is negative or perpetually declining: `unreachable_under_assumptions`.

---

## 3. Implementation Steps

1. **Precision Math & Calendar Utilities:**
   - Implement `packages/projections/src/math.ts`: high-precision effective monthly factor calculation, `roundHalfUp`, inflation scaling.
   - Implement `packages/projections/src/hash.ts`: canonical JSON serializer + SHA-256 hasher.
2. **Core Calculator Engine:**
   - Implement `packages/projections/src/calculator.ts`: pure `calculateProjection(input: ProjectionInputV1, options?: { engineVersion?: string })`.
   - Export all functions from `packages/projections/src/index.ts`.
3. **Comprehensive Golden & Invariant Tests:**
   - Create `tests/projection-engine.test.ts`:
     - ADR-007 / ADR-012 golden cases.
     - Leap years (February 29 vs 28).
     - 600-month horizon performance and precision.
     - Negative and zero growth rates.
     - High inflation rates.
     - Conservation of funds in breakdown.
     - Monotonicity checks.
     - Input hashing stability.
4. **Local Verification:**
   - `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `bundle:ios`, `bundle:android`.
5. **Independent Reviews & PR:**
   - Security and Code Quality reviews, PR creation, CI monitoring, and merge.
