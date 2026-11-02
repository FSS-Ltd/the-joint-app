# iOS-only family finance implementation plan

> **For agentic workers:** Use the requested Agents Orchestrator profile for coordination and relevant installed profiles for bounded work. Read both this plan and its spec. Each numbered delivery unit below is a separate branch/PR, not a batch of concurrent PRs. Code Reviewer and Application Security Engineer review before every PR.

**Goal:** Finish the CSV/manual family fund product as an iOS app, with web marketing, subscriptions and staff revenue/retention analytics.

**Architecture:** Retain NestJS, PostgreSQL, Clerk, durable workers and shared TypeScript contracts/domain packages. Add an Expo Router iOS app with focused reusable native components. Web finance remains a temporary reference until verified native cutover.

**Tech stack:** Existing pnpm/Turbo monorepo and pinned tools; Expo React Native, Expo Router and @expo/ui, with compatible versions selected/locked in IOS1. Stripe/RevenueCat integration remains subject to configured test products and later release gates.

**Spec:** [iOS product amendment](../../decisions/ios-only-product.md). Existing financial/projection, privacy, local companion and statement specifications remain binding where not superseded.

## Global constraints

- iOS only for household user journeys; web marketing, billing/account recovery and separately authorized staff analytics.
- CSV/manual read-only finance; no direct connectors, money movement, child profiles or Android in this delivery.
- Reuse existing contracts, exact minor-unit arithmetic, permissions, migration conventions and event infrastructure.
- Native navigation and controls; Expo DOM only for a justified specialist leaf, never an app-wide wrapper.
- No paid services, deployment, live financial data, store upload or third-party messages without existing explicit authority.
- Expo push notifications; CI/CD validation and Xcode for iOS builds/submission preparation, following Oasis. Final review submission requires founder approval. Defer signing/push/store infrastructure until needed; no EAS cloud Build/Submit.
- Every unit requires independent code/security review, local checks, one PR, current required green CI and verified merge before the next begins.
- Keep applicable existing CI; do not remove tests or weaken timeouts/protections to pass.

## Review focus

1. Account/household switches and revoked permissions erase visible cached finance before another actor can read it: IOS2/3/4 tests.
2. Duplicate/out-of-order hints and app suspension do not lose committed changes or create idle polling: IOS3 tests.
3. Web retirement never strands export, deletion, archive, invitation or paid-account recovery: IOS7a/16 tests.
4. Store account reuse, duplicate subscriptions and late refunds cannot transfer rights or double caps: IOS11/12 tests.
5. Staff roles and small cohorts cannot reveal household finance or individual activity: IOS14/15 tests.

## Baseline and sequence

Live predecessor: 3C.5 PR #34 merged at `a1c849918422016b63f427aae3525dec578b939d`. Final head `b7659a3950e9369f95c8b2715f441609beb332dd`; Foundation checks succeeded in run 40415924691. Required test merge `be9253b0afc103af97f65ce9dfdb5849b918f51a` is recorded in its checkout evidence. The old progress tail's local failures remain historical evidence, not current merge status. Phase 3 and MVP are incomplete.

Order is strictly the listed IOS0 through IOS18 units, including each lettered subunit, below. Reading future scope is allowed; scaffolding or implementing later units before the predecessor merge is not. Each implementation unit starts with an exact file/interface brief against the then-current base; later paths are ownership boundaries, not a claim files already exist. Commands proposed for mobile are added and verified in IOS1; do not execute nonexistent scripts as evidence.

### IOS0 — Product amendment and gated PR backlog

**Files:** This plan, `docs/decisions/ios-only-product.md`, `docs/progress.md` and scoped amendment notices in canonical product/architecture/API/commercial/release/phase/handoff/design documents.
**Produces:** Explicit platform, reuse, identity, billing, analytics and delivery boundaries; route inventory below.

- [ ] Record host predecessor evidence and current user decisions without inventing completion.
- [ ] Check local links, formatting, scope consistency and public disclosure. No product runtime change.
- [ ] Obtain Code Reviewer and Application Security Engineer review; correct material findings.
- [ ] Commit, push and open IOS0 PR. Require existing Foundation checks; verify merge before IOS1.

### IOS1 — Runnable iOS shell and reusable visual primitives

**Owns:** `apps/mobile/package.json`, app/Metro/TypeScript configuration, root layout/entry route, `apps/mobile/src/components/`, `apps/mobile/src/theme/`, lockfile and relevant Turbo/lint/CI wiring.
**Consumes:** Semantic palette and native design contract. **Produces:** Native screen container, text, action, amount, notice/loading/empty primitives and one honest no-data entry flow; no fabricated balances or inert tabs.

