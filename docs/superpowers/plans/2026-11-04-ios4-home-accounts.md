# IOS4 Home and accounts implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development, one implementation task at a time, with independent task reviews and final whole-branch Code Reviewer and Application Security Engineer reviews. These four internal tasks form one IOS4 branch/PR. IOS5 cannot begin before current IOS4 CI passes and its actual merge is verified.

**Goal:** Deliver real, permission-scoped native Home and account list/detail/create/edit/valuation/sharing journeys on iOS and Android.

**Architecture:** Reuse the existing Clerk/identity gates, one NativeTransport, NativeResourceController, account services, WealthService and exact domain money functions. Add a narrow wealth observation/deadline boundary and native adapters, then focused finance lifecycle hooks and real Expo Router screens. Financial calculations and authorization remain server-side.

**Tech stack:** Existing pinned Expo SDK58, React Native, Expo Router, universal @expo/ui, NestJS/PostgreSQL and TypeScript contracts. Mobile may add the existing @joint/domain workspace dependency for canonical formatting/input conversion; no new external dependency is planned.

**Spec:** [Approved product amendment](../../decisions/ios-only-product.md), [ordered IOS4 unit](2026-11-02-ios-only-delivery.md), [approved visual contract](../../design/DESIGN.md). This is an exact implementation refinement within the previously approved autonomous native delivery approach, not a new product-design approval round.

## Global constraints

- Start from verified IOS3 merge `874e15260eff07bb8e56548269c3efefc82a6252`, PR41. Preserve all private acceptance worktrees, journals/tickets/provider identities and ignored evidence; no repeated real-provider handoff or second real adult.
- iOS first, Android functionality required. No Chrome, Android Studio launch/status loop, paid service, deployment, production configuration, store submission or EAS cloud operation.
- Read/update FEATURE_TREE and bounded Graphify maps; source and tests remain authoritative. Parent owns maps/progress; workers own only assigned task paths.
- Home uses existing wealth valuation summaries, with honest selected/visible scope, dates, adult-portion exclusions and GBP boundary. Spending, activity, savings/projection and privacy expansions remain their later ordered units; no placeholder destinations or fabricated balances.
- Events follow committed changes. No idle database/API discovery polling. The next Europe/London midnight is a known summary-date expiry, scheduled once per active observer; startup/foreground/reconnect reconcile through existing subscriptions.
- Use native controls, existing tokens/primitives, 6-point content corners, 8-point actions, safe areas and enlarged text. Universal @expo/ui controls need Host; use FlatList for account data, without nesting it in Screen's ScrollView. No DOM component is needed.
- All financial deeplinks pass the complete existing identity decision chain, including provider tasks, quarantine, lock, MFA and household setup. Preserve invitation/security access through More.
- Aborts and authority invalidation must fence work before late token/read/write continuations can publish or dispatch. Events never grant access. No automatic mutation replay or silent version/key replacement.

## Review focus

1. Hidden/removed accounts and stale provider/household/grant scopes never remain visible after route, actor or permission changes: Tasks2–4.
2. Summary changes outside the current account page and date-only stale crossings remain live without periodic discovery: Task 1.
3. Empty, unknown-adult, child-earmarked, unsupported-currency and beyond-int64 aggregate values remain honest: Tasks1/3/4.
4. Dispatched writes with lost responses, stale account/sharing versions, MFA expiry and duplicate taps cannot silently duplicate or overwrite: Tasks2/4.
5. Large account scopes, route blur/background, offline recovery and maximum text/VoiceOver do not leak data, strand navigation or keep hidden requests running: Tasks2–4.

## Reuse decisions

- No new Home calculation service: WealthService already returns authorized adultNetWorth/liquidAdultAssets, source versions, completeness and exclusions. A new native read adapter is needed; the existing account-page fingerprint cannot observe the entire summary.
- Account list and summary selection are separate scopes. Show 50-row live pages with explicit next/previous controls and a virtualized list; discard account data on page replacement. Do not accumulate stale earlier pages under one bounded-page subscription. All accounts remain reachable. A future continuous collection would need a demonstrated collection-observation contract, not extra idle reads or one stream per row.
- All-visible summary scopes above 50 require explicit selection of 1–50 accounts, using existing canonical scope schemas. Never call the first page a household total.
- Use formatMoney/parseMoneyInput for int64 account values and formatAggregateMoney from @joint/domain/cash-flow for wider summary amounts. Never narrow aggregate totals through moneySchema or Number.
- Preserve the browser implementation. Reuse contracts/domain/server behavior; browser DOM/cookie hooks are unsuitable for native lifecycle.

