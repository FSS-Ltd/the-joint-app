# Design Document: IOS15 Staff Revenue, Churn and Retention Dashboard

## 1. Problem Statement

Staff operators and commercial leadership require access to core subscription business metrics, revenue figures, paying-household churn, activation rates, user turnover, and retention cohorts to monitor the financial health and retention dynamics of The Family Fund App.

Security, privacy, and data boundary requirements:

- Regular household members, adults, and purchasers must be strictly denied access. Accessing `/staff` or the staff API routes without active staff authority must result in an immediate `403 Forbidden` response and an accessible refusal screen.
- Server-side differential privacy cell suppression (< 5 threshold) must be preserved in UI rendering. Suppressed cells must never leak underlying participant counts. The client interface must render suppressed cells with explicit privacy notices.
- Household financial details (bank balances, account numbers, sort codes, merchants, descriptions, and user prompts) must remain inaccessible. The staff dashboard operates purely on aggregate commercial analytics.
- Data freshness must be transparently indicated with an explicit timestamp (`"Generated at: YYYY-MM-DD HH:mm:ss"`). Unbounded background polling is prohibited.

## 2. Architecture Approach and Key Decisions

### 2.1 Web BFF Routing and Upstream Gateway

1. **Upstream Path Allowlist (`apps/web/lib/server/upstream.ts`)**:
   - Extend `Path` type and `allowedPath` regular expression to permit:
     - `/v1/staff/analytics/metrics`
     - `/v1/staff/analytics/retention-cohorts`
   - Ensure query parameters (`startDate`, `endDate`, `timezone`, `maxCohorts`) are safely forwarded.

2. **Web BFF Route Handlers**:
   - `apps/web/app/api/staff/metrics/route.ts`:
     - Validates incoming query parameters against `staffPeriodQuerySchema`.
     - Extracts the authenticated user's session token using `sessionAuthorization(req)`.
     - Forwards request upstream to `/v1/staff/analytics/metrics`.
     - Maps `401 Unauthorized` and `403 Forbidden` with informative, safe JSON errors.
   - `apps/web/app/api/staff/retention-cohorts/route.ts`:
     - Validates incoming query parameters against `retentionCohortQuerySchema`.
     - Forwards request upstream to `/v1/staff/analytics/retention-cohorts`.
     - Returns `StaffRetentionCohortsResponse`.

### 2.2 Dashboard Component Architecture (`apps/web/components/staff/`)

In alignment with Design Craft principles and repository structure:

- `apps/web/app/staff/page.tsx`: Thin Next.js page route rendering `<StaffDashboardScreen />`.
- `apps/web/components/staff/index.tsx`: Main dashboard screen coordinating auth status, period filters, and data fetching.
- `apps/web/components/staff/staff-metrics-cards.tsx`: Metric presentation cards displaying:
  - Monthly Recurring Revenue (MRR) formatted in GBP (`£X.XX`).
  - Active Paid Households count.
  - Gross Collected Revenue, Refunds, and Net Collected Revenue.
  - Paying Household Churn Rate with explicit denominator zero handling (`"N/A (0 active at start)"` when `denominatorZero: true`).
  - Activation Rate and User Turnover Rate with explicit denominator indicators.
- `apps/web/components/staff/staff-cohort-table.tsx`: Retention cohorts matrix:
  - Renders ISO cohort weeks (e.g., `2026-W40`).
  - Renders cohort size or `"< 5 (suppressed)"` badge if cohort size is suppressed.
  - Renders weekly active retention cells (Week 0 to Week N).
  - Explicitly flags suppressed cells without showing zero or raw numbers.
  - Implements responsive table layout with horizontal scrolling and semantic table headers (`scope="col"`, `scope="row"`).
- `apps/web/components/staff/staff-filters.tsx`: Timezone and period range selector with standard presets (`Month to Date`, `Prior Month`, `Trailing 30 Days`).
- `apps/web/components/staff/staff-client.ts`: Dedicated typed client for staff BFF routes.
- `apps/web/components/staff/staff.css`: Purpose-built CSS reusing repository design tokens (`--ink`, `--surface`, `--canvas`, `--primary`, `--sage`, `--border`, `--focus`, `--error`, `--panel-glass`).

