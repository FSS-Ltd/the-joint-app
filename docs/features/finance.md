# Financial features and shared arithmetic

Part of the [canonical feature tree](../../FEATURE_TREE.md). Status describes the exact scope below; it does not certify production readiness. Test links are inspected source evidence, not a claim that this inventory task reran them.

<a id="accounts"></a>

## ACCOUNTS — Manual accounts, valuations and sharing

- **Status:** `implemented`. **Purpose:** Create private accounts, append dated valuations and control account-specific sharing.
- **Entry points:** [apps/web/app/accounts/page.tsx](../../apps/web/app/accounts/page.tsx) — `AccountsPage`; [apps/web/app/accounts/[id]/page.tsx](../../apps/web/app/accounts/[id]/page.tsx) — `AccountPage`; [apps/api/src/modules/accounts/accounts.controller.ts](../../apps/api/src/modules/accounts/accounts.controller.ts) — `createAccountsController`.
- **Canonical implementation:** [apps/api/src/modules/accounts/account-queries.ts](../../apps/api/src/modules/accounts/account-queries.ts) — `AccountQueries`; [apps/api/src/modules/accounts/account-mutations.ts](../../apps/api/src/modules/accounts/account-mutations.ts) — `AccountMutations`; [apps/api/src/modules/accounts/account-grants.ts](../../apps/api/src/modules/accounts/account-grants.ts) — `AccountGrants`; [packages/database/prisma/schema.prisma](../../packages/database/prisma/schema.prisma) — `BalanceSnapshot`.
- **Depends on / reuses:** [AUTH](identity.md#auth), [CONTRACTS](platform.md#contracts), [DATABASE](platform.md#database), [DESIGN](platform.md#design), [HOUSEHOLD](identity.md#household), [MONEY](finance.md#money), [WEB_AUTH](identity.md#web_auth).
- **Used by:** [EVENTS](platform.md#events), [ACTIVITY](finance.md#activity), [ALLOCATIONS](finance.md#allocations), [ARCHIVE](platform.md#archive), [CONNECTORS](planned.md#connectors), [FUNDING](finance.md#funding), [IMPORTS](finance.md#imports), [NATIVE_API](identity.md#native_api), [NATIVE_FINANCE](planned.md#native_finance), [PROJECTIONS](finance.md#projections), [REPORTS](finance.md#reports), [SPENDING](finance.md#spending), [WEALTH](finance.md#wealth), [NATIVE_ACCOUNTS](finance.md#native_accounts).
- **Permission / data boundary:** ScopedDatabase supplies live actor/session/membership/grant context. Writes lock owned accounts. Creation requires aal2; widening sharing requires MFA within five minutes. NONE, TOTALS and TRANSACTIONS are distinct from owner authority.
- **Verification references:** [tests/account-status.integration.ts](../../tests/account-status.integration.ts) (seven cases passed on isolated synthetic PostgreSQL; IOS3 accepted and delivered in PR41); [tests/status-resources.test.ts](../../tests/status-resources.test.ts); [tests/accounts-api.integration.ts](../../tests/accounts-api.integration.ts); [tests/accounts-isolation.integration.ts](../../tests/accounts-isolation.integration.ts); [tests/account-permissions.test.ts](../../tests/account-permissions.test.ts); [tests/browser/account-workspace.spec.ts](../../tests/browser/account-workspace.spec.ts).
- **Graphify navigation:** scopes `api, shared, web-components, web-routes`; query `AccountQueries` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_ACCOUNTS`.
- **Debug / reuse / limits:** Debug reads in AccountQueries and account-projection.ts; reuse AccountMutations/AccountGrants for writes and valuation history. AccountQueries.observePage shares the bounded private page query with list, preserving cursor authority and returning stable items/hasMore for EVENTS. API/web implemented; native account screens remain IOS4.

<a id="activity"></a>

## ACTIVITY — Booked activity, classifications, splits, notes and transfers

- **Status:** `implemented`. **Purpose:** Read booked transactions, create manual records, classify/split them, keep private notes and confirm paired transfers.
- **Entry points:** [apps/web/app/activity/page.tsx](../../apps/web/app/activity/page.tsx) — `Page`; [apps/web/app/activity/[transactionId]/page.tsx](../../apps/web/app/activity/[transactionId]/page.tsx) — `Page`; [apps/api/src/modules/transactions/transactions.controller.ts](../../apps/api/src/modules/transactions/transactions.controller.ts) — `createTransactionsController`.
- **Canonical implementation:** [apps/api/src/modules/transactions/transaction-queries.ts](../../apps/api/src/modules/transactions/transaction-queries.ts) — `TransactionQueries`; [apps/api/src/modules/transactions/transaction-mutations.ts](../../apps/api/src/modules/transactions/transaction-mutations.ts) — `TransactionMutations`; [apps/api/src/modules/transactions/transaction-splits.ts](../../apps/api/src/modules/transactions/transaction-splits.ts) — `TransactionSplits`; [apps/api/src/modules/transfers/transfers.service.ts](../../apps/api/src/modules/transfers/transfers.service.ts) — `TransfersService`.
- **Depends on / reuses:** [ACCOUNTS](finance.md#accounts), [AUTH](identity.md#auth), [CONTRACTS](platform.md#contracts), [DATABASE](platform.md#database), [DESIGN](platform.md#design), [HOUSEHOLD](identity.md#household), [MONEY](finance.md#money), [WEB_AUTH](identity.md#web_auth).
- **Used by:** [IMPORTS](finance.md#imports), [NATIVE_FINANCE](planned.md#native_finance), [RECURRING](planned.md#recurring), [REPORTS](finance.md#reports), [SPENDING](finance.md#spending).
- **Permission / data boundary:** Manual/shared-classification writes require ownership; authorized viewers can keep author-private notes. Optimistic versions guard changes. Imported source records cannot be manually corrected; splits conserve the parent amount and confirmed transfers match opposite GBP legs.
- **Verification references:** [tests/transactions.integration.ts](../../tests/transactions.integration.ts); [tests/transaction-input.test.ts](../../tests/transaction-input.test.ts); [tests/spending-transfers.integration.ts](../../tests/spending-transfers.integration.ts).
- **Graphify navigation:** scopes `api, shared, web-components, web-routes`; query `TransactionQueries` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_ACTIVITY`.
- **Debug / reuse / limits:** Debug canonical controller/service paths, annotations and transaction projections. TransactionRevision, TransactionOverride and TransactionNote retain distinct history/shared/private roles. Native activity remains IOS5.

<a id="imports"></a>

## IMPORTS — Reviewed CSV import and lifecycle

- **Status:** `implemented`. **Purpose:** Inspect bounded CSV, map columns, review rejects/duplicates, commit via durable jobs and support rollback/restore.
- **Entry points:** [apps/web/app/imports/page.tsx](../../apps/web/app/imports/page.tsx) — `ImportsPage`; [apps/api/src/modules/imports/imports.controller.ts](../../apps/api/src/modules/imports/imports.controller.ts) — `createImportsController`; [apps/worker/src/imports/handlers.ts](../../apps/worker/src/imports/handlers.ts) — `createImportHandlers`.
- **Canonical implementation:** [apps/api/src/modules/imports/import-preview.ts](../../apps/api/src/modules/imports/import-preview.ts) — `ImportPreview`; [apps/api/src/modules/imports/import-lifecycle.ts](../../apps/api/src/modules/imports/import-lifecycle.ts) — `ImportLifecycle`; [apps/worker/src/imports/commit.ts](../../apps/worker/src/imports/commit.ts) — `commitImport`; [packages/domain/src/csv.ts](../../packages/domain/src/csv.ts) — `normalizeCsv`.
- **Depends on / reuses:** [ACCOUNTS](finance.md#accounts), [ACTIVITY](finance.md#activity), [AUTH](identity.md#auth), [CONTRACTS](platform.md#contracts), [DATABASE](platform.md#database), [DESIGN](platform.md#design), [EVENTS](platform.md#events), [HOUSEHOLD](identity.md#household), [JOBS](platform.md#jobs), [MONEY](finance.md#money), [WEB_AUTH](identity.md#web_auth).
- **Used by:** [CONNECTORS](planned.md#connectors), [EVENTS](platform.md#events), [NATIVE_FINANCE](planned.md#native_finance), [STATEMENTS](planned.md#statements).
- **Permission / data boundary:** Inspection/lifecycle actions require ownership; originals use DataVault encryption. Workers require a live matching job lease and withImportJobScope. Staging stays separate from published visibility; versions, source identity and dataset checks guard replay.
- **Verification references:** [tests/imports-api.integration.ts](../../tests/imports-api.integration.ts); [tests/imports-isolation.integration.ts](../../tests/imports-isolation.integration.ts); [tests/import-worker.integration.ts](../../tests/import-worker.integration.ts); [tests/browser/import-workspace.spec.ts](../../tests/browser/import-workspace.spec.ts).
- **Graphify navigation:** scopes `api, shared, web-components, web-routes`; query `ImportPreview` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_IMPORTS`.
- **Debug / reuse / limits:** Reuse the server parser and ImportPreview/ImportLifecycle, not a native parser. Jobs dispatch csv.preview/csv.commit/csv.restore; explicit publication follows chunk processing. Native picker/review remains IOS5. ImportDetail uses [watchStatusResource](../../apps/web/components/imports/detail.tsx) for UI subscriptions (IMPORTS depends on EVENTS). Separately, [StatusResources.read](../../apps/api/src/modules/events/status-resources.ts) delegates to ImportQueries.observe, making EVENTS a server-side consumer of IMPORTS.

<a id="spending"></a>

## SPENDING — Dashboard, budgets and monthly review

- **Status:** `implemented`. **Purpose:** Show selected-month spending and review, edit category caps and attest account-month coverage.
- **Entry points:** [apps/web/app/dashboard/page.tsx](../../apps/web/app/dashboard/page.tsx) — `Page`; [apps/web/app/budgets/page.tsx](../../apps/web/app/budgets/page.tsx) — `Page`; [apps/web/app/review/page.tsx](../../apps/web/app/review/page.tsx) — `Page`.
- **Canonical implementation:** [apps/web/components/spending/index.tsx](../../apps/web/components/spending/index.tsx) — `SpendingScreen`; [apps/web/components/spending/use-report.ts](../../apps/web/components/spending/use-report.ts) — `useSpendingReport`; [apps/api/src/modules/budgets/budget-mutations.ts](../../apps/api/src/modules/budgets/budget-mutations.ts) — `BudgetMutations`; [apps/api/src/modules/accounts/account-coverage.ts](../../apps/api/src/modules/accounts/account-coverage.ts) — `AccountCoverage`.
- **Depends on / reuses:** [ACCOUNTS](finance.md#accounts), [ACTIVITY](finance.md#activity), [AUTH](identity.md#auth), [CONTRACTS](platform.md#contracts), [DATABASE](platform.md#database), [DESIGN](platform.md#design), [HOUSEHOLD](identity.md#household), [MONEY](finance.md#money), [REPORTS](finance.md#reports), [WEB_AUTH](identity.md#web_auth).
- **Used by:** [NATIVE_FINANCE](planned.md#native_finance), [RECURRING](planned.md#recurring), [SAVINGS](planned.md#savings).
- **Permission / data boundary:** Every selected account requires TRANSACTIONS access. Budget writes resolve exact scope and optimistic versions. Coverage writes require ownership; current/future months cannot be declared complete.
- **Verification references:** [tests/spending-api.integration.ts](../../tests/spending-api.integration.ts); [tests/spending-isolation.integration.ts](../../tests/spending-isolation.integration.ts); [tests/spending-concurrency.integration.ts](../../tests/spending-concurrency.integration.ts); [tests/browser/spending-workspace-states.spec.ts](../../tests/browser/spending-workspace-states.spec.ts).
- **Graphify navigation:** scopes `api, shared, web-components, web-routes`; query `SpendingScreen` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_SPENDING`.
- **Debug / reuse / limits:** All three pages reuse SpendingScreen/useSpendingReport. Reuse BudgetMutations.put and AccountCoverage.put for revisions. REPORTS owns calculations; native parity remains IOS6 and savings/timeline extensions remain IOS10b.

<a id="reports"></a>

## REPORTS — Scoped cash-flow reports and categories

- **Status:** `implemented`. **Purpose:** Calculate booked spending, income, transfers, coverage, trends and source provenance.
- **Entry points:** [apps/api/src/modules/reports/reports.controller.ts](../../apps/api/src/modules/reports/reports.controller.ts) — `createReportsController`; [apps/web/lib/server/spending-routes.ts](../../apps/web/lib/server/spending-routes.ts) — `readSpending`.
- **Canonical implementation:** [apps/api/src/modules/reports/report.service.ts](../../apps/api/src/modules/reports/report.service.ts) — `ReportService`; [apps/api/src/modules/reports/report-scope.ts](../../apps/api/src/modules/reports/report-scope.ts) — `resolveReportScope`; [apps/api/src/modules/reports/report-components.ts](../../apps/api/src/modules/reports/report-components.ts) — `reportComponents`; [packages/domain/src/cash-flow.ts](../../packages/domain/src/cash-flow.ts) — `summariseSpending`.
- **Depends on / reuses:** [ACCOUNTS](finance.md#accounts), [ACTIVITY](finance.md#activity), [AUTH](identity.md#auth), [CONTRACTS](platform.md#contracts), [DATABASE](platform.md#database), [HOUSEHOLD](identity.md#household), [MONEY](finance.md#money).
- **Used by:** [COMPANION](planned.md#companion), [SPENDING](finance.md#spending).
- **Permission / data boundary:** One to fifty distinct selected accounts require TRANSACTIONS access. Scope, authorization and budget version are rechecked before return. Only BOOKED rows count; splits replace parents. Comparisons require complete periods.
- **Verification references:** [tests/spending-reports.integration.ts](../../tests/spending-reports.integration.ts); [tests/spending-api.integration.ts](../../tests/spending-api.integration.ts); [tests/spending-isolation.integration.ts](../../tests/spending-isolation.integration.ts).
- **Graphify navigation:** scopes `api, shared, web-components, web-routes`; query `ReportService` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_REPORTS`.
- **Debug / reuse / limits:** Debug ReportService.read and resolveReportScope; reuse reportComponents and summariseSpending. BigInt GBP arithmetic separates consumption/debt/transfers/contributions/unclassified values. CategoriesService uses the same report scope.

<a id="wealth"></a>

## WEALTH — Manual adult wealth valuation

- **Status:** `implemented`. **Purpose:** Summarize authorized adult net worth/liquid assets with source dates and explicit incomplete evidence.
- **Entry points:** [apps/api/src/modules/wealth/wealth.controller.ts](../../apps/api/src/modules/wealth/wealth.controller.ts) — `createWealthController`.
- **Canonical implementation:** [apps/api/src/modules/wealth/wealth.service.ts](../../apps/api/src/modules/wealth/wealth.service.ts) — `WealthService`; [apps/api/src/modules/wealth/wealth.repository.ts](../../apps/api/src/modules/wealth/wealth.repository.ts) — `readWealthScope`; [packages/domain/src/wealth/value-accounts.ts](../../packages/domain/src/wealth/value-accounts.ts) — `valueAccounts`; [packages/contracts/src/wealth.ts](../../packages/contracts/src/wealth.ts) — `wealthSummaryDtoSchema`.
- **Depends on / reuses:** [ACCOUNTS](finance.md#accounts), [AUTH](identity.md#auth), [CONTRACTS](platform.md#contracts), [DATABASE](platform.md#database), [HOUSEHOLD](identity.md#household), [MONEY](finance.md#money).
- **Used by:** [NATIVE_FINANCE](planned.md#native_finance), [NATIVE_HOME](finance.md#native_home).
- **Permission / data boundary:** TOTALS access, at most fifty accounts, latest named valuation and a second scope/provenance check. Missing/future/stale/unknown adult evidence remains excluded; supported evidence is at most thirty days old.
- **Verification references:** [tests/wealth-valuation.test.ts](../../tests/wealth-valuation.test.ts); [tests/wealth-api.integration.ts](../../tests/wealth-api.integration.ts); [tests/wealth-evidence.integration.ts](../../tests/wealth-evidence.integration.ts).
- **Graphify navigation:** scopes `api, shared, web-components, web-routes`; query `WealthService` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_WEALTH`.
- **Debug / reuse / limits:** Reuse WealthService.read/readWealthScope/valueAccounts. Liabilities subtract; liquid totals exclude property, pensions, liabilities and unavailable liquidity. API/domain implemented; no wealth web/native page exists in inspected routes.

<a id="goals"></a>

## GOALS — Shared adult goals and immutable history

- **Status:** `implemented`. **Purpose:** Create/update/archive shared goal metadata and retain participant-scoped history.
- **Entry points:** [apps/api/src/modules/goals/goals.controller.ts](../../apps/api/src/modules/goals/goals.controller.ts) — `createGoalsController`; [apps/api/src/modules/goals/goal-archive.controller.ts](../../apps/api/src/modules/goals/goal-archive.controller.ts) — `createGoalArchiveController`.
- **Canonical implementation:** [apps/api/src/modules/goals/goals.service.ts](../../apps/api/src/modules/goals/goals.service.ts) — `GoalService`; [apps/api/src/modules/goals/goal-queries.ts](../../apps/api/src/modules/goals/goal-queries.ts) — `readGoal`; [packages/database/prisma/migrations/20261026002400_allocation_lifecycle/migration.sql](../../packages/database/prisma/migrations/20261026002400_allocation_lifecycle/migration.sql) — `app.write_goal`; [packages/database/prisma/schema.prisma](../../packages/database/prisma/schema.prisma) — `GoalParticipant`.
- **Depends on / reuses:** [ARCHIVE](platform.md#archive), [AUTH](identity.md#auth), [CONTRACTS](platform.md#contracts), [DATABASE](platform.md#database), [HOUSEHOLD](identity.md#household), [MONEY](finance.md#money).
- **Used by:** [ALLOCATIONS](finance.md#allocations), [CHILDREN](planned.md#children), [CONTRIBUTIONS](finance.md#contributions), [NATIVE_FINANCE](planned.md#native_finance), [PROJECTIONS](finance.md#projections).
- **Permission / data boundary:** SQL snapshots active participants, enforces household/participant authority and freezes exit revision ceilings. Later membership does not grant past participation. Exports require fresh MFA, independently of entitlements.
- **Verification references:** [tests/goal-service.test.ts](../../tests/goal-service.test.ts); [tests/goals-http.integration.ts](../../tests/goals-http.integration.ts); [tests/goal-lifecycle.integration.ts](../../tests/goal-lifecycle.integration.ts); [tests/goal-deletion.integration.ts](../../tests/goal-deletion.integration.ts).
- **Graphify navigation:** scopes `api, shared, web-components, web-routes`; query `GoalService` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_GOALS`.
- **Debug / reuse / limits:** Reuse GoalService and current app.write_goal SQL wrappers. Archiving releases allocations atomically; goal metadata changes also create contribution revisions through SQL triggers. API/history implemented; no goal editor page/native screen exists.

<a id="funding"></a>

## FUNDING — Owner settlement evidence and bill reserves

- **Status:** `implemented`. **Purpose:** Attest immutable settled adult money/reserves against a named valuation and retain scoped history.
- **Entry points:** [apps/api/src/modules/funding-evidence/funding-evidence.controller.ts](../../apps/api/src/modules/funding-evidence/funding-evidence.controller.ts) — `createFundingEvidenceController`; [apps/api/src/modules/funding-evidence/funding-archive.controller.ts](../../apps/api/src/modules/funding-evidence/funding-archive.controller.ts) — `createFundingArchiveController`.
- **Canonical implementation:** [apps/api/src/modules/funding-evidence/funding-evidence.service.ts](../../apps/api/src/modules/funding-evidence/funding-evidence.service.ts) — `FundingEvidenceService`; [packages/database/prisma/migrations/20261023082000_owner_funding_evidence/migration.sql](../../packages/database/prisma/migrations/20261023082000_owner_funding_evidence/migration.sql) — `app.write_funding_evidence`; [packages/domain/src/goals/funding-source.ts](../../packages/domain/src/goals/funding-source.ts) — `assessFundingSource`; [packages/database/prisma/schema.prisma](../../packages/database/prisma/schema.prisma) — `FundingEvidence`.
- **Depends on / reuses:** [ACCOUNTS](finance.md#accounts), [ARCHIVE](platform.md#archive), [AUTH](identity.md#auth), [CONTRACTS](platform.md#contracts), [DATABASE](platform.md#database), [HOUSEHOLD](identity.md#household), [MONEY](finance.md#money).
- **Used by:** [ALLOCATIONS](finance.md#allocations), [NATIVE_FINANCE](planned.md#native_finance).
- **Permission / data boundary:** Ownership is required; shared TOTALS/TRANSACTIONS grants do not suffice. SQL requires eligible complete manual GBP adult valuation and current evidence. Settled money cannot exceed adult value; archives respect fundingCutoffVersion.
- **Verification references:** [tests/funding-evidence-service.test.ts](../../tests/funding-evidence-service.test.ts); [tests/funding-evidence-http.integration.ts](../../tests/funding-evidence-http.integration.ts); [tests/funding-evidence-locks.integration.ts](../../tests/funding-evidence-locks.integration.ts).
- **Graphify navigation:** scopes `api, shared, web-components, web-routes`; query `FundingEvidenceService` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_FUNDING`.
- **Debug / reuse / limits:** Debug FundingEvidenceService.write and app.write_funding_evidence/guard_funding_evidence. Allocation calculations use settled funds minus reserves. Exports require fresh MFA. No funding UI exists in inspected web/native routes. NATIVE_FINANCE is a planned IOS10a consumer of this existing API; no native funding screen is implemented.

<a id="allocations"></a>

## ALLOCATIONS — Owner-controlled goal allocation intentions

- **Status:** `implemented`. **Purpose:** Replace fixed/fractional intentions from selected funding accounts to a shared goal while retaining source history.
- **Entry points:** [apps/api/src/modules/goals/allocations/allocation.controller.ts](../../apps/api/src/modules/goals/allocations/allocation.controller.ts) — `createAllocationController`; [apps/api/src/modules/goals/allocations/allocation-archive.controller.ts](../../apps/api/src/modules/goals/allocations/allocation-archive.controller.ts) — `createAllocationArchiveController`.
- **Canonical implementation:** [apps/api/src/modules/goals/allocations/allocation.service.ts](../../apps/api/src/modules/goals/allocations/allocation.service.ts) — `GoalAllocationService`; [apps/api/src/modules/goals/allocations/allocation-queries.ts](../../apps/api/src/modules/goals/allocations/allocation-queries.ts) — `canonicalAllocationWrite`; [packages/domain/src/goals/allocations.ts](../../packages/domain/src/goals/allocations.ts) — `assessAllocationChange`; [packages/database/prisma/migrations/20261026002300_allocation_writes/migration.sql](../../packages/database/prisma/migrations/20261026002300_allocation_writes/migration.sql) — `app.write_goal_allocations`.
- **Depends on / reuses:** [ACCOUNTS](finance.md#accounts), [ARCHIVE](platform.md#archive), [AUTH](identity.md#auth), [CONTRACTS](platform.md#contracts), [DATABASE](platform.md#database), [EVENTS](platform.md#events), [FUNDING](finance.md#funding), [GOALS](finance.md#goals), [HOUSEHOLD](identity.md#household), [MONEY](finance.md#money).
- **Used by:** [NATIVE_FINANCE](planned.md#native_finance), [SAVINGS](planned.md#savings).
- **Permission / data boundary:** Authorize the complete owned account set before assessment; require goal participation and ordered locks. Goal/source versions guard writes; archive/export fences remain. Intentions never move money.
- **Verification references:** [tests/goal-allocations.test.ts](../../tests/goal-allocations.test.ts); [tests/goal-allocation-http.integration.ts](../../tests/goal-allocation-http.integration.ts); [tests/goal-allocation-locks.integration.ts](../../tests/goal-allocation-locks.integration.ts); [tests/goal-allocation-events.integration.ts](../../tests/goal-allocation-events.integration.ts).
- **Graphify navigation:** scopes `api, shared, web-components, web-routes`; query `GoalAllocationService` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_ALLOCATIONS`.
- **Debug / reuse / limits:** Reuse GoalAllocationService.write and app.write_goal_allocations. Pure assessAllocationChange is separately tested; the API does not call it. Archival/lost control releases intentions. Revision commits emit empty hints, but no allocation status selector or UI exists. NATIVE_FINANCE is a planned IOS10a consumer of the existing atomic allocation API.

<a id="contributions"></a>

## CONTRIBUTIONS — Confirmed dated contribution capacity and goal plans

- **Status:** `implemented`. **Purpose:** Save shared capacity and per-goal schedules; assess priority-ordered funding and shortfall over the confirmed calendar.
- **Entry points:** [apps/api/src/modules/goals/contributions/contribution-budget.controller.ts](../../apps/api/src/modules/goals/contributions/contribution-budget.controller.ts) — `createContributionBudgetController`; [apps/api/src/modules/goals/contributions/contribution-plan.controller.ts](../../apps/api/src/modules/goals/contributions/contribution-plan.controller.ts) — `createContributionPlanController`.
- **Canonical implementation:** [apps/api/src/modules/goals/contributions/contribution.service.ts](../../apps/api/src/modules/goals/contributions/contribution.service.ts) — `ContributionService`; [apps/api/src/modules/goals/contributions/contribution-writes.ts](../../apps/api/src/modules/goals/contributions/contribution-writes.ts) — `ContributionWrites`; [apps/api/src/modules/goals/contributions/contribution-queries.ts](../../apps/api/src/modules/goals/contributions/contribution-queries.ts) — `contributionView`; [packages/domain/src/goals/dated-contributions.ts](../../packages/domain/src/goals/dated-contributions.ts) — `assessDatedContributions`.
- **Depends on / reuses:** [ARCHIVE](platform.md#archive), [AUTH](identity.md#auth), [CONTRACTS](platform.md#contracts), [DATABASE](platform.md#database), [EVENTS](platform.md#events), [GOALS](finance.md#goals), [HOUSEHOLD](identity.md#household), [MONEY](finance.md#money).
- **Used by:** [NATIVE_FINANCE](planned.md#native_finance).
- **Permission / data boundary:** SQL snapshots participants and guards capacity/budget/goal/plan versions. Authorization occurs before replay and return. Exit freezes cutoffVersion; later members do not inherit a captured budget. Exports require fresh MFA.
- **Verification references:** [tests/dated-contributions.test.ts](../../tests/dated-contributions.test.ts); [tests/contribution-http.integration.ts](../../tests/contribution-http.integration.ts); [tests/contribution-lifecycle.integration.ts](../../tests/contribution-lifecycle.integration.ts); [tests/contribution-events.integration.ts](../../tests/contribution-events.integration.ts).
- **Graphify navigation:** scopes `api, shared, web-components, web-routes`; query `ContributionService` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_CONTRIBUTIONS`.
- **Debug / reuse / limits:** Debug ContributionService/ContributionWrites and current SQL write functions. contributionView uses assessDatedContributions and assessContributionBudget. Saved priorities use canonical UUID ties. Proposed intentions are not observed contributions or transfers. Commit hints exist; no public selector or UI exists. NATIVE_FINANCE is a planned IOS10a consumer of the existing dated contribution APIs.

<a id="money"></a>

## MONEY — Exact GBP money boundaries and arithmetic

- **Status:** `implemented`. **Purpose:** Validate minor-unit strings and convert, format and aggregate without floating-point amount arithmetic.
- **Entry points:** [packages/contracts/src/accounts.ts](../../packages/contracts/src/accounts.ts) — `moneySchema`; [packages/domain/src/index.ts](../../packages/domain/src/index.ts) — `parseMoneyInput`.
- **Canonical implementation:** [packages/domain/src/index.ts](../../packages/domain/src/index.ts) — `formatMoney`; [packages/contracts/src/reporting-primitives.ts](../../packages/contracts/src/reporting-primitives.ts) — `aggregateMoneySchema`; [packages/domain/src/cash-flow.ts](../../packages/domain/src/cash-flow.ts) — `formatGbpMinor`; [packages/domain/src/transaction-normalisation.ts](../../packages/domain/src/transaction-normalisation.ts) — `checkedMoney`.
- **Depends on / reuses:** [CONTRACTS](platform.md#contracts).
- **Used by:** [ACCOUNTS](finance.md#accounts), [ACTIVITY](finance.md#activity), [ALLOCATIONS](finance.md#allocations), [CONTRIBUTIONS](finance.md#contributions), [EXPORTS](platform.md#exports), [FUNDING](finance.md#funding), [GOALS](finance.md#goals), [IMPORTS](finance.md#imports), [PROJECTIONS](finance.md#projections), [REPORTS](finance.md#reports), [SPENDING](finance.md#spending), [STATEMENTS](planned.md#statements), [WEALTH](finance.md#wealth), [NATIVE_HOME](finance.md#native_home), [NATIVE_ACCOUNTS](finance.md#native_accounts).
- **Permission / data boundary:** Money is a strict GBP object with canonical signed int64 amountMinor text. Decimal input allows at most two places without rounding/locale guessing. Computed aggregate totals have a separate boundary.
- **Verification references:** [tests/money.test.ts](../../tests/money.test.ts); [tests/transaction-input.test.ts](../../tests/transaction-input.test.ts); [tests/wealth-valuation.test.ts](../../tests/wealth-valuation.test.ts).
- **Graphify navigation:** scopes `api, shared, web-components, web-routes`; query `formatMoney` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_MONEY`.
- **Debug / reuse / limits:** Reuse moneySchema, parseMoneyInput and formatMoney; cash flow/wealth/allocation/contribution logic uses exact integers. Projection DTO reuse does not establish an implemented projection engine.

<a id="projections"></a>

## PROJECTIONS — Projection contracts and storage foundation

- **Status:** `partial`. **Purpose:** Define validated projection inputs/results and immutable scenario/run/source storage shapes.
- **Entry points:** [packages/projections/src/index.ts](../../packages/projections/src/index.ts) — `ProjectionInputV1`; [packages/contracts/src/projections.ts](../../packages/contracts/src/projections.ts) — `projectionInputV1Schema`.
- **Canonical implementation:** [packages/contracts/src/projections.ts](../../packages/contracts/src/projections.ts) — `projectionResultV1Schema`; [packages/contracts/src/projections.ts](../../packages/contracts/src/projections.ts) — `projectionRunDtoSchema`; [packages/contracts/src/projection-primitives.ts](../../packages/contracts/src/projection-primitives.ts) — `monthEndAtOffset`; [packages/database/prisma/schema.prisma](../../packages/database/prisma/schema.prisma) — `ProjectionRun`.
- **Depends on / reuses:** [ACCOUNTS](finance.md#accounts), [CONTRACTS](platform.md#contracts), [DATABASE](platform.md#database), [ENTITLEMENTS](platform.md#entitlements), [GOALS](finance.md#goals), [MONEY](finance.md#money).
- **Used by:** [NATIVE_FINANCE](planned.md#native_finance), [REHEARSAL](planned.md#rehearsal), [SAVINGS](planned.md#savings).
- **Permission / data boundary:** DTOs constrain strict inputs, month-end calendars, one-to-six-hundred-month horizons, bounded rates and run/input consistency. Models reference household goals and named valuations. No operational projection authorization path is established.
- **Verification references:** [tests/wealth-goal-contracts.test.ts](../../tests/wealth-goal-contracts.test.ts); [tests/wealth-goal-storage.integration.ts](../../tests/wealth-goal-storage.integration.ts).
- **Graphify navigation:** scopes `api, shared, web-components, web-routes`; query `projectionResultV1Schema` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_PROJECTIONS`.
- **Debug / reuse / limits:** packages/projections exports types only. No executable engine, registered projection controller or projection UI exists in inspected source. Dependencies describe schemas/models, not a running calculation flow. IOS8/9/10a remain planned. NATIVE_FINANCE is a planned IOS10a consumer after the IOS8/9 engine/API gates; this foundation remains partial.

<a id="native_home"></a>

## NATIVE_HOME — Native scoped household overview

- **Status:** `planned`. **Purpose:** Present server-authorized adult valuation totals with explicit scope, freshness, exclusions and real account navigation.
- **Entry points:** [IOS4 plan](../../docs/superpowers/plans/2026-11-04-ios4-home-accounts.md) — `Task 3 — Native Home, account reads and real navigation`.
- **Canonical implementation:** [IOS4 plan](../../docs/superpowers/plans/2026-11-04-ios4-home-accounts.md) — `IOS4 Home and accounts implementation plan`. Native screens/hooks are not implemented yet; existing WealthService and NativeResourceController are intended reuse points.
- **Depends on / reuses:** [CONTRACTS](platform.md#contracts), [DESIGN](platform.md#design), [EVENTS](platform.md#events), [MONEY](finance.md#money), [NATIVE_ACCOUNTS](finance.md#native_accounts), [NATIVE_API](identity.md#native_api), [NATIVE_AUTH](identity.md#native_auth), [WEALTH](finance.md#wealth).
- **Used by:** [NATIVE_FINANCE](planned.md#native_finance).
- **Permission / data boundary:** Planned views require the complete verified native identity gate and current membership/grant scope. Summary scopes above 50 require explicit selection of 1–50 visible accounts. Unknown/stale/non-GBP/adult-portion evidence is labelled, never converted or invented.
- **Verification references:** Planned IOS4 cases cover scope loss, outside-page changes, date expiry, empty/partial evidence, beyond-int64 totals and native accessibility. Existing foundation evidence: [tests/wealth-valuation.test.ts](../../tests/wealth-valuation.test.ts); [tests/wealth-api.integration.ts](../../tests/wealth-api.integration.ts); [tests/native-resource.test.ts](../../tests/native-resource.test.ts). These do not establish a native Home screen.
- **Graphify navigation:** node `feature_NATIVE_HOME`; follow WEALTH/NATIVE_API and the plan until real screen/source nodes exist.
- **Debug / reuse / limits:** Reuse WealthService rather than phone-side totals. formatAggregateMoney supports wider aggregates; formatMoney alone is int64-bounded. The current account-page selector cannot cover whole-summary changes or London-date expiry; IOS4 plans a narrow wealth observation/deadline. Spending/savings/activity additions remain later ordered units.

<a id="native_accounts"></a>

## NATIVE_ACCOUNTS — Native accounts, owner valuations and sharing

- **Status:** `planned`. **Purpose:** Deliver permission-scoped account lists/details and deliberate owner create/edit/valuation/sharing flows.
- **Entry points:** [IOS4 plan](../../docs/superpowers/plans/2026-11-04-ios4-home-accounts.md) — `Task 4 — Account writes and actual native acceptance`.
- **Canonical implementation:** [IOS4 plan](../../docs/superpowers/plans/2026-11-04-ios4-home-accounts.md) — `IOS4 Home and accounts implementation plan`. Native UI is not implemented yet; createAccountsApi and canonical account services already supply the core behavior.
- **Depends on / reuses:** [ACCOUNTS](finance.md#accounts), [CONTRACTS](platform.md#contracts), [DESIGN](platform.md#design), [EVENTS](platform.md#events), [HOUSEHOLD](identity.md#household), [MONEY](finance.md#money), [NATIVE_API](identity.md#native_api), [NATIVE_AUTH](identity.md#native_auth).
- **Used by:** [NATIVE_FINANCE](planned.md#native_finance), [NATIVE_HOME](finance.md#native_home).
- **Permission / data boundary:** Planned owner actions preserve account/grant optimistic versions, actual MFA freshness and immutable idempotency inputs. Partner target comes from the authorized account response, never inferred membership counts. Scope loss conceals data, aborts work and prevents old intentions reaching another actor.
- **Verification references:** Planned IOS4 source/native tests will cover all grant levels, stale/uncertain writes, blur/background, paging, adult-portion attestation and enlarged text/VoiceOver. Existing foundations: [tests/native-accounts-api.test.ts](../../tests/native-accounts-api.test.ts); [tests/accounts-isolation.integration.ts](../../tests/accounts-isolation.integration.ts); [tests/account-permissions.test.ts](../../tests/account-permissions.test.ts). These do not establish native account UI.
- **Graphify navigation:** node `feature_NATIVE_ACCOUNTS`; follow ACCOUNTS/NATIVE_API/NATIVE_AUTH and the IOS4 plan before adding any duplicate adapter or form.
- **Debug / reuse / limits:** Accounts remain nested in Home; More preserves existing household/security/invitation flows. Planned 50-row live FlatList pages replace their data on page changes; old loaded pages are not kept stale under a different subscription. Native valuation adapter and guarded financial routes still need implementation. Full transaction UI remains IOS5.