## Task 1 — Summary observation and native adapters

**Owns:** `packages/contracts/src/events.ts`; `apps/api/src/modules/wealth/wealth.service.ts`; event resource/wiring files; `apps/mobile/src/api/accounts.ts`, new `api/wealth.ts`; native event scope/stream selector guards; focused tests. No UI or identity lifecycle changes yet.

**Interfaces:**

- Add selector `{kind:"wealth", householdId:string, accountIds?:string}`. Canonicalize its optional comma-separated scope with `scopeQuerySchema.transform(ids => ids.join(","))`; shared statusSubscriptionQuery remains the serializer. Duplicate/unknown query fields remain rejected.
- `WealthService.observe(context:AuthContext, accountIds?:readonly string[]):Promise<{summary:WealthSummaryDto;nextChangeAt:number}>`; read and observe use one private evaluation and the existing pre-return scope recheck. Database statement time supplies both London date and next London midnight, including DST.
- StatusResources fingerprints summary fields excluding volatile calculatedAt, including date, source/scope/grant revisions and exclusions; resourceExpiresAt is nextChangeAt. One WealthService instance serves controller and events.
- `createWealthApi(transport:NativeTransport)` returns `read(householdId:string, accountIds:readonly string[]|undefined, signal:AbortSignal):Promise<WealthSummaryDto>`. Validate/canonicalize IDs and serialize with URLSearchParams; do not send an empty scope.
- Add `AccountsApi.value(householdId:string, accountId:string, input:ValuationInput, key:string, expectedVersion:number, signal:AbortSignal):Promise<AccountResponse>` using existing valuationInputSchema, POST valuations, idempotency key and account If-Match.
- NativeResourceScope/readNativeStatusStream admit wealth alongside account/accounts; their lifetime/error rules remain unchanged.

- [x] Write RED cases in `tests/status-resources.test.ts`, `native-accounts-api.test.ts`, new `native-wealth-api.test.ts` and `wealth-status.integration.ts`: canonical scope/serialization; selected/invisible/>50 scopes; volatile-clock silence; outside-page committed change; rollback and cross-tenant silence; revoked grants; known date deadline and cleanup.
- [x] Pin London deadline behavior with independent spring/fall DST answers. Confirm resource expiry wakes once and reauthorizes; keepalives and unchanged intervals cause no discovery reads.
- [x] Implement the interfaces by extending canonical services/transport, without a migration, duplicate money calculation or generic broadcast feed.
- [x] Run focused unit/contract/native checks, package/root-test types and scoped lint/format. Reuse an independently reviewed owned synthetic database runner or CI; never use local private env wrappers. Record actual database checks separately from mocked units.
- [x] Reopen changed files, self-review, commit Task 1 and obtain independent acceptance before Task 2.

## Task 2 — Finance authority and lifecycle integration

**Owns:** Small native `features/finance/{context,scope,use-resource,use-mutation,errors}` modules; narrow identity context/controller/runtime/api/gate changes; native authored-source fixtures/tests. No financial routes or unfinished navigation yet.

**Interfaces:**

- `createIdentityApiFromTransport(transport:NativeTransport):IdentityApi`; existing createIdentityApi(baseUrl,getToken,send?) remains a compatibility wrapper. IdentityRuntime constructs one transport and composes adapters once.
- Add `VerifiedNativeIdentity={readonly actor:string;readonly me:MeResponse}` and `NativeIdentityController.getVerifiedIdentity():VerifiedNativeIdentity|null`, returning data only for the controller's verified ready actor. Expose a narrow bridge with transport, this getter, existing subscribe and captured-actor revoke; do not expose token getters or duplicate identity state.
- `NativeFinanceAuthority=Omit<NativeResourceScope,"selector">`; capture it only from the current verified ready membership, with provider actor, internal user/membership/household IDs and grantVersion. Key every resource and form by that full authority plus selector/target.
- `NativeFinanceProvider({me,children})` composes accounts/wealth adapters and identity reconciliation/revocation. Subscribe directly to identity invalidation so cancellation does not wait for a React effect. Do not publish a fresh uncached object from a useSyncExternalStore getter.
- `useFinanceResource<T>(selector, read:(scope:NativeResourceScope, signal:AbortSignal)=>Promise<T>)` returns a discriminated loading/ready/error snapshot and explicit retry. Reuse NativeResourceController; use focus cleanup and immediate isFocused/key masking, plus real AppState abort/concealment.
- `useFinanceMutation<T>(targetKey:string)` returns discriminated idle/pending/success/error/uncertain state, `submit(execute:(signal:AbortSignal)=>Promise<T>)`, deliberate `retry()` and `reset()`. Retain only the same captured operation within its authority/target/focus lifetime; clear/abort on loss. UI captures immutable payload/key/version before submit. No automatic retry.
- Add optional `ready?: (me:MeResponse)=>ReactNode` to ConfiguredEntry/IdentityEntry, invoked only after the existing full decision chain; household-required still renders AccountScreen.