### 2.3 Interaction and Accessible States

- **Loading State:** Skeleton cards and loading indicator for table rows with `aria-busy="true"`.
- **Refusal / Access Denied State:** Rendered when API returns `403 Forbidden`. Explains that explicit staff authority is required without exposing metric details.
- **Unauthenticated State:** Redirects to `/sign-in` when no active session is detected.
- **Empty State:** Displayed when no analytics events have occurred in the selected period.
- **Error State:** Retryable error banner with descriptive message and manual retry button.

## 3. Data Model and Contracts

Reuses verified schemas from `@joint/contracts`:

- `StaffRole`: `"ANALYTICS_VIEWER" | "STAFF_ADMIN"`.
- `StaffPeriodQuery`: `startDate`, `endDate`, `timezone`.
- `RetentionCohortQuery`: `maxCohorts`.
- `StaffMetricsSummaryResponse`:
  - `activePaidHouseholds`: `number`
  - `mrrMinor`: `number`
  - `grossCollectedMinor`: `number`
  - `refundsMinor`: `number`
  - `netCollectedMinor`: `number`
  - `churn`: `ChurnMetric` (`rate`, `lostHouseholds`, `startingHouseholds`, `denominatorZero`)
  - `activation`: `ActivationMetric` (`rate`, `activatedUsers`, `registeredUsers`, `denominatorZero`)
  - `turnover`: `TurnoverMetric` (`rate`, `departedUsers`, `startingUsers`, `denominatorZero`)
- `StaffRetentionCohortsResponse`:
  - `suppressionThreshold`: `5`
  - `cohorts`: `RetentionCohortRow[]`
  - `generatedAt`: `string`

## 4. Failure Modes and Resilience

1. **Unauthorized Direct URL Access**:
   - Both page and API routes inspect actor authority. Non-staff users receive HTTP 403.
2. **Missing Source Data**:
   - Empty periods return zero counts and clean empty states without rendering `NaN` or crashing.
3. **Complementary Arithmetic and Reconstruction**:
   - Client never receives raw values of suppressed cells (< 5).
   - Suppressed cells render `"Suppressed (< 5)"` with privacy tooltip, preventing estimation.
4. **Network and Gateway Timeouts**:
   - Fetch client handles network errors gracefully with retry capabilities.
5. **No Infinite Background Polling**:
   - Refreshes happen strictly via manual "Refresh" trigger or filter change.

## 5. Security and Privacy Boundaries

- Least-privilege staff roles: `ANALYTICS_VIEWER` can view metrics; `STAFF_ADMIN` can view metrics and ingest events.
- Audit trail: Upstream API records access actions in `StaffAudit`.
- No finance drill-down: Staff dashboard has zero linkage to bank balances, account numbers, or personal transaction logs.
- Server-side cell suppression is absolute: underlying numbers are stripped before JSON serialization.

## 6. Rollout and Rollback Plan

- **Rollout:** Merged to `main` via PR after full verification and independent Code and AppSec reviews.
- **Rollback:** Safe git revert of delivery unit IOS15 without impact on banking or companion services.

## 7. Success Criteria and Verification Plan

1. **Unit and Integration Tests (`tests/staff-dashboard.test.ts`)**:
   - Direct API route authentication and authorization (401 without session, 403 for non-staff).
   - Staff BFF routes forwarding query parameters and auth headers accurately.
   - Metrics cards formatting currencies, percentages, and denominator zero states.
   - Retention cohort table rendering unsuppressed cells and suppressing cells < 5.
   - Access denied view rendering on 403 responses.
   - Absence of polling interval or automatic timers.
2. **Monorepo Checks**:
   - `pnpm lint`: Clean.
   - `pnpm typecheck`: Clean across all packages.
   - `pnpm --filter @joint/mobile bundle:ios`: Clean.
   - `pnpm --filter @joint/web build`: Clean Next.js production build.
3. **Independent Specialist Reviews**:
   - Code Reviewer approval.
   - AppSec Reviewer approval.
