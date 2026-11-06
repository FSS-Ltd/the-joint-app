# IOS5 Activity and reviewed CSV import implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development, one implementation task at a time, with independent task reviews and final whole-branch Code Reviewer and Application Security Engineer reviews. These internal tasks form one IOS5 branch/PR. IOS6 cannot begin before current IOS5 CI passes and its actual merge is verified.

**Goal:** Deliver permission-scoped native activity list/detail, search, filters, annotations, splits and transfers, plus reviewed CSV import with explicit mapping, preview, rejection handling, commit, history, rollback and original-file deletion.

**Architecture:** Reuse the existing transactions, transfers and imports controllers, their Zod contracts and the server CSV parser. Extend the shared status protocol with one bounded transaction-page observation, then assemble native adapters on the existing `NativeTransport` and IOS4 `NativeFinanceProvider`/resource/mutation hooks. No parsing, money arithmetic or authorization moves onto the phone.

**Tech stack:** Existing pinned Expo SDK58, React Native, Expo Router, universal @expo/ui, NestJS/PostgreSQL and TypeScript contracts. One new mobile dependency, `expo-document-picker` at the SDK58-compatible version, is required for file selection and must be verified before it is added.

**Spec:** [Approved product amendment](../../decisions/ios-only-product.md), [ordered IOS5 unit](2026-11-02-ios-only-delivery.md), [approved visual contract](../../design/DESIGN.md).

## Global constraints

- Start from host-verified IOS4 merge `58f6c24190401d33e1bc6c6716f45022a1f2fdac` (PR42). IOS4's partial native matrix and missing whole-branch review are recorded as open gaps; this unit neither closes nor retroactively accepts them.
- iOS first, Android functionality required. No Chrome, Android Studio launch/status loop, paid service, deployment, production configuration, store submission or EAS cloud operation.
- Read/update FEATURE_TREE and bounded Graphify maps; source and tests remain authoritative. Parent owns maps/progress; workers own only assigned task paths.
- Events follow committed changes. No idle database/API discovery polling. Activity and import pages observe their own bounded scope; startup/foreground/reconnect reconcile through existing subscriptions.
- Preserve exact integer money, shared contracts, idempotency, `If-Match` versions and permission boundaries. No `Number` coercion of financial values; use `formatMoney`/`parseMoneyInput` and `formatAggregateMoney` only where their existing boundaries apply.
- Reuse existing native controls, tokens, 6-point content corners, 8-point actions, safe areas and enlarged text. No DOM component is needed.
- The server remains the only CSV parser and the only place rows are accepted or rejected. File selection never commits; review decisions and commit are separate explicit steps.
- Aborts and authority invalidation must fence work before late token/read/write continuations can publish or dispatch. No automatic mutation replay or silent version/key replacement.

## Review focus

1. A shared or revoked account never exposes activity, import rows or original files after route, actor or permission changes: Tasks 2–4.
2. Committed activity, classification, split and transfer changes appear without periodic discovery, and unchanged/rollback/cross-tenant state stays silent: Tasks 1–3.
3. Rejected CSV rows, invalid currency/date, partial files, duplicates and replayed previews stay honest and cannot commit twice: Task 4.
4. Large result sets, keyboard entry, background/route blur and offline recovery do not lose reviewed decisions, strand navigation or keep hidden requests running: Tasks 2–4.
5. Import history, rollback and original-file deletion remain bounded, owner-scoped and free of retained file content: Task 4.

## Reuse decisions