- [x] Write RED authored-source tests in new `native-finance-authority.test.ts`, `native-finance-resource.test.ts`, `native-finance-mutations.test.ts` and existing identity gate/runtime tests.
- [x] Pin immediate provider/household/grant/account replacement, route blur/background, late token/read/write completion, captured401 versus resource403/404, coalesced hints and zero idle calls. A grant success refreshes identity and discards old cursors; permission loss reconciles authority once without an obsolete-cursor retry loop.
- [x] Implement the interfaces. Unknown dispatched writes remain uncertain; retries reuse the captured inputs. A new post-lifecycle attempt requires fresh authorized reads and user confirmation, not hidden replay. Map safe actionable version/MFA/scope/idempotency errors without upstream text.
- [x] Run native and identity regressions, relevant types, lint/format; inspect imports/exports and self-review. Commit and obtain independent acceptance before Task 3.

## Task 3 — Native Home, account reads and real navigation

**Owns:** Thin native route files; `features/navigation/landing-entry.tsx`; workspace Tabs/Home Stack; focused `features/home/` and account list/detail/labels/row/scope-selection files; a non-scrolling Screen variant; mobile workspace dependency/lockfile and UI tests. Write screens/affordances belong Task 4.

**Routes:** `app/(workspace)/_layout.tsx` gates actual Tabs through ConfiguredEntry.ready; functional Home and More only. `home/_layout.tsx` is a real Stack; `home/index.tsx`, `home/accounts/index.tsx` and `home/accounts/[accountId]/index.tsx` are thin screen/parameter boundaries. `more.tsx` reuses AccountScreen. Root landing redirects verified ready members to `/home`; retain invitation handling and all existing public auth-return checks/paths. No manual navigation state machine.

- [x] Write RED UI/source tests for no-account and populated states; NONE/TOTALS/TRANSACTIONS; owner labels; malformed/array route IDs; focus loss; >50 explicit summary selection; live page replacement; stale and unknown-adult evidence; aggregate `9223372036854775808` formatting beyond int64.
- [x] Add the existing @joint/domain workspace dependency and reuse its pure exports. Extend Screen with a default-preserving `scrollable?:boolean`; FlatList uses the non-scroll body, stable keys and explicit page controls. Do not nest a virtualized list in ScrollView.
- [x] Implement Home with server valuation totals, completeness/exclusion/date labels and real Accounts access. No fake spending/saving/activity cards. Summary selection is canonical and limited1–50; no empty-array/all-visible ambiguity or silent page-only total.
- [x] Implement account list/detail and More navigation. Only owned accounts expose edit/value/share affordances once Task 4 supplies their routes. TOTALS never exposes transaction detail; full activity UI remains IOS5. Freshness uses source dates/server exclusions, not phone-side financial calculations.
- [x] Verify existing identity/session routes, list keys, enlarged text/source-harness accessibility names and navigation gating. Run all native tests/types, lint/format and both exports/Expo checks. Commit and obtain task review before Task 4; exports are not native render proof.

## Task 4 — Account writes and actual native acceptance

**Owns:** Focused account create/metadata/valuation/sharing screens, input/feedback helpers and their thin routes (`new`, `[accountId]/edit`, `/valuation`, `/sharing`); necessary owner action links; focused regressions and reviewed synthetic UI acceptance tooling. Parent owns final maps/progress/delivery.

