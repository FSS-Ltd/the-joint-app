# IOS6 Budgets, category caps and month-end review implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development, one implementation task at a time, with independent task reviews and final whole-branch Code Reviewer and Application Security Engineer reviews. IOS6 cannot be marked complete before current CI passes and its merge is verified.

**Goal:** Deliver native category caps, progress rulers, budget editor, account-month coverage attestation, and month-end review in Expo React Native (iOS first, Android compatible) for The Joint App, bringing web parity for `/budgets` and `/review` into native workspace routes.

**Architecture:** Reuse existing NestJS endpoints (`/api/households/:id/reports/spending`, `/api/households/:id/budgets/:month`, `/api/households/:id/accounts/:id/coverage/:month`), shared contracts from `@joint/contracts`, and exact integer minor-unit GBP arithmetic from `@joint/domain/cash-flow`. Assemble native adapters on the existing `NativeTransport` and mount on `NativeFinanceProvider`. No floating-point math, no connector activations, no money movement.

**Tech stack:** Existing pinned Expo SDK58, React Native, Expo Router, @expo/ui, NestJS/PostgreSQL, TypeScript contracts, and Vitest. Zero new external dependencies.

**Spec:** [Approved product amendment](../../decisions/ios-only-product.md), [Category caps and savings plan](../../decisions/category-caps-and-savings-plan.md), [Approved visual contract](../../design/DESIGN.md), [Delivery plan](2026-11-02-ios-only-delivery.md).

## Global constraints

- Start from host-verified PR52 merge `0022cc7c9d0d5c19434ed42ef8b226402cf4375f`.
- iOS first, Android functional parity required.
- Maintain exact integer minor-unit GBP arithmetic (`capPosition`, `formatGbpMinor`, `formatAggregateMoney`); no `Number` conversion of financial values.
- Optimistic locking via `If-Match: budget.version` and `If-Match: coverage.version`. Surface 412 conflicts gracefully without discarding user input.
- Accessible category cap meter: explicit status labels ("Within cap", "Limit reached", "Over limit"), accessible `role="meter"` values, steady red fallback, and overspend pulse strictly disabled under `prefers-reduced-motion`.
- Caps and savings impact are planning scenarios only; clear copy that no money is moved or balances changed.
- Coverage attestation toggles are restricted to account owners (`ownership === "OWNED"`).

## Review focus

1. **Exact minor-unit math:** Verification of cap calculations across £0 cap, exact cap (£50/£50), overspend (£50/£65), net refunds, and values exceeding `Number.MAX_SAFE_INTEGER`.
2. **Concurrency & If-Match:** Concurrent edits by two household adults must not silently overwrite; 412 Precondition Failed must be caught and handled with user-recoverable conflict actions.
3. **Accessibility & Motion:** High-contrast color pairs (forest/ivory, forest/sage, error/ivory), Dynamic Type font scaling without truncation, and overspend animation respecting `prefers-reduced-motion`.
4. **Data boundaries:** Ensure spending reports and coverage records respect authorized account scope; no cross-household or unshared account leakage.

---

## Task 1 — Spending, Budgets & Coverage API Adapters and Domain Arithmetic

**Owns:** `apps/mobile/src/api/spending.ts`, `apps/mobile/src/features/budgets/cap-math.ts`, finance context extension, and focused unit tests.

- [ ] Write RED tests in `tests/native-budgets-api.test.ts` for:
  - `readSpendingReport`: URL params formatting (`month`, `accountIds`), response parsing with `spendingReportSchema`, error mappings (404 stale scope, 400 invalid params, 401 unauth).
  - `upsertBudget`: PUT payload validation with `budgetUpsertSchema`, `If-Match: version` header propagation, 412 conflict handling.
  - `attestCoverage`: PUT payload `{ complete }`, `If-Match: version` header propagation, 412 conflict handling.
  - `capPosition`: exact minor unit calculations matching `tests/category-cap-presentation.test.ts` (£50/£35 -> £15 remaining, £50/£50 -> limit reached, £50/£65 -> -£15 over, £0 cap, net refunds, beyond safe int).
