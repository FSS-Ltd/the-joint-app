# Phase 5 — Mobile and Public MVP Implementation Plan

> **CSV-first MVP revision, 23 October 2026:** Direct bank connections and bank procurement are post-MVP by founder instruction. The current MVP uses CSV/manual records; historical live-bank prerequisites and live-refresh paywall promises below are deferred. Provider evidence remains required before future live work. No live broker connector is included in the CSV-first build; its separate permission gate remains. See the [canonical scope revision](../01-product-specification.md).

> **Scope revision, 23 October 2026:** Child profiles and child-specific UI/projections are post-MVP, per the [canonical product revision](../01-product-specification.md). Treat child-specific tasks below as deferred; retain the safeguards against double counting and including verified child-earmarked funds in adult spendable totals. All MVP UI is mobile first.

> **For coding agents:** Follow [the handoff](../12-coding-agent-handoff.md) and implement one reviewable task at a time. Use the available repository workflow; no additional plugin installation is required. Checkboxes track future work.

**Goal:** Release native iOS/Android household finance clients with trustworthy subscription lifecycle handling, privacy controls and commercially viable approved connectivity.

**Architecture:** Expo Router screens consume the existing Nest REST API and shared contracts; reuse domain logic and design tokens. RevenueCat normalizes store purchases, Stripe handles web purchases, and server-derived household entitlements authorize every paid operation independently of account grants.

**Tech Stack:** Expo React Native, SecureStore, Supabase Auth, react-native-purchases, NestJS, Prisma/PostgreSQL, Zod, Vitest, Jest/jest-expo, Maestro, Stripe Billing and RevenueCat. Use Phase 0’s pinned version matrix.

**Spec:** [Product](../01-product-specification.md), [architecture](../02-architecture-and-project-structure.md), [data invariants](../03-data-model-and-financial-rules.md), [AI execution](../05-local-ai-and-projections.md), [commercial/mobile policy](../06-paywalls-and-mobile-launch.md).

**Estimate:** **13–20 engineer-days**, assuming Phases 1–4 have working tested APIs. External contracts, store review and legal/accounting turnaround are additional elapsed time. Paths and commands below describe future implementation; no app or external configuration has been created.

## Global Constraints

- Two adult identities; one active household per adult; children are parent-managed profiles without logins.
- “Cash values are signed integer minor units in `BIGINT`, serialized as decimal strings.”
- “No data is silently sent to a cloud AI provider.”
- Require MFA before real connections, exports, pairing or widening grants; destructive operations require reauthentication within five minutes.
- Free: `finance.manual`, `projections.basic`. Plus adds `connections.bank`, `connections.broker`, `projections.advanced`, `categorisation.automation`, `insights.local`.
- Plus caps: `bankAuthorisations=4`, `brokerConnections=2`, `companionDevices=1`; these are product limits, not provider billing units.
- Provisional household pricing: £5.99 monthly/£59.99 annually; no assumed live-connection free trial.
- Preserve authorized history, partner access and export after downgrade. Privacy operations are never paywalled.
- Native screens, navigation and controls; no WebView wrapper. AI remains an optional compatible-Mac feature with fresh online execution permission and maximum five-minute leases.

## Review Focus

1. Different app login with the same store account must not transfer a purchase or reveal its original household — Task 4.
2. Delayed cancellation after renewal must not overwrite current paid entitlement — Tasks 2–3.
3. Cold-start, replayed or malicious provider-return links must not authenticate or connect the wrong person — Task 1.
4. Permission revoked while a narrative is cached must invalidate it, never string-redact or keep showing it — Task 5.
5. Lost connectivity during checkout must leave a recoverable pending state without another charge — Task 4.

---

## File and dependency map