- [ ] Verify SDK/React/Router/@expo/ui peers from official docs and registry. Choose maintained compatible exact versions; keep web React isolated if required. Document why each dependency is necessary.
- [ ] Add iOS-only config, Expo Router shell, safe areas and native reusable primitives. Do not add Android/web targets, auth stubs or future empty screens.
- [ ] Run frozen install, mobile TypeScript, lint/format, iOS bundle export and Expo compatibility checks. Add CI for these without weakening existing checks.
- [ ] Launch simulator and inspect real shell, enlarged text, contrast and VoiceOver labels; disclose if simulator unavailable. Bundle success alone is not render evidence.
- [ ] Complete reviews and PR/CI/merge gate.

### IOS2 — Native identity, session lock and household onboarding

**Owns:** `apps/mobile/src/features/identity/`, `src/security/`, auth/onboarding routes; narrowly scoped API identity verifier and tests.
**Consumes:** Existing Clerk registry, membership/invitations and MFA contracts. **Produces:** Authenticated native context and verified return handler; no server credentials in app.

- [ ] First reproduce rejected wrong host/path, expired/replayed state, untrusted native audience and revoked registry sessions with synthetic fixtures.
- [ ] Implement maintained Clerk Expo token cache, native signup/login/recovery/MFA, optional partner invite and one-household setup. Preserve ten-minute inactivity and fresh-MFA rules; explicit approved HTTPS/custom return allowlist.
- [ ] Test cold/warm returns, identity change cache clearing, background/resume, expiry and invite acceptance by the wrong adult. Run native tests/types, affected API integrations and device auth flow.
- [ ] Document actual development identities/domain inputs; do not fabricate association files. Review and deliver through gate.

### IOS3 — Typed native API and committed event updates

**Owns:** `packages/client/` only if extraction earns shared use, otherwise mobile `src/api/`; `src/events/`; narrowly scoped API event selectors and lifecycle tests.
**Consumes:** Existing Zod DTOs, bearer verifier, optimistic versions and PostgreSQL notifications. **Produces:** Validated native reads/mutations and authenticated invalidation subscription.

- [ ] Test unauthorized subscription, duplicate/out-of-order signals, grant revocation, interrupted writes and reconnect catch-up before implementation.
- [ ] Implement bounded requests, safe errors, cancellation, idempotency and subscription cleanup. Reconcile startup/foreground/reconnect; event delivery follows commit; coalesce refreshes. No DOM/window/cookie assumptions or periodic state checks.
- [ ] Prove zero idle discovery requests, rollback silence, prompt committed updates, tenant isolation, post-revocation denial and graceful shutdown. Run API/native integration suites and network inspection on simulator.
- [ ] Review and deliver through gate.

### IOS4 — Home and accounts

**Owns:** Native home/accounts feature components and routes; existing API only for demonstrated parity gaps.
**Produces:** Real scoped summary, account list/detail/create/edit, manual valuations, sharing controls and freshness labels, reusing the shared native primitives.

- [ ] Pin empty/private/totals/transactions and stale-version behavior in tests, including account switch and permission-loss cache clearing.
- [ ] Implement lists with virtualization for unbounded data, exact money formatting and explicit owner/sharing/source labels. Keep child-earmarked exclusions and foreign-currency coverage honest.
- [ ] Verify two synthetic adults, offline/error/retry, Dynamic Type and VoiceOver in simulator. Run native, contracts and affected API checks; review and deliver through gate.

### IOS5 — Activity and reviewed CSV import

**Owns:** Native activity/imports features, document picker integration and existing import API adapters.
**Produces:** Search/filter/detail, annotations/splits/transfers, file selection, mapping, preview/rejection/deduplication, commit/history and rollback where supported.

- [ ] Reproduce duplicate submission, invalid currency/date, partial file, permission revocation and interrupted upload in tests.
- [ ] Reuse server parser and review contracts; never reimplement parsing on the phone or auto-commit file selection. Bound upload size and temporary retention.
- [ ] Verify large-list interaction, keyboard, original-file handling and retry without duplicate writes on device. Run affected regression suites; review and deliver through gate.

### IOS6 — Budgets, category caps and month-end review

**Owns:** Native budgets/review features. **Consumes:** Existing spending/cash-flow contracts and domain arithmetic.