- [ ] Implement `apps/mobile/src/features/budgets/cap-math.ts` (reusing `capPosition` and `categoryActual` logic).
- [ ] Implement `apps/mobile/src/api/spending.ts` creating `createSpendingApi(transport)`.
- [ ] Extend `NativeFinanceContextValue` in `apps/mobile/src/features/finance/context.ts` and `provider.tsx` with `spending: SpendingApi`.
- [ ] Verify tests pass: `pnpm test tests/native-budgets-api.test.ts` and mobile typecheck. Commit Task 1.

---

## Task 2 — Native Category Caps & Budget Screen (`/budgets`)

**Owns:** `apps/mobile/src/features/budgets/` components (`CapCard`, `CapList`, `BudgetEditor`, `BudgetScreen`), route `apps/mobile/app/(workspace)/budgets/index.tsx`, and tests.

- [ ] Write RED tests in `tests/native-budgets-ui.test.ts` for:
  - `CapCard` rendering £15 left, £0 left · Limit reached, £15 over limit.
  - Meter accessibility attributes (`aria-valuenow`, `aria-valuetext`).
  - Overspend pulse animation respecting `useReducedMotion()`.
  - Saving-plan impact copy: "£15 less to put toward saving if other spending stays as planned. This comparison does not move money."
  - Net refund notice: "Net refunds increase the remaining allowance. This is a cap comparison, not an account balance."
  - `BudgetEditor`: category limit editing, adding lines, removing lines, positive GBP input validation, and optimistic concurrency submission with `If-Match`.
- [ ] Implement `CapCard.tsx`, `CapList.tsx`, `BudgetEditor.tsx`, and `BudgetScreen.tsx`.
- [ ] Create route `apps/mobile/app/(workspace)/budgets/index.tsx`.
- [ ] Add `budgets` route to `workspace-layout.tsx` as a hidden tab (retaining router reachability).
- [ ] Add navigation action to Home and More screens.
- [ ] Verify all tests pass, typecheck clean, lint clean. Commit Task 2.

---

## Task 3 — Account-Month Coverage Attestation & Month-End Review (`/review`)

**Owns:** `apps/mobile/src/features/review/` components (`CoverageCard`, `MonthlyReviewScreen`), route `apps/mobile/app/(workspace)/review/index.tsx`, and tests.

- [ ] Write RED tests in `tests/native-review-ui.test.ts` for:
  - `CoverageCard`: renders accounts in scope, ownership badge ("Yours" vs "Shared with you"), coverage complete vs incomplete.
  - Toggle button: enabled only for `OWNED` accounts and closed periods; disabled for unowned accounts.
  - Attestation submission with `If-Match: account.version`.
  - Coverage reasons rendering (`MISSING_HISTORY`, `OPEN_PERIOD`, etc.).
  - `MonthlyReviewScreen`: cash flow summary (spending, income, net cash), category breakdown, trend overview, month-end encouragement thought, navigation to budgets.
- [ ] Implement `CoverageCard.tsx` and `MonthlyReviewScreen.tsx`.
- [ ] Create route `apps/mobile/app/(workspace)/review/index.tsx`.
- [ ] Add `review` route to `workspace-layout.tsx` as a hidden tab.
- [ ] Verify all tests pass, typecheck clean, lint clean. Commit Task 3.

---

## Task 4 — Local Verification, Independent Security & Code Review, and PR

- [ ] Run full test suite: `pnpm test` (100% pass across all 130+ test files).
- [ ] Run typecheck: `pnpm --filter @joint/mobile typecheck` and `pnpm typecheck`.
- [ ] Run lint and format check: `pnpm lint` and `pnpm format:check`.
- [ ] Run mobile bundle exports: `pnpm --filter @joint/mobile bundle:ios` and `bundle:android`.
- [ ] Run independent code review using `code-reviewer` profile.
- [ ] Run independent security review using `security-appsec-engineer` profile.
- [ ] Address any review findings.
- [ ] Update `docs/progress.md` with full IOS6 delivery evidence and feature tree references.
- [ ] Push branch `build/ios6-budgets-review` and open pull request with conventional title: `IOS6: native budgets, category caps and month-end review`.
- [ ] Verify CI checks on GitHub.
