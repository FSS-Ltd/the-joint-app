# Phase 1 — Foundation and Manual Finance Implementation Plan

**Goal:** Give both adults a useful, secure manual household finance application and establish the contracts later phases will reuse.

**Architecture:** Next.js web, Nest API/worker, Postgres/Prisma and Supabase Auth; explicit grants and central entitlements.

**Tech stack:** Pinned Phase 0 matrix; pnpm/Turborepo, Zod, Vitest/Jest, Testcontainers and Playwright.

**Specs:** [product](../01-product-specification.md), [architecture](../02-architecture-and-project-structure.md), [data](../03-data-model-and-financial-rules.md), [API/frontend](../07-api-and-frontend-specification.md), [security](../08-security-privacy-and-compliance.md).

**Effort:** 8–12 engineer-days. **Entry:** Phase 0 baseline exists; synthetic work may proceed while live-provider permissions remain blocked.

## Global constraints

Two separate adult identities; accounts private by default; finance data through Nest only; signed minor-unit cash as strings at API boundaries; no live bank/broker integration in this phase. Free and founder entitlements are server-side records. Tests use two unrelated synthetic households, not real statements.

## Review focus

A client-supplied household ID; a totals-only partner requesting detailed data; an interrupted/duplicate import; two valid same-day identical purchases; cookie/session refresh and immediate revocation. Tests below pin these failures.

## Task 1.1 — Scaffold a working vertical slice

**Files:** create `pnpm-workspace.yaml`, `turbo.json`, root/package manifests, `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`, `packages/domain`, `packages/database`, `packages/entitlements`, `packages/test-fixtures`, `.github/workflows/ci.yml`.

**Interfaces:** root scripts `lint`, `typecheck`, `test`, `build`, `format:check`; package names `@joint/web`, `@joint/api`, `@joint/worker`, `@joint/database`, `@joint/domain`. Later phases add their declared scripts.

- [ ] Create pinned workspace configuration, typed environment schemas and secret-free `.env.example` files.
- [ ] Add a local synthetic database lifecycle, seed two households and establish Prisma migrations as the sole app-schema history.
- [ ] Create durable Job and OutboxEvent tables plus `packages/database/src/jobs.repository.ts` and `apps/worker/src/job-runner.ts`. Implement lease/heartbeat/idempotency states from 02. Test duplicate delivery and worker crash/lease expiry using a synthetic import job; commit domain writes and outbox together.
- [ ] Implement live/ready health routes and one harmless authenticated route from web through API to DB.
- [ ] Add CI install/lint/typecheck/build plus the meaningful tests from later tasks; make the worker boot separately.
- [ ] Document local commands and port mapping without exposing databases publicly.

