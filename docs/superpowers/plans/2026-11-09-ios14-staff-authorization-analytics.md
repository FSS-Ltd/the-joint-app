# Design Document: IOS14 Staff Authorization and Minimal Analytics Collection

Date: 9 November 2026
Status: Proposed (Implementation in Progress)
Delivery Unit: IOS14

## Problem Statement

The platform requires an audited internal administration boundary to compute commercial health indicators (paying households, Monthly Recurring Revenue, refunds, churn, user activation, user turnover, and cohort retention) without compromising privacy. Household finance details (such as account numbers, bank balances, transaction descriptions, import contents, user prompts, or household financial evidence) must never reach staff or internal analytics.

Staff access must be strictly separated from household membership or purchaser authority. Standard adults, household admins, and purchasers must be denied staff access by default. In addition, raw analytics events must use opaque identifiers, exclude test and sandbox data from production calculations, handle denominator-zero scenarios deterministically, and enforce server-side suppression for any cohort cell with fewer than five subjects.

## Architecture Approach and Key Decisions

### 1. Isolated Staff Role and Least-Privilege Authority

Staff authorization is decoupled from household memberships and client claims:

- A dedicated `StaffMember` entity records explicit staff privileges (`ANALYTICS_VIEWER`, `STAFF_ADMIN`).
- Household membership, purchaser status, email domains, and client tokens never confer staff privileges.
- Every staff request checks revocation status against the database in real time.
- All staff reads and administrative actions generate immutable audit log entries in `StaffAudit`.
- Rejection of regular adult/purchaser access returns `403 Forbidden` with no leakage of staff endpoints or data models.

### 2. First-Party Lifecycle and Billing Event Contracts

Analytics contracts in `@joint/contracts` define versioned events with opaque identifiers:

- `opaqueSubjectId`: SHA-256 HMAC of the internal ID with a server secret, preventing linkability to user or household records.
- Events carry no financial amounts other than contracted recurring tier price and refund minor units.
- Events strictly prohibit bank names, account numbers, merchants, category names, notes, and prompts.
- Event types:
  - `USER_REGISTERED`: User account created.
  - `USER_ACTIVATED`: First successful manual record or import completed after registration.
  - `USER_DEACTIVATED`: User account suspended or deactivated.
  - `USER_DELETED`: User account permanently deleted.
  - `SUBSCRIPTION_STARTED`: First paid subscription activated.
  - `SUBSCRIPTION_RENEWED`: Periodic subscription renewal.
  - `SUBSCRIPTION_CANCELLED`: Subscription set to cancel at period end.
  - `SUBSCRIPTION_EXPIRED`: Paid access terminated.
  - `REFUND_ISSUED`: Bounded refund event with minor units and currency.
  - `QUALIFYING_ACTIVITY`: User performed an authenticated financial action during a calendar week.

### 3. Metric Definitions and Calculation Engine

All metrics are calculated via a pure, deterministic engine (`AnalyticsMetricsEngine`) verifying the following definitions:

1. **Active Paid Households at Period End**:
   Count of distinct opaque households holding an active paid subscription on the period end date. Sandbox and test accounts are strictly excluded.

2. **Monthly Recurring Revenue (MRR)**:
   Monthly equivalent of actual contracted recurring price after recurring discounts, excluding tax.
   - Monthly plans: 100% of monthly tier price.
   - Annual plans: Tier price divided by 12.
   - Temporary promotional discounts are separated with their effective date boundaries.

3. **Refunds and Net Collected Revenue**:
   Reported separately from MRR.
   - Gross collected: Total subscription payments collected during the period.
   - Total refunds: Total refunded minor units during the period (including late refunds).
   - Net collected revenue = Gross collected - Total refunds.

4. **Paying-Household Churn**:
   `(start-of-period paid households losing paid access during period) / (paid households at period start)`.
   If the denominator is zero, `denominatorZero: true` is returned and churn rate is `0.0`.

5. **Activation Rate**:
   `(users activated within period) / (users registered within period)`.
   Zero denominator handled safely.

6. **User Turnover**:
   `(deletions during period among the starting active registered-user cohort) / (active registered users at period start)`.
   Users who registered after the period start are excluded from both numerator and denominator.
   Distinctly separated from inactivity and paid household churn. Zero denominator handled safely.