| Task | Main planned files                                                                                                                             | Dependency                        | Days |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---- |
| 1    | `apps/mobile/app/_layout.tsx`, `apps/mobile/app.config.ts`, `apps/mobile/src/security/session.ts`, `apps/mobile/src/security/mobile-return.ts` | Phase 1 identity; Phase 2 consent | 3–4  |
| 2    | `packages/contracts/src/billing.ts`, `packages/entitlements/src/reduce.ts`, database migration                                                 | Phase 1 entitlement boundary      | 2–3  |
| 3    | API billing module, webhook controller, worker reconciliation, web Checkout route                                                              | Task 2                            | 2–3  |
| 4    | Mobile purchase service, paywall and subscription Settings                                                                                     | Tasks 1, 3                        | 2–3  |
| 5    | Native finance/privacy/AI screens and permission cache                                                                                         | Tasks 1–2; Phases 3–4             | 2–3  |
| 6    | Release workflow, evidence manifest, rollback runbook                                                                                          | All preceding tasks               | 2–4  |

Tasks 1 and 2 can proceed independently. All paths are repository-relative. `UUID` and `ISOInstant` use existing validated contract aliases; `AuthContext` is the existing server-authenticated identity, never a mobile-supplied structure.

### Task 1: Native identity and verified returns

**Files:** Create the four Task 1 files above, `apps/mobile/jest.config.cjs`, `apps/mobile/src/security/__tests__/mobile-return.test.ts`, `apps/mobile/.maestro/auth-return.yaml`, `apps/web/public/.well-known/apple-app-site-association` and `apps/web/public/.well-known/assetlinks.json` for the approved domain/signing identities.

**Interfaces:** `restoreNativeSession(): Promise<'AUTHENTICATED'|'SIGNED_OUT'>`; `consumeMobileReturn(url: string, now: ISOInstant): Promise<'AUTHENTICATED'|'CONNECTION_PENDING'|'REJECTED'>`; `clearNativeSession(): Promise<void>`.

- [ ] Add failing tests asserting wrong host/path, expired state, reused state and another adult’s consent attempt return `REJECTED`; code exchange occurs exactly once for a valid return, including cold start.

```ts
expect(
  await consumeMobileReturn("https://attacker.example/mobile/auth?code=x", now),
).toBe("REJECTED");
expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
```