- [x] Write RED cases for duplicate taps/uncertain retries, stale account and grant versions, server MFA expiry, owner versus viewer actions, invalid amounts/dates/adult portions, authority loss and user-draft handling.
- [x] Implement immutable submitted DTO/key/version capture. Create/value use UUID keys; edit/value use account.version; sharing targets only account.sharing.membershipId and uses sharing.version. Never infer partner authority from member counts. Retain same-lifetime intent on deliberate retry; no key regeneration or auto-resubmit.
- [x] Reuse native controls/fields and SecurityScreen for actual MFA reauthentication, then reload account/grant before another deliberate submission. Sharing success refreshes identity before revealing results. No partner presents a real invitation path through existing More, not an unusable sharing control.
- [x] Value forms use exact parseMoneyInput. Assets may be signed; debts use nonnegative outstanding balance. Adult portion is explicitly attested; unknown portions remain excluded and liabilities require the full debt. Do not copy the old web form's omission of adultMoney. Do not invent future valuations or currency conversion.
- [x] Preserve drafts only within the same authorized target. Mask while authority is rechecked, reject stale base versions, and require explicit reload/confirmation; never silently overwrite a draft/version after an event. Clear sensitive forms on route/background/authority loss and re-read before a new attempt.
- [ ] Prepare an owned synthetic native proof importing actual screens/hooks/routes. Before any API/Metro/device launch, obtain exact-source code/security review of ownership, loopback/config preservation and cleanup. Reuse verified official client and existing process primitives; never reset/update existing devices or repeat private provider flows. Prove two synthetic adults, ownership/sharing loss, creation/edit/value, stale/MFA/uncertain/offline recovery, route/background zero work, real navigation, Dynamic Type and VoiceOver. Report any unavailable platform/physical check explicitly.
- [ ] Run all unit/package/test types, lint/format/build, affected synthetic integrations, both platform exports, dependency alignment/Doctor, relevant web compatibility regressions and actual native proof. Reopen every changed file and self-review. Refresh affected Graphify scopes and source-backed feature entries, removing stale edges.
- [ ] Obtain final independent whole-branch Code Reviewer and Application Security Engineer approval. Fix complete findings in one wave, scoped re-review, then publish one IOS4 PR. Verify current Foundation and Native jobs/test merge and actual protected merge before IOS5. Record exact revisions/checks/merge and limitations in progress/PR.

Source preparation through `03a690e` is independently accepted after fix round1: 313 covering native/identity cases and both exports pass. The five checked items describe the source implementation; actual native interaction, provider/physical coverage and the three remaining acceptance/delivery items are not complete. The reviewed fixture is being extended to exercise paged large scopes and measure rejected request attempts before its next exact-source review.

The first actual native run subsequently failed valuation-detail rendering in shared BigInt/Intl formatting. Financial400 feedback and missing import-only dependency freezing also require fixes. Fix2 source is committed at48252ba: portable exact GBP formatting is reused by both public money paths, and known rejected400 input guides explicit correction/reload. Worker reports812 unit tests/113 files,12 direct type-check projects and both exports passing. Both independent fix2 reviews approve product source. Fix3 closes N3 with actual package-root binding, regular same-root metadata and a sensitive pure regression; both scoped independent reviews approve exact89ba/61fe tooling. Actual re-test remains pending; prior source preparation approval does not override failed native acceptance.

## Evidence and implementation boundaries

Parent preflight verified PR41/head/checks/actual merge from GitHub; the new checkout is its identical tested tree. The reuse audit verified 494 selected runtime hashes and followed canonical Graphify/source references. The baseline had 46 features; planned NATIVE_HOME and NATIVE_ACCOUNTS entries make 48 before implementation. No current UI implementation is implied.

Existing tests are authored-source behavioral evidence, not a native renderer. Synthetic PostgreSQL tests prove real account/summary authorization and commit behavior; an in-memory UI origin proves native interaction/transport only. Keep those claims separate. Physical battery measurement, real-provider acceptance, Android device runtime, store and production gates are not established by exports or source CI.

The parent chose live paged lists to preserve current bounded-page observation semantics and a single visible-page subscription. If a later UX requires continuous cached pages, add a demonstrated collection invalidation boundary; do not silently serve stale earlier pages. The parent chose existing wealth valuation summaries rather than a duplicate Home calculator; if later Home requirements need spending/savings, extend it in the already ordered dependent units.

## Framework and design references checked

- [Expo SDK58 universal UI](https://docs.expo.dev/versions/v58.0.0/sdk/ui/universal/): use the installed package declarations for exact props; no version upgrade is proposed.
- [Apple lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables) and [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility): native review references alongside the approved product contract, not a claim of HIG compliance.