7. **Retention Cohorts**:
   Signup cohort by calendar week (ISO 8601), tracked over subsequent activity weeks (Week 0, Week 1, Week 2, ...).
   - Server-side cell suppression: Any cohort cell with fewer than 5 active users is suppressed (`suppressed: true`, active count and percentage omitted).
   - Clients never receive the underlying count of suppressed cells.
   - Overlapping filters and query ranges are bounded to prevent differential reconstruction of small groups.

## Data Model and Schema

### Prisma Schema Updates (`packages/database/prisma/schema.prisma`)

```prisma
enum StaffRole {
  ANALYTICS_VIEWER
  STAFF_ADMIN
  @@schema("app")
}

model StaffMember {
  id String @id @default(uuid()) @db.Uuid
  userId String @db.Uuid
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role StaffRole @default(ANALYTICS_VIEWER)
  grantedByUserId String? @db.Uuid
  revokedAt DateTime? @db.Timestamptz(3)
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  auditEvents StaffAudit[]

  @@unique([userId, role])
  @@index([userId, revokedAt])
  @@schema("app")
}

model StaffAudit {
  id BigInt @id @default(autoincrement())
  staffMemberId String @db.Uuid
  staffMember StaffMember @relation(fields: [staffMemberId], references: [id], onDelete: Cascade)
  userId String @db.Uuid
  action String @db.VarChar(120)
  targetResource String? @db.VarChar(120)
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  @@index([userId, createdAt])
  @@index([staffMemberId, createdAt])
  @@schema("app")
}

model AnalyticsLifecycleEvent {
  id String @id @default(uuid()) @db.Uuid
  eventId String @unique @db.VarChar(120)
  eventType String @db.VarChar(80)
  eventVersion Int @default(1)
  opaqueSubjectId String @db.VarChar(64)
  subjectType String @db.VarChar(20)
  occurredAt DateTime @db.Timestamptz(3)
  isSandbox Boolean @default(false)
  isTestAccount Boolean @default(false)
  payload Json
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  @@index([eventType, occurredAt])
  @@index([opaqueSubjectId, occurredAt])
  @@index([isSandbox, isTestAccount, occurredAt])
  @@schema("app")
}
```

## Failure Modes and Resilience

1. **Stale or Revoked Staff Credential**:
   The staff authorization guard checks the `StaffMember` record for `revokedAt === null` on every query. If revoked, it immediately terminates with `403 Forbidden`.
2. **Missing or Corrupted Analytics Payload**:
   The ingestion service validates incoming payloads against Zod schemas. Any invalid or sensitive attributes (e.g. unexpected financial keys) cause immediate rejection.
3. **Replay and Duplicate Events**:
   Events are deduplicated on `eventId` via unique constraints, ensuring idempotent processing.
4. **Denominator Zero**:
   Every division operation checks for zero denominators and returns explicit indicators without crashing or producing `NaN` / `Infinity`.
5. **Differential Privacy Reconstruction**:
   Cells with `< 5` subjects are masked on the server. Filter ranges are strictly enforced to avoid adjacent set differencing.

## Security, Privacy, and Data Residency

- **Data Flow and Residency**: Data is stored and processed exclusively in UK / EU regions (London).
- **No Third-Party Analytics Trackers**: No third-party analytics scripts or external collectors are used.
- **Data Minimization**: Zero banking, transaction, or user-generated text payloads in analytics tables.
- **Retention Boundary**: Raw lifecycle events have a 90-day retention horizon; aggregate summaries are stored without subject linkability.
- **Production Legal-Basis Gate**: Internal reporting is grounded in Legitimate Interest (GDPR Art. 6(1)(f)) for aggregate business metrics, strictly guarded against individual behavioral surveillance.

## Success Criteria

1. Staff endpoints reject standard authenticated users, household admins, and purchasers (`403 Forbidden`).
2. Revoked staff members are denied immediately upon revocation.
3. Metric engine matches all pinned formulas across unit tests with synthetic fixtures.
4. Zero denominators in churn, turnover, and activation return zero rates and explicit flags.
5. Cohort cells with counts under 5 are suppressed server-side.
6. Sandbox and test account transactions are excluded from commercial aggregates.
7. Full monorepo verification passes: format, lint, typecheck, tests, and iOS native bundle.
