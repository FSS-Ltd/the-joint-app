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

## RECURRING — Recurring categories and complete-month baselines

- **Status:** `planned`. **Purpose:** Confirm recurring rules and deterministic 3/6/12 complete-month baselines.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `IOS7b — Recurring categories and complete-month baselines`.
- **Canonical implementation:** No runtime implementation yet; use the cited plan.
- **Depends on / reuses:** [ACTIVITY](finance.md#activity), [ENTITLEMENTS](platform.md#entitlements), [SPENDING](finance.md#spending).
- **Used by:** [SAVINGS](planned.md#savings).
- **Permission / data boundary:** Manual overrides, variable income confirmation, transfers/refunds and missing months must remain explicit.
- **Verification references:** No executable feature acceptance established; the linked plan defines the required evidence.
- **Graphify navigation:** scopes `features; future runtime nodes are absent`; query `RECURRING` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_RECURRING`.
- **Debug / reuse / limits:** No recurring engine or native rule UI is claimed. Extend existing annotation/cadence contracts under IOS7b.

<a id="savings"></a>

## SAVINGS — Savings impact and goal timeline feedback

- **Status:** `planned`. **Purpose:** Explain qualified cap savings and explicitly confirmed eligible goal allocations.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `IOS10b — Savings impact and goal timeline feedback`.
- **Canonical implementation:** No runtime implementation yet; use the cited plan.
- **Depends on / reuses:** [ALLOCATIONS](finance.md#allocations), [PROJECTIONS](finance.md#projections), [RECURRING](planned.md#recurring), [SPENDING](finance.md#spending).
- **Used by:** No implemented consumer identified; future callers must reuse this boundary.
- **Permission / data boundary:** Cap remainder is not disposable cash. No transfer, trade or observed contribution is created.
- **Verification references:** No executable feature acceptance established; the linked plan defines the required evidence.
- **Graphify navigation:** scopes `features; future runtime nodes are absent`; query `SAVINGS` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_SAVINGS`.
- **Debug / reuse / limits:** IOS10b depends on existing cap presentation plus future projection and baseline units.

<a id="billing"></a>

## BILLING — Web subscriptions and native purchase recovery

- **Status:** `planned`. **Purpose:** Normalize Stripe/RevenueCat billing and native purchase/restore into server entitlements.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `IOS11 — Normalized billing lifecycle and web subscriptions`.
- **Canonical implementation:** No runtime implementation yet; use the cited plan.
- **Depends on / reuses:** [AUTH](identity.md#auth), [ENTITLEMENTS](platform.md#entitlements), [HOUSEHOLD](identity.md#household), [JOBS](platform.md#jobs).
- **Used by:** [MARKETING](planned.md#marketing), [RELEASE](planned.md#release), [STAFF](planned.md#staff).
- **Permission / data boundary:** No checkout-success fulfillment, double caps or purchaser-household transfer. Actual provider/store test products and signed-device acceptance remain required.
- **Verification references:** No executable feature acceptance established; the linked plan defines the required evidence.
- **Graphify navigation:** scopes `features; future runtime nodes are absent`; query `BILLING` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_BILLING`.
- **Debug / reuse / limits:** IOS11/12 are planned; entitlement calculation foundations are documented separately. No products, secrets or paid service activation is claimed.

<a id="companion"></a>

## COMPANION — Local companion and grounded insights

- **Status:** `planned`. **Purpose:** Pair an on-device local runtime and expose consented, read-only deterministic tools.
- **Entry points:** [docs/superpowers/plans/2026-11-02-ios-only-delivery.md](../../docs/superpowers/plans/2026-11-02-ios-only-delivery.md) — `IOS13a / IOS13b / IOS13c — Local companion`.
- **Canonical implementation:** [docs/joint-app/05-local-ai-and-projections.md](../../docs/joint-app/05-local-ai-and-projections.md).
- **Depends on / reuses:** [AUTH](identity.md#auth), [ENTITLEMENTS](platform.md#entitlements), [EVENTS](platform.md#events), [HOUSEHOLD](identity.md#household), [JOBS](platform.md#jobs), [REPORTS](finance.md#reports).
- **Used by:** [REHEARSAL](planned.md#rehearsal).
- **Permission / data boundary:** Per-adult consent, five-minute leases, encryption, revocation and no cloud fallback.
- **Verification references:** No executable feature acceptance established; the linked plan defines the required evidence.
- **Graphify navigation:** scopes `features; future runtime nodes are absent`; query `` or inspect the canonical source path. See [coverage and query instructions](graphify.md). The local feature graph uses node ID `feature_COMPANION`.
- **Debug / reuse / limits:** The historical local-model smoke is not a completed pairing/runtime/API/UI or evaluation. Follow IOS13a/b/c sequentially.

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