- Activity is per-account. `transactionListQuerySchema.accountId` is required and the web activity page selects an account through the shared finance scope, so native activity starts from the existing account choice instead of a new household-wide feed. Do not add a server endpoint for parity that the contract does not already define.
- `statusSubscriptionSchema` has no transaction page kind, and the web activity list refreshes through a local revision counter. One bounded `transactions` selector plus a fingerprint over the current page is the smallest live-update boundary; do not add per-row streams or a generic household broadcast.
- `import` already exists as a status kind for batch progress; reuse it for queued/previewing/committing transitions rather than polling the batch.
- Reuse `MAX_CSV_BYTES`, `MAX_CSV_ROWS`, `csvInspectionSchema`, `csvMappingSchema`, `importReviewSchema` and `importCommitSchema`. Reject oversize files locally before upload and keep no second copy of the original beyond the attempt.
- Reuse the IOS4 `useFinanceResource`/`useFinanceMutation` lifecycle, `NativeFinanceAuthority` keys and `Screen`/`FlatList` split. Do not create a second authority model or a parallel mutation store.
- Preserve the browser implementation. Reuse contracts and server behavior; browser cookie/session hooks remain unsuitable for native lifecycle.

## Task 1 — Bounded activity page observation and native adapters

**Owns:** `packages/contracts/src/events.ts`; event resource/wiring files; `apps/api/src/modules/transactions/transaction-queries.ts` (observation only); `apps/mobile/src/api/transactions.ts`; native resource scope/stream selector guards; focused tests.

**Interfaces:**

- Add selector `{kind:"transactions", householdId:string, ...transactionListQuerySchema.shape}`. Serialization stays `statusSubscriptionQuery`; `accountId` remains required, filters remain the canonical parsed values, and duplicate/unknown query fields remain rejected.
- `TransactionQueries.observe(context:AuthContext, accountId:string, filterKey:ActivityFilters):Promise<{page:{items:TransactionResponse[];nextCursor:string|null};nextChangeAt:number|null}>` reuses the existing list evaluation and the pre-return scope recheck; it adds no second query path and no known expiry unless one exists.
- Status resource fingerprints the page identity and the ordered `(id, version, classificationConfirmed, money, bookedDate, note.version)` facts plus account access and grant revision; volatile timestamps stay excluded.
- `createTransactionsApi(transport:NativeTransport)` exposes `list`, `read`, `create`, `patch`, `annotate`, `replaceSplits` and `transfer` using the existing controllers and contracts, with `If-Match` and idempotency keys supplied by the caller.
- `NativeResourceScope`/`readNativeStatusStream` admit `transactions` alongside `wealth`/`account`/`accounts`; their lifetime and error rules are unchanged.

- [ ] Write RED cases for canonical selector/serialization, required `accountId`, filter fingerprints, committed out-of-page change, rollback and cross-tenant silence, revoked grants, cursor rejection, and unchanged-page/idle silence.
- [ ] Implement the selector, observation and adapters by extending existing services; no migration, no duplicate money calculation, no generic feed.
- [ ] Run focused unit/contract/native checks, package/root-test types and scoped lint/format. Record actual database checks separately from mocked units.
- [ ] Reopen changed files, self-review, commit Task 1 and obtain independent acceptance before Task 2.

## Task 2 — Native activity list, search, filters and detail

**Owns:** Thin native activity routes; `apps/mobile/src/features/activity/` list, row, filters, detail and paging modules; focused UI/source tests.

**Routes:** `app/(workspace)/activity/_layout.tsx` as a real Stack; `activity/index.tsx` and `activity/[transactionId]/index.tsx` as thin parameter boundaries, reachable from the existing Home/More navigation without adding placeholder tabs.

- [ ] Write RED UI/source tests for no-account, empty account, populated list, search, month and classification filters, uncategorized filter, malformed/array route IDs, cursor paging, owner versus viewer affordances, TOTALS/TRANSACTIONS visibility and stale-page replacement.
- [ ] Implement the account choice, virtualized list and detail using existing primitives and the Task 1 observation. Search and filters are explicit inputs, never background discovery; page replacement discards earlier pages.
- [ ] Show source, owner/sharing, classification, split and transfer facts from the server projection. Do not invent categories, merchant data or financial calculations on the device.
- [ ] Verify keyboard/return handling, enlarged text, accessibility names, focus loss and offline/stale/error states. Run native tests/types, lint/format and both exports. Commit and obtain independent acceptance before Task 3.

