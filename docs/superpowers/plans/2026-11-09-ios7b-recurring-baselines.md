# IOS7b Implementation Plan: Recurring Categories and Complete-Month Baselines

Date: 2026-11-09  
Owner: Technical Agent  
Base branch: `feat/ios7b-recurring-baselines`  
Deliverable: IOS7b (Old 3D) per `docs/superpowers/plans/2026-11-02-ios-only-delivery.md:113-120`

---

## 1. Goal and Scope

Deliver recurring category rules and complete-month baselines:

- Pure domain calculators in `packages/domain/src/spending/`:
  - `recurring-costs.ts`: Pure detector for recurring expense candidates (180-day window, >=3 occurrences, weekly/monthly median gap, median amount, variable bills, transfer/refund exclusions, overlapping proposed reductions, heuristic confidence).
  - `baselines.ts`: Deterministic 3, 6, 12 complete-month baselines with explicit coverage, genuine zero-income vs missing months, and 25th-percentile nearest-rank calculation for 12m variable income.
  - `precedence.ts`: Categorisation precedence (manual override > owner rule > provider category > uncategorized).
- Database schema and migration:
  - `CategorisationRule` model with RLS and owner fences.
  - Migration script with rollbacks and grant safety.
- Contracts in `packages/contracts/src/`:
  - `categorisation-rules.ts`: CRUD DTOs and Zod validation.
  - `recurring-costs.ts`: Candidate DTOs and query contracts.
  - `baselines.ts`: Complete-month baseline DTOs.
- API endpoints and services:
  - `apps/api/src/modules/categories/rules.service.ts` and `rules.controller.ts`:
    - `GET/POST /v1/households/:id/categorisation-rules` (create requires `categorisation.automation`).
    - `PATCH/DELETE /v1/households/:id/categorisation-rules/:id` (delete is free).
  - `apps/api/src/modules/reports/`:
    - `GET /v1/households/:id/recurring-costs`.
    - `GET /v1/households/:id/reports/baselines`.
- Native mobile controls and screens:
  - Native API clients in `apps/mobile/src/api/`.
  - Recurring candidates and baseline components in `apps/mobile/src/features/budgets/`.
  - Rule creation action in `apps/mobile/src/features/activity/`.
  - Design craft: forest/ivory palette, tokens, touch targets, VoiceOver accessibility.
  - Structure guard compliance: `NativeAction` wrapped in `NativeActions` or `Host`.
- Quality gates:
  - Test-driven development with golden fixtures.
  - Full test suite, lint, format, typecheck, and iOS/Android bundles.
  - Independent AppSec and Code Review sign-offs.
  - PR, CI green, and merge into `main`.

---

## 2. Implementation Steps

1. **Step 1: Domain Logic (TDD)**
   - Create `packages/domain/src/spending/precedence.ts`
   - Create `packages/domain/src/spending/recurring-costs.ts`
   - Create `packages/domain/src/spending/baselines.ts`
   - Export from `packages/domain/src/index.ts`
   - Write comprehensive domain tests in `packages/domain/src/spending/__tests__/` covering:
     - Manual override preservation
     - Irregular cafe false matches
     - Variable monthly bills
     - Refunds and transfer exclusions
     - Genuine zero-income complete months vs missing months
     - 25th-percentile calculation for 12m
     - Insufficient history handling

2. **Step 2: Database Schema & Migration**
   - Add `CategorisationRule` to `packages/database/prisma/schema.prisma`
   - Create migration `20261109120000_categorisation_rules/migration.sql` with RLS policies and indexes
   - Re-generate Prisma client

3. **Step 3: Contracts**
   - Add `packages/contracts/src/categorisation-rules.ts`
   - Add `packages/contracts/src/recurring-costs.ts`
   - Add `packages/contracts/src/baselines.ts`
   - Export from `packages/contracts/src/index.ts`

4. **Step 4: API Services and Controllers**
   - Add `apps/api/src/modules/categories/rules.service.ts`
   - Add `apps/api/src/modules/categories/rules.controller.ts`
   - Add `apps/api/src/modules/reports/recurring-costs.service.ts`
   - Add `apps/api/src/modules/reports/baselines.service.ts`
   - Wire into `reports.controller.ts` and `identity.module.ts`
   - Write integration tests in `tests/categorisation-rules.integration.ts` and `tests/recurring-costs.integration.ts`

5. **Step 5: Native Mobile UI and API Integration**
   - Add API methods in `apps/mobile/src/api/spending.ts` or new `recurring.ts` / `rules.ts`
   - Add `RecurringCandidatesCard` and `BaselinesCard` to `apps/mobile/src/features/budgets/`
   - Add rule creation action to `apps/mobile/src/features/activity/`
   - Write mobile tests in `tests/native-recurring-ui.test.ts` and ensure structure guards pass

6. **Step 6: Quality Gate, Independent Reviews, PR, and Merge**
   - Run typecheck, lint, format check, full vitest suite, and mobile bundle checks
   - Update `FEATURE_TREE.md`, `docs/features/planned.md`, `docs/features/finance.md`, and `docs/progress.md`
   - Obtain Independent AppSec and Independent Code Review approvals
   - Push branch, open PR via `gh pr create`, monitor CI, and merge via `gh pr merge --merge --delete-branch`