**Verify:** `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. Local services start and health indicates real DB readiness. There is no value in a test that merely asserts a package file exists.

## Task 1.2 — Identity, two-adult membership and immediate revocation

**Files:** `apps/api/src/modules/identity/`, `households/`, `apps/api/src/guards/auth.guard.ts`, `apps/web/app/(auth)/`, `apps/web/app/api/auth/`, `apps/web/app/api/app/[...path]/route.ts`, `packages/database/prisma/schema.prisma`.

**Interfaces:** `AuthContext` and `SessionRegistry` from the specifications; `HouseholdService.create(ctx, input)`, `invite(ctx, email)`, `acceptInvite(ctx, token)`; authenticated `GET /v1/me`.

- [ ] Add meaningful integration cases: unauthenticated denied, invited email mismatch denied, reused/expired invite denied, third adult denied and blocked session denied before JWT expiry.
- [ ] Implement maintained Supabase identity/MFA flows and server-managed HttpOnly web sessions, with BFF origin/CSRF protection and serialized refresh.
- [ ] Implement invitation token hashing, seven-day expiry, acceptance transaction and membership constraints.
- [ ] Implement local/global session revocation as explicit operations; clear web caches on logout.
- [ ] Run `pnpm --filter @joint/api test:integration -- identity households` and web sign-in/MFA/multi-tab refresh tests.

**Acceptance:** Sign-in identifies the user; the server determines household membership. No provider credential or finance data exists in public auth metadata. A shared email/password is never required.

## Task 1.3 — Accounts, grants and tenant-safe storage

**Files:** `apps/api/src/modules/accounts/`, `apps/api/src/guards/account-access.guard.ts`, `packages/database/src/scoped-transaction.ts`, `packages/contracts/src/accounts.ts`, account/RLS migration, `apps/web/app/(app)/accounts/`.

**Interfaces:** `AccountAccessService.require(ctx, ids, level)`; `Database.withScope(ctx, callback)`; `Money` and `GrantLevel` from API spec.

- [ ] Write tests that household B cannot access household A's known UUID; partner NONE cannot learn existence; TOTALS cannot list merchants/categories/holdings.
- [ ] Create Account, AccountOwner, AccountGrant and BalanceSnapshot with tenant-matched foreign keys and a real least-privilege runtime DB role.
- [ ] Use transaction-local scope through `set_config(..., true)`; alternate requests through a single pooled connection in an isolation test.
- [ ] Add account create/list/manual valuation and versioned grants routes; widening grants requires recent MFA.
- [ ] Build account cards showing owner, sharing and as-of date; preserve private defaults when a partner joins.
- [ ] Run `pnpm --filter @joint/database test:integration -- isolation` and `pnpm --filter @joint/api test:integration -- accounts`.

**Acceptance:** Direct Data API access exposes no app finance tables. Household admin/billing role does not override account grants.

## Task 1.4 — CSV import, manual entries and transaction corrections

**Files:** `apps/api/src/modules/imports/`, `transactions/`, `apps/worker/src/handlers/import.handler.ts`, `packages/domain/src/money.ts`, `packages/domain/src/transaction-normalisation.ts`, `apps/web/app/(app)/activity/`.

**Interfaces:** `previewImport(ctx, file, mapping): Promise<ImportPreviewDto>`; `commitImport(ctx, batchId, idempotencyKey): Promise<ImportResultDto>`; `Money` uses canonical inflows positive/outflows negative.

- [ ] Add fixtures for two identical legitimate purchases, repeated file import, overlapping files, decimal/currency parsing, ambiguous UK/US dates, rejected rows and mid-commit failure.
- [ ] Implement bounded upload (10 MB/50,000 rows), explicit mapping/date convention, preview and encrypted temporary object storage.
- [ ] Implement ImportBatch/Transaction/TransactionRevision/TransactionOverride; preserve provider/source-like originals separately from annotations. Only an owner changes canonical account classifications; notes remain author-private unless separately shared.
- [ ] Commit in an atomic/idempotent path; retain row-level reject reasons and never silently drop transactions.
- [ ] Support reversible import rollback only for rows owned by that batch; respect later annotations/shared provenance.
- [ ] Run `pnpm --filter @joint/domain test -- money transaction-normalisation` and `pnpm --filter @joint/api test:integration -- imports`.

**Acceptance:** Exact repeated file cannot double spending; matching amount/date/merchant alone cannot delete a genuine second purchase. Source rows remain auditable after corrections.

## Task 1.5 — Spending, budgets and the monthly review screen

**Files:** `apps/api/src/modules/categories/`, `budgets/`, `reports/`, `packages/domain/src/cash-flow.ts`, `apps/web/app/(app)/dashboard/`, `budgets/`, `review/`.

**Interfaces:** `summariseSpending(input): SpendSummary` and `BudgetService.upsert(ctx, month, lines, version)`. Input contains authorised booked rows only.

- [ ] Write golden assertions for £500 own-account transfer → £0 consumption; £120 card purchase + payment → £120 spending; February refund leaves January posting history intact.
- [ ] Implement explicit manual classification/transfer confirmation and category splits summing exactly to the parent.
- [ ] Implement calendar-month budgets with GBP defaults, complete-period reporting and clear missing-history labels.
- [ ] Build responsive dashboard, activity filters and budget charts with accessible table alternatives; use permission-scoped query keys.
- [ ] Ensure the service worker caches only static/offline-shell assets and finance responses are no-store.
- [ ] Run `pnpm --filter @joint/domain test -- cash-flow` and `pnpm --filter @joint/web test:e2e -- monthly-review`.

**Acceptance:** Both adults can review an authorised month, correct categories and see spending without transfer/card double counting. Hidden-account information cannot be inferred from an inconsistent total.

## Task 1.6 — Entitlements, privacy controls and founder deployment rehearsal

**Files:** `packages/entitlements/src/capabilities.ts`, `apps/api/src/modules/entitlements/`, `privacy/`, `audit/`, `apps/worker/src/handlers/export.handler.ts`, `docs/runbooks/restore.md`.

**Interfaces:** `EntitlementService.require(ctx, capability)`; `GET H/entitlements`; `PrivacyService.requestExport(ctx, scope)`; deletion/leave routes from API spec.

- [ ] Define all seven canonical capabilities. Free grants `finance.manual` and `projections.basic`; a logged founder grant supplies future paid capabilities with <=90-day expiry.
- [ ] Test that a forged client Plus flag does nothing, an expired grant blocks premium work and export/delete/revoke remain available.
- [ ] Implement scoped export with CSV injection protection, expiring downloads, account disconnection placeholders disabled until Phase 2, leave and deletion lifecycle, including owner-only archive read/export routes after active membership ends.
- [ ] Test leaving without a pre-exit export: the owner can retrieve their sole-owned and verified jointly owned history through archive routes, but cannot see former partner-only accounts or private notes. Test an export token issued before a grant revocation fails on new/resumed download.
- [ ] Add secret/payload redaction and audit IDs; verify logs contain no supplied synthetic token sentinel.
- [ ] Restore an isolated database backup and apply a synthetic deletion ledger before serving it.
- [ ] Run the critical Playwright journey: two adults → accounts → import → budget → grant downgrade → export → leave.

**Acceptance:** Manual foundation works with actual controls and documented recovery. A real-data founder deployment only occurs after its security/auth/backup gates; no external deployment is implied by this written plan.

## Exit and rollback

Deliver a working manual PWA, seeded demonstration, tested permissions, reproducible import/report results and phase evidence. List bank/broker features as unavailable until Phase 2, not mocked as connected.

Commit reviewable changes task by task. Roll back application images using compatible migrations; preserve imported evidence and originals. A failed rollout must not delete financial data to make tests pass. Phase 1 is **not** the connected founder MVP.