- [ ] Pin zero cap, exact cap, overspend, refunds, transfers, incomplete history and saving-plan impact with existing golden fixtures.
- [ ] Implement the existing cap editor, readable progress, coverage and remaining/over-limit feedback as native parity. Complete new saving-plan/goal timeline and leftover confirmation in separate IOS10b after their dependencies merge; no money-transfer implication.
- [ ] Verify keyboard and enlarged text, reduced motion, offline/stale/permission/error states. Run native/domain/API checks; review and deliver through gate.

### IOS7a — Household, security, portability and privacy

**Owns:** Native More/household/security/archive/privacy routes and features; secure file sharing integration.

- [ ] Reproduce revoked adult, expired download, canceled deletion, leave-household and owner archive access; privacy flows remain free after downgrade.
- [ ] Deliver session/device security, invite/revoke, scoped export, archive access, deletion request/status/receipt and recovery. Clean temporary files and sensitive views on background/logout.
- [ ] Verify complete two-adult exit/deletion/recovery journeys and real file access on simulator/device. Run privacy/restore integrations; review and deliver through gate.

### IOS7b — Recurring categories and complete-month baselines (old 3D)

**Owns:** `packages/domain/src/spending/recurring-costs.ts`, scoped category/rule API modules and contracts, native rule/candidate controls within activity/budgets.
**Consumes:** Existing manual records, annotation precedence, source coverage and entitlements. **Produces:** Permission-scoped recurring candidates and explicit 3/6/12 complete-month baseline DTOs for later projections.

- [ ] Pin manual override preservation, irregular cafe false matches, variable bills, transfers/refunds, one-off exclusions and complete zero-income versus missing months before implementation.
- [ ] Implement rule CRUD and deterministic candidate/baseline calculation using existing cadence/precedence specifications. Require confirmation for variable income; paid automatic rule execution and scheduled insights recheck capabilities.
- [ ] Verify cross-tenant/grant revocation, source completeness, exact money, corrected imports and native review/error states. Review and deliver through gate.

### IOS8 — Finish deterministic projection engine (old 3D)

**Owns:** `packages/projections/src/` and independent golden fixtures; existing projection conventions.

- [ ] Write independent fixed-answer tests for every calculation status, month-end/leap dates, HALF_UP, costs, inflation, zero/negative growth and 600-month horizon.
- [ ] Implement pure versioned input/result and stable hashing boundaries. No UI or LLM arithmetic, no invented rate sources.
- [ ] Require reproducibility, conservation and monotonicity checks plus all existing finance suites. Review and deliver through gate.

### IOS9 — Projection persistence and permission-safe API (old 3E backend)

**Owns:** Narrow projection/scenario API service/repositories, scoped migrations if necessary and versioned contracts.

- [ ] Reproduce cross-tenant reads, stale source/grant versions, replay and concurrent allocation/source changes.
- [ ] Persist immutable runs with engine/input/source provenance, basic free and advanced capability checks; invalidation after committed changes.
- [ ] Verify populated upgrades, revocation, retained history and signed restore. Review and deliver through gate.

### IOS10a — Wealth, goals, contributions and projection experience

**Owns:** Native wealth/goals/scenarios features and routes. **Consumes:** Merged 3B/3C APIs and IOS8/9 engine/API; reuse components from IOS4/6.

- [ ] Test totals-only scope, allocation overcommit, shared capacity shortfall, archived goals, stale edits and unsupported projection inputs.
- [ ] Implement wealth, goal lifecycle, funding evidence, atomic allocations, dated contribution plans and reachable-date/scenario explanations. Preserve manual intention versus executed money distinction.
- [ ] Verify exact figures, textual chart alternatives, source dates and stale/empty/offline/error states on device. Review and deliver through gate.

### IOS10b — Savings impact and goal timeline feedback (separate cap-extension PR)

**Owns:** Native budget/review feedback and eligible goal-allocation confirmation; narrow domain/API changes only where needed.
**Consumes:** IOS6 budgets, IOS7b baselines, IOS8/9 projections and IOS10a goal/funding APIs.

- [ ] Pin £50/£35, £50/£50 and £50/£65 cap states; confirmed £200 saving with £15 net overspend yields qualified £185, with underspend offsets and no duplicate deduction across goals.
- [ ] Show amount-only feedback when goal inputs are insufficient; do not invent disposable cash or dates from cap remainder. Test zero/no cap, net refunds, partial history and revoked source evidence.
- [ ] At month end, offer a user-chosen eligible amount/goal only after sufficient coverage and explicit confirmation. Recheck settled funds, source control, bills/reserves, allocation limits and stale versions; no transfer/trade or observed contribution is created.
- [ ] Keep ordinary cap/saving feedback free, gate only explicit advanced scenarios, verify accessibility/reduced motion and complete independent reviews/PR gate.