- [ ] Run `pnpm --dir apps/mobile exec jest --runInBand src/security/__tests__/mobile-return.test.ts`; confirm failure reflects missing behavior.
- [ ] Implement Supabase PKCE login, session validation, serialized refresh, secure refresh-token storage and memory-only access tokens. Clear identity-scoped caches on logout/account change; reject disabled sessions through the existing API.
- [ ] Implement HTTPS Universal/App Links with an allowlisted origin, single-use state and ownership checks. Consent returns carry an opaque attempt identifier; fetch connection status from the API. A link never supplies credentials, account access or paid entitlement. Use the system browser for provider consent.
- [ ] Configure app locking/background screen concealment and SecureStore backup behavior; verify revoked sessions cannot resume finance requests. Test on development builds, not Expo Go: IAP needs native code, and linking needs realistic app associations. [Expo IAP](https://docs.expo.dev/guides/in-app-purchases/), [linking](https://docs.expo.dev/linking/overview/), [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).
- [ ] Rerun Jest and `maestro test apps/mobile/.maestro/auth-return.yaml` on iOS and Android; expect valid return once, invalid returns rejected and no secret-bearing logs. Commit this deliverable.

### Task 2: Normalized subscriptions and capability reduction

**Files:** Create `packages/contracts/src/billing.ts`, `packages/entitlements/src/reduce.ts`, `packages/entitlements/src/reduce.test.ts`, `packages/test-fixtures/src/billing.ts`, and the generated `public_billing` migration under `packages/database/prisma/migrations/`. Modify `packages/database/prisma/schema.prisma`.

**Interfaces:** Define `BillingInterval='MONTHLY'|'ANNUAL'`; `BillingSource='APPLE'|'GOOGLE'|'STRIPE'`; `WebhookProvider='revenuecat'|'stripe'`.

`BillingSubscription` fields: `source:BillingSource`, `sourceSubscriptionId:string`, `environment:'SANDBOX'|'PRODUCTION'`, `purchaserId:UUID`, `householdId:UUID`, `state:'PENDING'|'ACTIVE'|'GRACE'|'HOLD'|'EXPIRED'|'REVOKED'`, `paidThrough:ISOInstant|null`, `graceUntil:ISOInstant|null`, `renews:boolean`, `version:number`, `verifiedAt:ISOInstant`. Household binding is immutable; version is the database reconciliation version, not assumed provider-event order.

`HouseholdEntitlements` fields: `householdId:UUID`, `plan:'FREE'|'PLUS'`, `capabilities:Record<Capability,boolean>`, `caps:{bankAuthorisations:number;brokerConnections:number;companionDevices:number}`, `version:number`, `validUntil:ISOInstant|null`, `verification:'VERIFIED'|'STALE'`. Free caps are 0/0/0 without deleting retained connection/device records. `BillingStatus` is the internal service model and contains `entitlements:HouseholdEntitlements`, source/status/end-date summaries, `hasDuplicateSubscriptions:boolean` and `canManageBilling:boolean`; omit payment details from partner responses.

Map internal HouseholdEntitlements to the public EntitlementsDto in 07: enabled keys become its capability array and validUntil maps to effectiveUntil. Public billing-status responses use that same mapped DTO; do not expose competing client shapes.

Produce `deriveEntitlements(householdId: UUID, subscriptions: readonly BillingSubscription[], founderGrants: readonly FounderGrant[], now: ISOInstant): HouseholdEntitlements`. Reuse Phase 1’s auditable grant: `FounderGrant={householdId:UUID;issuerId:UUID;reason:string;capabilities:Capability[];issuedAt:ISOInstant;expiresAt:ISOInstant;revokedAt:ISOInstant|null}`; expiry is within 90 days. `Capability` is the canonical seven-key union above.

- [ ] Add fixture-backed assertions: Free retains both baseline capabilities; active/grace Plus caps equal 4/2/1; expired grace disables paid capabilities; cancel-at-period-end preserves access; revoked-only access becomes Free; two valid subscriptions grant one plan with caps 4/2/1, never 8/4/2. A separate valid subscription survives another subscription’s refund.

```ts
expect(expiredGrace.capabilities["projections.basic"]).toBe(true);
expect(expiredGrace.capabilities["connections.bank"]).toBe(false);
expect(duplicatePaid.caps).toEqual({
  bankAuthorisations: 4,
  brokerConnections: 2,
  companionDevices: 1,
});
```

Compute these outputs inside the test from fixed-time input fixtures in `billing.ts`.

- [ ] Run `pnpm --dir packages/entitlements exec vitest run src/reduce.test.ts` and confirm expected failure.
- [ ] Generate the next ordered migration with the pinned Prisma workflow and record its actual generated path; do not use a date from this planning document as migration chronology. Implement the pure reducer and migration constraints: unique source/environment/subscription identity, immutable binding, idempotent event identity, optimistic entitlement version and provenance. Founder expiry uses the same reducer; source events never become membership grants.
- [ ] Rerun the reducer suite; require every boundary assertion to pass, including exact grace-expiry time. Commit.

### Task 3: Authoritative APIs, web Checkout and reconciliation

**Files:** Create `apps/api/src/modules/entitlements/billing.service.ts`, `apps/api/src/modules/entitlements/billing.controller.ts`, `apps/api/src/modules/entitlements/billing-webhook.controller.ts`, `apps/api/test/billing-lifecycle.e2e-spec.ts`, `apps/worker/src/handlers/billing-reconcile.ts`, and `apps/web/app/api/billing/checkout/route.ts`.

**Interfaces:** `getBillingStatus(ctx: AuthContext, householdId: UUID): Promise<BillingStatus>`; `createCheckout(ctx: AuthContext, householdId: UUID, interval: BillingInterval, idempotencyKey: UUID): Promise<{id:string;url:string;expiresAt:ISOInstant}>`; `acceptBillingWebhook(provider: WebhookProvider, raw: Uint8Array, headers: Record<string,string>): Promise<void>`; `reconcileBillingAccount(id: UUID): Promise<void>`.

Expose `GET /v1/households/{householdId}/entitlements`, `GET /v1/households/{householdId}/billing/status`, `POST /v1/households/{householdId}/billing/checkout`, and `POST /v1/webhooks/billing/{provider}`.

- [ ] Write integration assertions: invalid signature gives 401 and zero events; replay leaves one durable event; a late cancellation fetches current renewed state and preserves access; expired grace/refund stops a queued provider call. Restoring the same provider identity to household B returns `BILLING_IDENTITY_CONFLICT`, leaving household A unchanged.
- [ ] Add concurrent-checkout assertions: one server session for one idempotency key; an active household returns `ALREADY_SUBSCRIBED`; supplied price/amount/household ownership claims cannot select a product or bypass authorization.
- [ ] Run `pnpm --dir apps/api exec jest --runInBand test/billing-lifecycle.e2e-spec.ts` against isolated Testcontainers Postgres; observe failures, then implement signature validation, durable enqueue and provider-state retrieval under the billing-account lock.
- [ ] Map Stripe customer/subscription resources through stored server identities. Use server-selected Price IDs and fixed return URLs. Never fulfil from the success page. Normalize RevenueCat and Stripe imports to one source subscription, avoiding double counting; reject sandbox events in production and quarantine unknown bindings.
- [ ] Add daily/expiry reconciliation, retry/backoff and discrepancy alerts. Preserve last verified state during provider failure without extending expired paid rights. Recheck entitlements immediately before every paid worker operation. Rerun the API suite; commit. [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks), [Stripe lifecycle](https://docs.stripe.com/billing/subscriptions/webhooks).

### Task 4: Native purchase, restore and recovery

**Files:** Create `apps/mobile/src/features/billing/purchases.ts`, `apps/mobile/src/features/billing/Paywall.tsx`, `apps/mobile/src/features/billing/purchases.test.ts`, `apps/mobile/app/settings/subscription.tsx`, and `apps/mobile/.maestro/billing.yaml`.

**Interfaces:** `purchasePlus(interval: BillingInterval): Promise<PurchaseOutcome>`; `restorePlus(): Promise<PurchaseOutcome>`; `refreshBilling(): Promise<BillingStatus>`. `PurchaseOutcome={state:'ACTIVE'|'PENDING'|'CANCELLED'|'IDENTITY_CONFLICT';status:BillingStatus}`. Consume Task 3 endpoints; only the server status grants household access.

- [ ] Test cancelled purchase leaves Free; SDK success with delayed webhook stays `PENDING`; verification retry does not call purchase again; valid restore produces zero new charges; mismatched login/household cannot transfer access. Two adults on different platforms receive identical household capability versions without sharing store credentials.

```ts
const restored = await restorePlus();
expect(restored.state).toBe("IDENTITY_CONFLICT");
expect(restored.status.entitlements.plan).toBe("FREE");
expect(purchasePackage).not.toHaveBeenCalled();
```

Mock the SDK and server conflict response; Task 3 independently verifies the original binding remains unchanged.

- [ ] Run `pnpm --dir apps/mobile exec jest --runInBand src/features/billing/purchases.test.ts`; observe the relevant failures.
- [ ] Configure RevenueCat only after authenticated identity resolution, with stable opaque purchaser UUIDs. Select **Keep with original App User ID**, matching store account-token mappings, and provide original-account recovery. Block anonymous checkout and automatic alias/household transfer. Restore runs only on user action. [Restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior).
- [ ] Build native monthly/annual purchase UI with fetched localized prices, full annual total, dismissal, Restore and source-specific management. Suppress a second purchase when either adult already funds the household. UK iOS uses native subscriptions; Android initially uses Play Billing; web uses Stripe. Regional alternatives require a separate decision.
- [ ] Refresh on foreground, purchase, restore and household change; preserve pending state on network loss. Run the Jest suite plus `maestro test apps/mobile/.maestro/billing.yaml` with real sandbox store dialogs on both platforms; record purchase, grace, refund and reinstall evidence. Commit.

### Task 5: Complete native finance and privacy journeys

**Files:** Create `apps/mobile/app/(app)/index.tsx`, `apps/mobile/app/(app)/transactions.tsx`, `apps/mobile/app/(app)/budgets.tsx`, `apps/mobile/app/(app)/wealth.tsx`, `apps/mobile/app/(app)/goals.tsx`, `apps/mobile/app/(app)/children.tsx`, `apps/mobile/app/(app)/insights.tsx`, `apps/mobile/app/settings/privacy.tsx`, `apps/mobile/src/security/permission-cache.ts`, and `apps/mobile/.maestro/privacy-downgrade.yaml`.

**Interfaces:** `invalidatePermissionCache(householdId: UUID, grantVersion: number): void`; finance screens consume existing generated API DTOs; no new financial calculations in UI components.

- [ ] Add acceptance assertions: Free £1,000 starting funds plus £250/month reaches £4,000 after 12 contributions at zero growth; advanced scenarios prompt upgrade; basic goals remain usable. TOTALS cannot reveal merchants/holdings; a revoked narrative disappears and cannot reopen from cache. Downgrade preserves both adults’ authorized history and export while new paid jobs fail.
- [ ] Implement native forms, lists, accessible charts/tables and freshness labels using shared tokens/contracts. Add free privacy/export/disconnect/leave/delete flows, reauthentication and explicit billing consequences; delete must remain available with an active subscription.
- [ ] Add owner-archive read/export access after household exit, without active former membership; preserve private-note and source-owner boundaries.
- [ ] Integrate optional companion status and existing pairing/job APIs. Show the approved Mac-dependency disclosure. Offline shows “Waiting for your AI device”; revoked devices are blocked and require new pairing. Preserve deterministic calculators. Invalidate whole affected narratives and require scoped regeneration, not string redaction; never permit offline processing using subscription metadata.
- [ ] Run `maestro test apps/mobile/.maestro/privacy-downgrade.yaml` on both platforms, with API assertions proving paid refresh was not invoked. Review screen-reader labels, text scaling, background concealment and generic notifications without balances/merchants/child details. Commit.

### Task 6: Public launch evidence and rollback

**Files:** Create `.github/workflows/mobile-release.yml`, `apps/mobile/eas.json`, `docs/releases/public-mvp-evidence.md`, `docs/runbooks/mobile-billing-rollback.md`; modify public pricing/privacy/support/deletion pages under `apps/web/app/(public)/`.

- [ ] Run `pnpm exec turbo run lint typecheck`, the named suites above, and `pnpm --dir apps/mobile exec expo export --platform all`; require clean output. Produce signed preview binaries through the approved release workflow, then repeat real-device consent, restore and deletion acceptance.
- [ ] Record actual provider permissions, tested production consent/refresh/revoke evidence, approved broker scope and viable quotes against the annual-plan cost ceiling. Missing required connectivity means a labelled partial beta, not full public MVP. Complete refund/settlement reconciliation and backup/restore evidence.
- [ ] Recheck current Apple/Google UK billing rules, legal-entity requirements, privacy manifests, store disclosures, consumer-law commencement, tax treatment, support and deletion obligations at the actual launch date. Obtain applicable review sign-offs; synthetic store-review accounts must function without private founder data.
- [ ] Enable purchases and connector onboarding only after all acceptance evidence passes. Define independent kill switches for new checkout, new connections and paid jobs; preserve webhook ingestion, subscription management, privacy and authorized reads.
- [ ] Rehearse rollback to the last compatible API/mobile release using additive schema changes. Disable new sales first for billing defects; reconcile affected purchases and communicate remedies. Store binaries already installed cannot be recalled: keep API compatibility and server-side controls, never rely solely on an over-the-air update. Commit the release evidence and runbook.

**Launch acceptance:** both native platforms, all seven capabilities correctly enforced, real approved connectivity, passing ownership/lifecycle/privacy assertions, viable measured costs and completed store/security/legal review. No unapproved provider, missing payment state or unresolved permission defect may be relabelled complete.
