# Design Document: IOS11: Normalized Billing Lifecycle and Web Subscriptions

## 1. Problem Statement

Joint household financial planning requires access gating for advanced capabilities (automated bank and broker sync, advanced multi-scenario projections, automated rules, and companion insights) while permanently protecting free access to manual budgeting, record keeping, and privacy controls.

Requirements for step IOS11:

1. Server-authoritative billing normalization across providers (Stripe for web subscriptions, RevenueCat for mobile and app stores).
2. Signature verification, sandbox and production separation, idempotency against replay or out-of-order events, and immutable purchaser-household binding.
3. Accurate lifecycle transitions (active, trialing, billing grace period, past due, canceled auto-renewal, refund, and expiration).
4. Prevention of double-counting: duplicate subscriptions or multiple payment sources within one household must never stack resource caps or multiply quotas.
5. Strict fulfillment isolation: checkout redirects or client callbacks must never grant entitlement access directly. Entitlements must derive exclusively from verified server webhooks.
6. Downgrade safety: subscription expiration returns the household to Free while fully preserving transaction history, budgets, manual goals, and privacy settings.

## 2. Architecture Approach and Key Decisions

### A. Provider Normalization Layer (`@joint/contracts` and `@joint/entitlements`)

- Inbound webhooks from Stripe and RevenueCat are validated and converted into a common `NormalizedSubscriptionEvent` format.
- Normalized events encapsulate:
  - `eventId`: unique provider event identifier.
  - `provider`: `STRIPE` or `REVENUECAT`.
  - `environment`: `SANDBOX` or `PRODUCTION`.
  - `eventType`: `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `REFUND`, `PRODUCT_CHANGE`.
  - `externalCustomerId`: provider customer identifier.
  - `externalSubscriptionId`: provider subscription identifier.
  - `purchaserUserId`: authenticated user ID initiating the purchase.
  - `householdId`: household receiving the entitlement.
  - `interval`: `MONTHLY` or `ANNUAL`.
  - `effectiveFrom`: timestamp when entitlement begins.
  - `effectiveUntil`: paid-through timestamp or grace period end.
  - `graceUntil`: optional grace period expiration timestamp.
  - `cancelAtPeriodEnd`: boolean flag indicating renewal termination.

### B. Pure Billing State Reducer (`billing-reducer.ts`)

- Pure state machine function: `reduceSubscriptionState(currentState, event, now)`.
- Enforces strict rules:
  1. Sandbox and production isolation: sandbox events are rejected in production contexts to prevent fraudulent grants.
  2. Out-of-order and replay protection: events with timestamps equal to or older than the subscription's `lastEventAt` are ignored idempotently.
  3. Immutable purchaser-household binding: once a subscription ID is registered to a `householdId`, incoming events for that subscription ID cannot rebind to a different household.
  4. Cap conservation: resource caps (`bankAuthorisations: 4`, `brokerConnections: 2`, `companionDevices: 1`) are static household limits and never multiply when concurrent subscriptions exist.
  5. Downgrade preservation: on expiration, paid entitlement grants are revoked while free baseline capabilities (`finance.manual`, `projections.basic`) remain permanently intact.

### C. Webhook Verification and Storage

- Stripe webhook handler verifies HMAC SHA-256 signatures using `stripe-signature` and raw request payloads.
- RevenueCat webhook handler validates the configured shared authorization token.
- Subscription state is persisted in `app.Subscription` table with audit logging in `app.SubscriptionAudit`.
- State transitions automatically sync with `app.EntitlementGrant`, ensuring `EntitlementService.read` reflects live entitlement status without database polling.

### D. Web Pricing, Checkout, and Portal Routes

- Server-selected products: prices and product IDs are hardcoded on the server and selected by interval, preventing client price tampering.
- Checkout route (`POST /api/households/:householdId/billing/checkout`): initiates Stripe Checkout session with server-generated success and cancel return URLs.
- Portal route (`POST /api/households/:householdId/billing/portal`): creates a Stripe Customer Portal session for managing payment methods, invoices, and cancellation.
- Read route (`GET /api/households/:householdId/billing/subscription`): returns current household subscription status and management options.

## 3. Data Model

### Subscription Entity

```prisma
model Subscription {
  id                     String    @id @default(uuid()) @db.Uuid
  householdId            String    @db.Uuid
  purchaserUserId        String    @db.Uuid
  provider               String    @db.VarChar(20) // STRIPE, REVENUECAT
  environment            String    @db.VarChar(20) // SANDBOX, PRODUCTION
  externalCustomerId     String    @db.VarChar(120)
  externalSubscriptionId String    @db.VarChar(120)
  status                 String    @db.VarChar(20) // ACTIVE, GRACE_PERIOD, CANCELED, EXPIRED
  interval               String    @db.VarChar(20) // MONTHLY, ANNUAL
  effectiveUntil         DateTime  @db.Timestamptz(3)
  graceUntil             DateTime? @db.Timestamptz(3)
  cancelAtPeriodEnd      Boolean   @default(false)
  lastEventId            String?   @db.VarChar(120)
  lastEventAt            DateTime? @db.Timestamptz(3)
  createdAt              DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt              DateTime  @updatedAt @db.Timestamptz(3)

  @@unique([provider, externalSubscriptionId])
  @@index([householdId])
  @@index([purchaserUserId])
  @@schema("app")
}
```

## 4. Failure Modes and Resilience

1. Replayed Webhooks: Duplicate provider deliveries with matching `lastEventId` or older `lastEventAt` return HTTP 200 without executing state mutations.
2. Webhook Delivery Failures: Stripe automatically retries failed deliveries. The system remains idempotent and reconciles out-of-order deliveries.
3. Provider Outages: The application retains the last verified subscription state during provider downtime without prematurely cutting off paid rights during active terms.
4. Billing Grace Periods: Provider-notified payment retries enter `GRACE_PERIOD` status, maintaining capabilities until explicit expiration.
5. Incomplete Checkout: Abandoned Stripe checkout sessions expire cleanly without mutating subscription or entitlement records.

## 5. Security and Privacy

- Secret Storage: Stripe secret keys and webhook signing secrets remain strictly in backend environment variables, never exposed to clients or native bundles.
- Tenant Isolation: Subscriptions are bound to a verified household. Queries enforce user membership in the target household.
- Payment Details: Credit card numbers and bank credentials are held exclusively by Stripe. No PCI-scoped payment information is stored in the application database.
- Audit Logging: All subscription transitions, webhook processing records, and entitlement changes are appended to immutable audit tables.

## 6. Rollout and Rollback Plan

- Forward migration adds `Subscription` and `SubscriptionAudit` tables to the database.
- Webhook routes and billing services are deployed in `apps/api`.
- Web pricing and subscription status endpoints are deployed in `apps/web`.
- Rollback path: Revert application code and webhook endpoints; existing free functionality remains untouched since entitlements fallback to default free capabilities.

## 7. Success Metrics

- 100% deterministic test coverage for all webhook signatures, event normalization, and lifecycle transitions.
- Zero floating-point currency calculations.
- Rejection of sandbox events in production environments.
- Passing typecheck, linter, test suite, and native bundle exports.