### IOS11 — Normalized billing lifecycle and web subscriptions

**Owns:** Server billing contracts/reducer/storage/webhooks, bounded worker handlers and web pricing/Checkout/portal routes.

- [ ] Pin signatures, sandbox/production separation, replay/out-of-order events, expiry/grace, cancel/refund and immutable purchaser-household binding first.
- [ ] Implement Stripe/RevenueCat normalization and server-selected products/return URLs. No success-page fulfillment or double-counted caps; due-time expiry/retry, startup/event reconciliation and documented exceptional provider fallback only.
- [ ] Verify downgrade preserves free privacy/history, duplicate checkout, multiple funding sources and refunds; use provider test fixtures/configuration only. Missing products/secrets block activation, not truthful tests. Review and deliver through gate.

### IOS12 — Native purchase, restore and entitlement recovery

**Owns:** Native billing feature/routes and platform purchase adapter.

- [ ] Test canceled/pending purchases, delayed verification, duplicate funding, different login with same Apple account and restore without another charge.
- [ ] Implement localized native product prices, annual total, dismissal, restore and correct management destination. Do not sell undelivered benefits or steer UK iOS to unapproved web checkout.
- [ ] Verify sandbox purchase/restore on required signed device environment; missing signing/store products remain an explicit public-release blocker. Review and deliver through gate.

### IOS13a / IOS13b / IOS13c — Local companion (three sequential PRs)

**Owns:** Companion app/runtime, API consent/jobs/evidence and native pairing/insights. IOS13a owns protocol/consent/jobs, IOS13b owns runtime/grounded tools, IOS13c owns native pairing/insights and evaluation. Each is a separate PR and inherits the same gate; no successor work begins before its predecessor merges.

- [ ] Preserve separate per-adult device disclosure consent, fresh authorization, five-minute leases, encryption, revocation and deterministic read-only tools.
- [ ] Use event wakeups and due-time retries; no standing job scans. Deliver native waiting/offline/cancel/evidence states; no cloud fallback.
- [ ] Run malicious-input/revocation fixtures and the existing 100-request, three-run model evaluation plus real hardware latency/memory tests. Missing model/device evidence blocks completion; no fabricated benchmark. Review and deliver through gate.

### IOS14 — Staff authorization and minimal analytics collection

**Owns:** Explicit staff role/API boundary, lifecycle event contracts, aggregate projection/storage and tests.

- [ ] Test regular adult/purchaser denial, revoked staff subscription, cross-role access and sensitive payload rejection.
- [ ] Implement audited least-privilege staff authority and durable versioned lifecycle/billing events with opaque identifiers. Server commits before notification, consumes idempotently and bounds retention/deletion.
- [ ] Pin metric definitions from the amendment with independent fixtures, denominator zero, test/sandbox exclusions, event replay and late refunds. Record actual data flows/regions and production legal-basis gate. Review and deliver through gate.

### IOS15 — Staff revenue, churn and retention dashboard

**Owns:** Web `staff` routes, focused metric/chart/table/filter components and staff API clients.

- [ ] Test unauthorized direct URL/API access, mandatory server-side suppression in cohort responses/totals, complementary totals and adjacent-query differencing, missing source data and period boundaries. Never send suppressed values to clients; restrict overlapping filters to prevent reconstruction.
- [ ] Show paid households, MRR, refunds/net collected revenue, activation and retention cohorts, churn with explicit units/denominators/timezone and freshness. No invented production numbers or household finance drill-down.
- [ ] Verify accessible chart tables, bounded filters, role revocation and committed updates without polling. Inspect real in-app browser at narrow/wide widths; review and deliver through gate.

### IOS16 — Marketing and web household cutover

**Owns:** Web public content/navigation, old finance routes and compatibility redirects; canonical route docs.

- [ ] Inventory every current route against IOS4–10 and IOS7a privacy support, test invitations/deep links, billing login/recovery and required legal/privacy URLs.
- [ ] Build truthful marketing around delivered features and subscription management. Retire desktop household pages/PWA affordances only after native parity and recovery evidence; keep API and required billing/security/privacy endpoints. Redirect safely without exposing data or breaking old links.
- [ ] Verify no public staff data, no finance payload in public caches and no broken exports/deletion/account recovery. Review and deliver through gate.

