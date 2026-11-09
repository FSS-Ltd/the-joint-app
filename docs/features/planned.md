# Planned and deferred capabilities

Part of the [canonical feature tree](../../FEATURE_TREE.md). Status describes the exact scope below; it does not certify production readiness. Test links are inspected source evidence, not a claim that this inventory task reran them.

<a id="native_finance"></a>

## NATIVE_FINANCE — Native financial journeys

- **Status:** `partial`. **Purpose:** Deliver scoped home/accounts, activity/imports, budgets, wealth/goals and privacy screens over existing authoritative services. IOS4 Tasks2–4 supply shared authority/lifecycle hooks and Home/account read/write source. Task4 fix2 product source is independently approved; fix3 dependency-root tooling is independently approved; actual native re-test and later journeys remain pending.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `IOS4 — Home and accounts`; [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `IOS10a — Wealth, goals, contributions and projection experience`.
- **Canonical implementation:** [apps/mobile/src/features/finance/provider.tsx](../../apps/mobile/src/features/finance/provider.tsx) — `NativeFinanceProvider`; [apps/mobile/src/features/finance/resource-memory.ts](../../apps/mobile/src/features/finance/resource-memory.ts) — `NativeFinanceResourceMemory`; [apps/mobile/src/features/finance/scope.ts](../../apps/mobile/src/features/finance/scope.ts) — `captureFinanceAuthority`; [apps/mobile/src/features/finance/use-resource.ts](../../apps/mobile/src/features/finance/use-resource.ts) — `useFinanceResource`; [apps/mobile/src/features/finance/use-mutation.ts](../../apps/mobile/src/features/finance/use-mutation.ts) — `useFinanceMutation`; [apps/mobile/src/features/finance/use-lifetime.ts](../../apps/mobile/src/features/finance/use-lifetime.ts) — `useFinanceLifetime`; [apps/mobile/src/features/finance/result.ts](../../apps/mobile/src/features/finance/result.ts) — `assertFinanceResult`.
- **Depends on / reuses:** [CONTRACTS](platform.md#contracts), [EVENTS](platform.md#events), [ACCOUNTS](finance.md#accounts), [ACTIVITY](finance.md#activity), [ALLOCATIONS](finance.md#allocations), [CONTRIBUTIONS](finance.md#contributions), [FUNDING](finance.md#funding), [GOALS](finance.md#goals), [IMPORTS](finance.md#imports), [NATIVE_API](identity.md#native_api), [NATIVE_AUTH](identity.md#native_auth), [PRIVACY](platform.md#privacy), [PROJECTIONS](finance.md#projections), [SPENDING](finance.md#spending), [WEALTH](finance.md#wealth), [NATIVE_HOME](finance.md#native_home), [NATIVE_ACCOUNTS](finance.md#native_accounts).
- **Used by:** [MARKETING](planned.md#marketing), [RELEASE](planned.md#release), [NATIVE_HOME](finance.md#native_home), [NATIVE_ACCOUNTS](finance.md#native_accounts).
- **Permission / data boundary:** Current mobile routes include the complete gated Home/More workspace, account list/detail reads and Task4 owner write routes. useFinanceResource.current binds new write capture to the rendered ready snapshot; later read revisions invalidate old capture handlers. The reusable hooks capture verified provider actor plus internal user/membership/household/grant authority. Direct identity/AppState/focus loss aborts and conceals; snapshots are reference-stable. New intent submission requires synchronous current-idle state; settled success/error needs explicit reset before replacement. Deliberate retries retain one captured operation only within its authorized target/focus lifetime. Task4 admission fix03a690e has both independent fix1 re-review approvals; native acceptance remains pending. Sharing callers must await fenced reconcile before returning a result.
- **Verification references:** [tests/native-finance-gate-remount.test.ts](../../tests/native-finance-gate-remount.test.ts); [tests/native-finance-memory.test.ts](../../tests/native-finance-memory.test.ts); [tests/native-finance-authority.test.ts](../../tests/native-finance-authority.test.ts); [tests/native-finance-resource.test.ts](../../tests/native-finance-resource.test.ts); [tests/native-finance-mutations.test.ts](../../tests/native-finance-mutations.test.ts); [tests/native-identity-runtime.test.ts](../../tests/native-identity-runtime.test.ts); [tests/native-session-lifecycle.test.ts](../../tests/native-session-lifecycle.test.ts). Task2 source `0c6447c4caa02a7c20d432dc2213cf8b8a12ca2d` reports 727 full unit tests and mobile/root-test types, scoped lint/format passing. Fix `7c5e3d8cb9b134513fa50580acc1e8fd828d9fe0` adds runtime-owned recovery metadata with 107 focused cases, types and scoped lint/format passing; independent Task2 code/security acceptance is approved. Authored-source tests do not establish native screen rendering.
- **Graphify navigation:** scopes `features, mobile`; query `NativeFinanceProvider`, `useFinanceResource` or `useFinanceMutation` and follow the actual source. The local feature graph uses node ID `feature_NATIVE_FINANCE`.
- **Debug / reuse / limits:** Reuse existing NativeResourceController, account/wealth adapters and identity bridge. Runtime-owned refusal/cursor provenance now survives same-authority gate loading. The source fix has fresh-hook gate-remount coverage; independent Task2 code/security acceptance is approved. Refusal metadata is bounded to 32 entries plus one overflow barrier without eviction; 64 issued cursors use fail-closed oldest eviction. Unknown/evicted/old-grant cursors require first-page reset, including on explicit retry. Terminal authority loss, actual authority replacement and runtime cleanup clear metadata. Recovery memory retains no DTO, write intent or token. Captured 401 targets its actor only. Result guards bind carried identifiers/wealth grant scope. Generic mutation targetKey is opaque: write callers validate returned targets and freeze DTO/key/version. Blur/background/authority replacement clears intent; later attempts need fresh reads and explicit confirmation. Read and write UI now consume this foundation; Task3 source acceptance is approved. Task4 portable money/input-recovery fix48252ba is committed; both independent reviews approve that product source; actual native acceptance remains pending. The reciprocal NATIVE_HOME/NATIVE_ACCOUNTS edges distinguish this shared foundation consumed by screens from the broader journey feature composing those screens. IOS10a still depends on the merged funding/allocation/contribution APIs and planned projection work.

<a id="recurring"></a>

<a id="savings"></a>

## SAVINGS: Savings impact and goal timeline feedback

- **Status:** `implemented`. **Purpose:** Explain qualified cap savings and explicitly confirmed eligible goal allocations.
- **Entry points:** [apps/mobile/src/features/budgets/savings-impact-card.tsx](../../apps/mobile/src/features/budgets/savings-impact-card.tsx) - `SavingsImpactCard`; [apps/mobile/src/features/goals/goal-timeline-feedback-card.tsx](../../apps/mobile/src/features/goals/goal-timeline-feedback-card.tsx) - `GoalTimelineFeedbackCard`; [apps/mobile/src/features/review/month-end-surplus-card.tsx](../../apps/mobile/src/features/review/month-end-surplus-card.tsx) - `MonthEndSurplusCard`; [apps/mobile/src/features/budgets/budget-screen.tsx](../../apps/mobile/src/features/budgets/budget-screen.tsx) - `BudgetScreen`; [apps/mobile/src/features/review/monthly-review-screen.tsx](../../apps/mobile/src/features/review/monthly-review-screen.tsx) - `MonthlyReviewScreen`; [apps/mobile/src/features/goals/goal-detail-screen.tsx](../../apps/mobile/src/features/goals/goal-detail-screen.tsx) - `GoalDetailScreen`.
- **Canonical implementation:** [apps/mobile/src/features/budgets/savings-impact.ts](../../apps/mobile/src/features/budgets/savings-impact.ts) - `calculateCategoryVariance`, `calculateHouseholdSavingsImpact`; [apps/mobile/src/features/goals/goal-timeline-feedback.ts](../../apps/mobile/src/features/goals/goal-timeline-feedback.ts) - `evaluateGoalTimelineFeedback`.
- **Depends on / reuses:** [ALLOCATIONS](finance.md#allocations), [PROJECTIONS](finance.md#projections), [RECURRING](finance.md#recurring), [SPENDING](finance.md#spending).
- **Used by:** [NATIVE_HOME](finance.md#native_home), [NATIVE_ACCOUNTS](finance.md#native_accounts), [REPORTS](finance.md#reports).
- **Permission / data boundary:** Cap remainder is not disposable cash. No transfer, trade or observed contribution is created. Earmarking intention recorded only.
- **Verification references:** [tests/native-savings-impact.test.ts](../../tests/native-savings-impact.test.ts); [tests/native-budgets-ui.test.ts](../../tests/native-budgets-ui.test.ts); [tests/native-review-ui.test.ts](../../tests/native-review-ui.test.ts).
- **Graphify navigation:** scopes `mobile, shared`; query `calculateHouseholdSavingsImpact` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_SAVINGS`.
- **Debug / reuse / limits:** Pure math in savings-impact.ts computes category variance and household qualified savings without double deductions across goals. Amount-only feedback protects goals lacking targets, opening balances or active contribution schedules. Month-end surplus allocation card locks when period coverage is incomplete.

<a id="billing"></a>

## BILLING - Web subscriptions and native purchase recovery

- **Status:** `implemented`. **Purpose:** Normalize Stripe/RevenueCat billing and native purchase/restore into server entitlements.
- **Entry points:** [apps/api/src/modules/billing/billing.controller.ts](../../apps/api/src/modules/billing/billing.controller.ts) - `createBillingController`, `createBillingWebhooksController`; [apps/mobile/src/features/billing/billing-screen.tsx](../../apps/mobile/src/features/billing/billing-screen.tsx) - `BillingScreen`; [apps/mobile/app/(workspace)/billing.tsx](<../../apps/mobile/app/(workspace)/billing.tsx>).
- **Canonical implementation:** [packages/contracts/src/billing.ts](../../packages/contracts/src/billing.ts) - `normalizedSubscriptionEventSchema`, `nativeProductSchema`, `purchaseResultSchema`; [packages/entitlements/src/billing-reducer.ts](../../packages/entitlements/src/billing-reducer.ts) - `reduceSubscriptionEvent`; [apps/api/src/modules/billing/billing.service.ts](../../apps/api/src/modules/billing/billing.service.ts) - `BillingService`; [packages/database/prisma/migrations/20261109170000_billing_subscriptions/migration.sql](../../packages/database/prisma/migrations/20261109170000_billing_subscriptions/migration.sql) - `Subscription`; [apps/worker/src/billing-maintenance.ts](../../apps/worker/src/billing-maintenance.ts) - `maintainSubscriptions`; [apps/mobile/src/features/billing/purchase-adapter.ts](../../apps/mobile/src/features/billing/purchase-adapter.ts) - `createPlatformPurchaseAdapter`; [apps/mobile/src/features/billing/use-billing.ts](../../apps/mobile/src/features/billing/use-billing.ts) - `useBilling`.
- **Depends on / reuses:** [AUTH](identity.md#auth), [ENTITLEMENTS](platform.md#entitlements), [HOUSEHOLD](identity.md#household), [JOBS](platform.md#jobs).
- **Used by:** [MARKETING](planned.md#marketing), [RELEASE](planned.md#release), [STAFF](planned.md#staff).
- **Permission / data boundary:** No checkout-success fulfillment, double caps or purchaser-household transfer. Due-time worker reconciliation expires subscriptions. Native iOS StoreKit and Android Google Play adapters enforce platform boundaries, cancellation handling, pending authorization notices, and restore without extra charges.
- **Verification references:** [tests/billing-lifecycle.test.ts](../../tests/billing-lifecycle.test.ts); [tests/native-purchase-adapter.test.ts](../../tests/native-purchase-adapter.test.ts); [tests/native-billing-ui.test.ts](../../tests/native-billing-ui.test.ts).
- **Graphify navigation:** scopes `api, mobile, shared, operations`; query `BillingService` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_BILLING`.
- **Debug / reuse / limits:** IOS11 server billing normalization and web pricing routes are implemented. IOS12 native purchase adapters, StoreKit/Google Play deep links, cancellation/pending handling, and restore recovery are implemented. Debug `reduceSubscriptionEvent`, `BillingService`, `PlatformPurchaseAdapter`, `useBilling`, and `maintainSubscriptions`.

<a id="companion"></a>

## COMPANION — Local companion and grounded insights

- **Status:** `implemented`. **Purpose:** Pair an on-device local runtime and expose consented, read-only deterministic tools.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) - `IOS13a / IOS13b / IOS13c - Local companion`; [apps/mobile/src/features/companion/companion-screen.tsx](../../apps/mobile/src/features/companion/companion-screen.tsx) - `CompanionScreen`; [apps/mobile/app/(workspace)/companion.tsx](<../../apps/mobile/app/(workspace)/companion.tsx>).
- **Canonical implementation:** [packages/contracts/src/devices.ts](../../packages/contracts/src/devices.ts), [apps/api/src/modules/devices/](../../apps/api/src/modules/devices/), [apps/worker/src/companion-maintenance.ts](../../apps/worker/src/companion-maintenance.ts), [apps/companion/](../../apps/companion/), [apps/mobile/src/api/devices.ts](../../apps/mobile/src/api/devices.ts), [apps/mobile/src/features/companion/](../../apps/mobile/src/features/companion/), [docs/joint-app/05-local-ai-and-projections.md](../../docs/joint-app/05-local-ai-and-projections.md).
- **Depends on / reuses:** [AUTH](identity.md#auth), [ENTITLEMENTS](platform.md#entitlements), [EVENTS](platform.md#events), [HOUSEHOLD](identity.md#household), [JOBS](platform.md#jobs), [PROJECTIONS](finance.md#projections), [REPORTS](finance.md#reports).
- **Used by:** [REHEARSAL](planned.md#rehearsal).
- **Permission / data boundary:** Per-adult consent, five-minute leases, encryption, revocation and no cloud fallback.
- **Verification references:** [tests/companion-protocol.test.ts](../../tests/companion-protocol.test.ts), [tests/companion-runtime.test.ts](../../tests/companion-runtime.test.ts), [tests/companion-eval.test.ts](../../tests/companion-eval.test.ts), [tests/native-companion-ui.test.ts](../../tests/native-companion-ui.test.ts).
- **Graphify navigation:** scopes `api, worker, companion, mobile, shared`; query `CompanionJobRunner` or `DevicesService` or `useCompanion` or inspect canonical source paths. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_COMPANION`.
- **Debug / reuse / limits:** Fully implemented across IOS13a protocol (per-adult account consent isolation, cryptographic session challenge, 5-minute bounded lease lifecycle, AES-256-GCM envelope encryption, worker maintenance), IOS13b runtime (apps/companion package, loopback-only OllamaAdapter, ToolGateway with 4 deterministic tools, CompanionJobRunner, CLI), and IOS13c native interface (CompanionScreen, pairing code generation, fingerprint attestation, account consent toggles, insight job creation, and 100-request evaluation harness). Reusable for founder rehearsal (IOS17).

<a id="staff"></a>

## STAFF — Staff authority and aggregate commercial analytics

- **Status:** `planned`. **Purpose:** Collect minimal lifecycle evidence and show bounded revenue, churn and retention aggregates.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `IOS14 — Staff authorization and minimal analytics collection`.
- **Canonical implementation:** No runtime implementation yet; use the cited plan.
- **Depends on / reuses:** [AUTH](identity.md#auth), [BILLING](planned.md#billing), [DATABASE](platform.md#database), [EVENTS](platform.md#events).
- **Used by:** No implemented consumer identified; future callers must reuse this boundary.
- **Permission / data boundary:** Separate audited staff authority; household/purchaser roles do not grant access. Suppress cohorts below five server-side and prevent differencing.
- **Verification references:** No executable feature acceptance established; the linked plan defines the required evidence.
- **Graphify navigation:** scopes `features; future runtime nodes are absent`; query `STAFF` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_STAFF`.
- **Debug / reuse / limits:** IOS14/15 are planned. No staff route, production collection or household-finance drill-down exists here.

<a id="marketing"></a>

## MARKETING — Marketing and household-web retirement

- **Status:** `planned`. **Purpose:** Present delivered capabilities and preserve required billing/security/privacy recovery during native cutover.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `IOS16 — Marketing and web household cutover`.
- **Canonical implementation:** No runtime implementation yet; use the cited plan.
- **Depends on / reuses:** [BILLING](planned.md#billing), [NATIVE_FINANCE](planned.md#native_finance), [PRIVACY](platform.md#privacy), [WEB_AUTH](identity.md#web_auth).
- **Used by:** No implemented consumer identified; future callers must reuse this boundary.
- **Permission / data boundary:** Keep existing family web routes until parity and recovery evidence pass. Never retire authoritative Nest endpoints merely to remove pages.
- **Verification references:** No executable feature acceptance established; the linked plan defines the required evidence.
- **Graphify navigation:** scopes `features; future runtime nodes are absent`; query `MARKETING` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_MARKETING`.
- **Debug / reuse / limits:** Existing web is a retained finance reference. Do not label it a delivered marketing/subscription/staff site.

<a id="statements"></a>

## STATEMENTS — Local reviewed statement conversion

- **Status:** `planned`. **Purpose:** Extract bounded PDF/OCR rows with editable source-linked review and explicit CSV handoff.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `IOS17a / IOS17b — Statement conversion and rehearsal`.
- **Canonical implementation:** [docs/decisions/statement-to-csv-converter.md](../../docs/decisions/statement-to-csv-converter.md).
- **Depends on / reuses:** [IMPORTS](finance.md#imports), [MONEY](finance.md#money), [PRIVACY](platform.md#privacy).
- **Used by:** [REHEARSAL](planned.md#rehearsal).
- **Permission / data boundary:** Local processing, no cloud statements, no universal bank coverage, no automatic import or invented financial values.
- **Verification references:** No executable feature acceptance established; the linked plan defines the required evidence.
- **Graphify navigation:** scopes `features; future runtime nodes are absent`; query `` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_STATEMENTS`.
- **Debug / reuse / limits:** No converter implementation is claimed; existing CSV parsing remains canonical.

<a id="rehearsal"></a>

## REHEARSAL — Founder financial and privacy rehearsal

- **Status:** `planned`. **Purpose:** Complete a one-month rehearsal with independent totals, projections, recovery and consent evidence.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `IOS17a / IOS17b — Statement conversion and rehearsal`.
- **Canonical implementation:** No runtime implementation yet; use the cited plan.
- **Depends on / reuses:** [COMPANION](planned.md#companion), [PROJECTIONS](finance.md#projections), [RESTORE](platform.md#restore), [STATEMENTS](planned.md#statements).
- **Used by:** No implemented consumer identified; future callers must reuse this boundary.
- **Permission / data boundary:** Elapsed rehearsal and approved samples are real gates. Tests and source merges cannot fabricate observed acceptance.
- **Verification references:** No executable feature acceptance established; the linked plan defines the required evidence.
- **Graphify navigation:** scopes `features; future runtime nodes are absent`; query `REHEARSAL` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_REHEARSAL`.
- **Debug / reuse / limits:** Existing restore and synthetic finance tests are foundations, not founder rehearsal completion.

<a id="notifications"></a>

## NOTIFICATIONS — Expo push delivery

- **Status:** `planned`. **Purpose:** Provide generic remote alerts only for delivered flows that need them.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `IOS18 — Physical-device, commercial and release readiness`.
- **Canonical implementation:** No runtime implementation yet; use the cited plan.
- **Depends on / reuses:** [AUTH](identity.md#auth), [EVENTS](platform.md#events), [RELEASE](planned.md#release), [SESSION](identity.md#session).
- **Used by:** No implemented consumer identified; future callers must reuse this boundary.
- **Permission / data boundary:** Opaque generic payloads, encrypted device tokens, identity unbind, permission denial and reauthorized deep links.
- **Verification references:** No executable feature acceptance established; the linked plan defines the required evidence.
- **Graphify navigation:** scopes `features; future runtime nodes are absent`; query `NOTIFICATIONS` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_NOTIFICATIONS`.
- **Debug / reuse / limits:** Expo push remains deferred. Existing authenticated event streams are a separate capability.

<a id="connectors"></a>

## CONNECTORS — Direct financial-provider connectors

- **Status:** `planned`. **Purpose:** Add separately approved direct bank or broker sources after source-rights and procurement gates.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `Global constraints`.
- **Canonical implementation:** [docs/joint-app/04-account-integrations.md](../../docs/joint-app/04-account-integrations.md).
- **Depends on / reuses:** [ACCOUNTS](finance.md#accounts), [AUTH](identity.md#auth), [ENTITLEMENTS](platform.md#entitlements), [IMPORTS](finance.md#imports).
- **Used by:** No implemented consumer identified; future callers must reuse this boundary.
- **Permission / data boundary:** Outside the current CSV/manual MVP. No trading or money movement; CSV is never labelled a live connection.
- **Verification references:** No executable feature acceptance established; the linked plan defines the required evidence.
- **Graphify navigation:** scopes `features; future runtime nodes are absent`; query `` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_CONNECTORS`.
- **Debug / reuse / limits:** Post-MVP plan only. No provider-specific implementation or commercial authorization is claimed.

<a id="children"></a>

## CHILDREN — Deferred child profiles

- **Status:** `planned`. **Purpose:** Track the separately deferred child-specific product work without implying an existing profile experience.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `Global constraints`.
- **Canonical implementation:** [docs/decisions/release-scope.md](../../docs/decisions/release-scope.md).
- **Depends on / reuses:** [GOALS](finance.md#goals), [HOUSEHOLD](identity.md#household).
- **Used by:** No implemented consumer identified; future callers must reuse this boundary.
- **Permission / data boundary:** Outside current MVP. Existing child-earmarked exclusions are finance safety rules, not child-profile support.
- **Verification references:** No executable feature acceptance established; the linked plan defines the required evidence.
- **Graphify navigation:** scopes `features; future runtime nodes are absent`; query `` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_CHILDREN`.
- **Debug / reuse / limits:** No child profile route/API/UI is claimed.

<a id="release"></a>

## RELEASE — Physical-device and commercial release readiness

- **Status:** `planned`. **Purpose:** Verify supported iOS/Android devices, stores, privacy, recovery and operating readiness.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `IOS18 — Physical-device, commercial and release readiness`.
- **Canonical implementation:** No runtime implementation yet; use the cited plan.
- **Depends on / reuses:** [BILLING](planned.md#billing), [DELIVERY](platform.md#delivery), [NATIVE_AUTH](identity.md#native_auth), [NATIVE_FINANCE](planned.md#native_finance), [PRIVACY](platform.md#privacy), [RESTORE](platform.md#restore).
- **Used by:** [NOTIFICATIONS](planned.md#notifications).
- **Permission / data boundary:** Local Xcode/Android Studio builds; no EAS/cloud build or automatic submission. Founder retains final store-review submission and deployment approval.
- **Verification references:** No executable feature acceptance established; the linked plan defines the required evidence.
- **Graphify navigation:** scopes `features; future runtime nodes are absent`; query `RELEASE` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_RELEASE`.
- **Debug / reuse / limits:** Source CI and simulator evidence do not certify physical-device storage, accessibility, store purchase or public launch acceptance.