## Task 3 — Annotations, splits and transfers

**Owns:** Focused native activity write modules and their route/action wiring; focused write-intent and recovery tests.

- [ ] Confirm the exact existing transfer route and DTO from `apps/api/src/modules/transfers/transfers.controller.ts` at brief time; reuse it rather than adding a native-only endpoint.
- [ ] Write RED cases for duplicate submission, stale version, note `noteVersion`, split totals that do not balance, transfer eligibility, viewer denial, permission revocation during the write and uncertain responses.
- [ ] Implement immutable payload/key/version capture, deliberate retry, explicit reload and reset, reusing the IOS4 write boundary. No automatic replay, no silent version replacement, no client-side reclassification rules.
- [ ] Verify committed changes arrive through the Task 1 observation, and that failed or rollback states stay silent. Run affected native/API suites, lint/format and both exports. Commit and obtain independent acceptance before Task 4.

## Task 4 — Reviewed CSV import, history and rollback

**Owns:** `apps/mobile/src/features/imports/`, thin import routes, document-picker integration and focused import tests; the new dependency and lockfile entry.

- [ ] Verify the SDK68-compatible `expo-document-picker` version from official Expo SDK58 documentation and the installed SDK before adding it; record why it is necessary. No other new dependency.
- [ ] Write RED cases for oversize file rejection, unsupported type, cancelled selection, invalid currency/date, partial file, duplicate preview submission, stale review version, commit with rejected rows, interrupted upload, rollback and expired original.
- [ ] Implement file selection → inspect → explicit mapping → preview → review decisions → commit → history → rollback/delete-original. Bound bytes before upload, keep no original beyond the attempt, and never auto-commit on selection.
- [ ] Keep rejected and duplicate rows visible with their exact reason codes; do not silently drop or rewrite them. Reuse the `import` status kind for progress.
- [ ] Verify large-row review interaction, keyboard, original-file handling and retry without duplicate writes. Run imports integration tests, native tests/types, lint/format and both exports. Commit and obtain independent acceptance before Task 5.

## Task 5 — Actual native acceptance and delivery

- [ ] Prepare an owned synthetic proof importing actual activity/import screens, hooks and routes. Before any API/Metro/device launch, obtain exact-source code/security review of ownership, loopback/config preservation and cleanup.
- [ ] Prove two synthetic adults, viewer denial and revocation, live committed activity updates, search/filter/paging, annotation/split/transfer writes, CSV inspect/mapping/preview/review/commit/history/rollback, duplicate and invalid-row handling, route/background zero work, Dynamic Type and VoiceOver.
- [ ] Run all unit/package/test types, lint/format/build, affected synthetic integrations, both platform exports, dependency alignment/Doctor and relevant web compatibility regressions. Reopen every changed file and self-review. Refresh affected Graphify scopes and feature entries.
- [ ] Obtain final independent whole-branch Code Reviewer and Application Security Engineer approval. Fix complete findings in one wave with scoped re-review, then publish one IOS5 PR. Verify current Foundation and Native jobs plus actual protected merge before IOS6.

## Evidence and implementation boundaries

Authored-source and unit evidence shows contract conformance and lifecycle composition; it is not native rendering or accessibility proof. Synthetic PostgreSQL cases prove authorization and commit behavior; an in-memory UI origin proves native interaction and transport only. Physical-device battery, Android runtime, real-provider traffic, durable production data and store readiness remain unestablished by this unit.

CSV parsing, row acceptance, duplicate detection and fingerprinting already exist server-side. IOS5 adds selection, review and lifecycle UI; it must not reproduce parser behavior on the device or claim coverage for formats the server rejects.

## Framework and design references checked

- Existing `expo-document-picker` compatibility must be confirmed against the installed SDK58 declarations and official Expo documentation at Task 4 entry; no version is assumed here.
- [Apple lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables) and [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility): review references, not a claim of HIG compliance.