### IOS17a / IOS17b — Statement conversion and rehearsal (two sequential PRs)

**Owns:** Statement extraction/review modules and native document/review UI; existing STMT1 decision governs exact paths at entry.

- [ ] Build local bounded PDF/OCR extraction, explicit review/correction and handoff to existing CSV import. No cloud statement upload or universal coverage claim.
- [ ] Pin scanned/native PDF precision, malformed/encrypted files, duplicates, source provenance and temporary-file cleanup; then verify real approved samples within privacy gates.
- [ ] Complete the one-month founder rehearsal, independent totals/projections, recovery and consent tests. IOS17a delivers converter; IOS17b delivers rehearsal evidence only after IOS17a merges. Waiting for elapsed rehearsal is a real gate. Review and deliver each through gate.

### IOS18 — Physical-device, commercial and release readiness

**Owns:** iOS security/device evidence, release configuration, store/privacy copy and runbooks.

- [ ] Verify supported real devices/OS, secure storage, app snapshots/background locking, accessibility, deep links, offline/reconnect, purchases, logout/revocation and data portability.
- [ ] Inspect Oasis build/release reference, then add required CI/CD native build/signing validation using Xcode. Android Studio is reserved for a separately approved Android scope; no EAS cloud Build/Submit. Defer this release machinery until needed.
- [ ] Add Expo push delivery only when a real user flow needs it; test permission denial, token rotation/unbind, tenant isolation, generic payloads and authorized cold/warm deep links.
- [ ] Complete provider-independent commercial/legal/privacy evidence, truthful paid benefits, signing/App Store products and operating cost gates. No invented approval or additional spend.
- [ ] Run full build/type/lint/unit/integration/device suites, restore drill and release rollback plan. Raise readiness PR with exact unmet gates.
- [ ] Deployment/store submission needs explicit approval after concrete readiness evidence. The founder must give final review-submission approval; CI/CD must stop at that gate and source merge cannot submit an app.

## Existing route inventory and ownership

| Existing Next page routes                                                                                        | Native destination / owning unit      | Final web disposition                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| `/`, `/sign-in`, `/sign-up`, `/sign-out`, `/recovery`, `/auth/callback`, `/auth/complete`, `/auth/task/password` | Native identity IOS2                  | Marketing root plus billing/staff authentication and recovery where needed |
| `/dashboard`, `/accounts`, `/accounts/[id]`                                                                      | Home and Accounts IOS4                | Retire family workspace in IOS16                                           |
| `/activity`, `/activity/[transactionId]`, `/imports`, `/imports/[batchId]`                                       | Activity and Imports IOS5             | Retire family workspace in IOS16                                           |
| `/budgets`, `/review`                                                                                            | More/budgets and review IOS6          | Retire family workspace in IOS16                                           |
| `/household`, `/join`, `/security`                                                                               | More/household/security IOS2/7a       | Preserve verified invitation/recovery handoff where required               |
| `/archive`, `/settings/privacy`, `/privacy/deletion`                                                             | More/privacy/archive IOS7a            | Preserve required privacy/recovery support through cutover                 |
| No current wealth/goals/scenario pages                                                                           | Wealth/Goals IOS10a                   | Do not build new desktop family screens                                    |
| Future billing/pricing and staff pages                                                                           | Web IOS11/15/16; native billing IOS12 | Retain                                                                     |
| `/api/**`, manifest and service worker assets                                                                    | Not native screens                    | Audit individually; Nest API stays, remove family PWA behavior in IOS16    |

## Reuse map and verification procedure

Use `packages/contracts`, `packages/domain`, `packages/projections` and `packages/entitlements`; keep `packages/database` server-only. Native feature modules share actual screen primitives, field feedback, exact money presentation and state views; avoid a universal HTML/native component layer. Reuse backend business rules, never browser cookie/session hooks. Extract only proven common behavior.

Before each PR run relevant repository commands: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, plus affected integration suites. Native units add their verified bundle/doctor/component/device checks from IOS1. Docs-only units need formatting, links, scope/disclosure and diff review locally; full existing Foundation CI still applies. Use only the Codex in-app browser locally. Existing explicitly authorized cloud CI remains unchanged.

Record step ID, branch, PR URL, head and test-merge/queue revisions, applicable CI conclusions, reviews, merge commit and next permissible action in `docs/progress.md`. Do not mark any unchecked delivery unit complete until actual host merge and acceptance evidence exist. Record unavailable simulator/device/provider checks separately from green source CI.
