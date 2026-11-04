# IOS3 native API and committed updates implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute the three tasks sequentially within IOS3; they are not separate delivery units. One final IOS3 PR must pass current CI and merge before IOS4.

**Goal:** Deliver validated native account reads/mutations and authenticated commit-driven resource invalidations without browser assumptions or idle discovery polling.

**Architecture:** Extract the existing mobile identity request core into a mobile-local transport, preserving its public adapter. Reuse canonical account projections, PostgreSQL notifications and authorized status observers. Move the existing pure frame decoder into contracts for actual web/native reuse; keep native resource lifecycle local because the browser coordinator depends on DOM events and cookie/BFF behavior.

**Tech Stack:** Existing pinned TypeScript, NestJS/PostgreSQL, Zod contracts, Expo58/Hermes and `expo/fetch`. No new package, dependency, migration, broker, deployment or native finance screen.

**Spec:** [IOS3 in the agreed delivery plan](2026-11-02-ios-only-delivery.md) and [iOS-first amendment](../../decisions/ios-only-product.md). Read [FEATURE_TREE.md](../../../FEATURE_TREE.md), the [Graphify guide](../../features/graphify.md) and canonical source before decisions.

## Global constraints

- iOS first with Android support; IOS4 financial screens remain outside this unit.
- Keep existing Clerk bearer verification, session/MFA deadlines, household/grant authority, RLS, optimistic versions and idempotency. Events never grant access.
- Preserve identity API exports, messages and cleanup-ticket behavior. No duplicate bearer client or browser token/cookie bridge.
- Commit before notifying; hints contain no financial data or credentials. No periodic state checks, standing database scans or automatic mutation retry.
- Clear resource data before replacement after changed authority, background, identity change, invalidation or transport loss. Abort alone cannot undo a committed write.
- Preserve private fixtures, journals, tickets and old native evidence. Do not repeat real-provider sign-in/MFA/invitation handoffs or create another provider adult.
- Use safe synthetic tests and owned local resources. No EAS/cloud builds, production identity, store submission, deployment, hooks or watchers.
- Update both maps and their affected consumers after changes. Independent final Code Reviewer and Application Security Engineer reviews precede publication/revisions.

## Review focus

1. A token or body that resolves after cancellation must not restore an old actor's data or leave timers/listeners alive.
2. Random encrypted pagination cursors and request IDs must not cause false changes or idle refresh loops.
3. A grant/membership/session change must hide cached data before another read; a resource404 must not revoke an otherwise valid adult session.
4. An interrupted mutation can have committed: retain the original key/body/version, report uncertainty and reconcile rather than blindly repeat.
5. A synthetic simulator stream proves native transport, not PostgreSQL durability or provider acceptance; record these evidence layers separately.

## Boundaries and interfaces

| Path                                                                                       | Responsibility                                                                                                  |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/events.ts`, `src/index.ts`                                         | Strict `account` and `accounts` selectors and canonical query serialization; preserve existing variants.        |
| `packages/contracts/src/status-protocol.ts`                                                | Existing pure `createStatusDecoder` moved without changing frame semantics.                                     |
| `apps/web/lib/status-protocol.ts`                                                          | Compatibility reexport.                                                                                         |
| `apps/web/components/events/status-path.ts`                                                | Reuse canonical serialization, including numeric page limits; existing deletion receipt route remains distinct. |
| `apps/api/src/modules/accounts/account-queries.ts`                                         | One shared bounded page query/projection for list and observation.                                              |
| `apps/api/src/modules/events/status-resources.ts`                                          | Reauthorize every detail/page observation and hash stable scope/data only.                                      |
| `apps/api/src/modules/identity/identity.module.ts`                                         | Share one canonical AccountQueries instance with controllers and event resources.                               |
| `apps/mobile/src/api/{errors,request,accounts}.ts`                                         | Safe errors, bounded request core and typed current account operations.                                         |
| `apps/mobile/src/features/identity/api.ts`                                                 | Existing DTO adapter over common transport; preserve public compatibility.                                      |
| `apps/mobile/src/events/{stream,resource}.ts`                                              | Native streaming and explicit actor/foreground/authority lifecycle. No unused React adapter.                    |
| `tests/native-*.test.ts`, `tests/account-status.integration.ts` and focused existing tests | Actual authored transport/controller, API/RLS and lifecycle regressions.                                        |
| Feature tree/domain pages and affected Graphify scopes                                     | Reuse decisions, new native API feature, source-backed status and reciprocal connections.                       |

## Task 1: Shared protocol and bounded account subscriptions

**Owns:** Shared contracts/protocol, the two web compatibility files, API account observation/wiring and their tests. Do not change mobile runtime yet.

**Produces:**

- Selector `{ kind: "account", householdId: string, id: string }`.
- Selector `{ kind: "accounts", householdId: string, limit: number, cursor?: string }`; reuse account list limits1..200/default50 and cursor maximum2048.
- `statusSubscriptionQuery(selector: StatusSubscription): string`, validating the selector and serializing defined scalar fields through URLSearchParams.
- `createStatusDecoder(onSignal?: (signal: StatusSignal) => void)` with its current push/finish interface and8192-character frame limit unchanged.
- `AccountQueries.observePage(context: AuthContext, limit: number, cursor?: string): Promise<{ items: AccountResponse[]; hasMore: boolean }>` using the same scoped query/projection as `list`.

- [ ] Write regressions first: new selectors accepted, unknown/duplicate/credential fields rejected; numeric query serialization; unchanged existing decoder tests; account detail/page observation authorized and stable across randomized nextCursor/requestId. Pin a page mutation outside the requested window as unchanged when items/hasMore/authority are unchanged.

```ts
expect(
  statusSubscriptionSchema.safeParse({ kind: "account", householdId, id })
    .success,
).toBe(true);
expect(
  statusSubscriptionSchema.safeParse({
    kind: "accounts",
    householdId,
    limit: 201,
  }).success,
).toBe(false);
expect(await resources.read(selector, auth)).toMatchObject({
  fingerprint: expect.any(String),
});
```

- [ ] Run focused tests before implementation and retain expected failure output. Add real API/database cases for anonymous/outsider denial before headers, committed visible change, rollback silence, cross-tenant silence, grant/session revocation, stale cursor rejection and shutdown cleanup. Reuse existing synthetic signed issuer/status fixtures, never the retained private IOS2 database.
- [ ] Implement selectors, serialization and pure decoder relocation. The web reexport preserves imports; update status-path's serialization without introducing DOM/native coupling.
- [ ] Share a private bounded account page helper between list and observePage. Observation hashes ordered projected items plus hasMore, not randomized output nextCursor. Preserve opaque input-cursor actor/grant binding and existing list DTO.
- [ ] Wire AccountQueries into StatusResources. Keep existing authority/deadline fingerprints and subscribe-before-read observer. No new financial values escape the empty SSE protocol. Existing commit triggers cover this scope; prove their behavior before proposing a migration.
- [ ] Run `pnpm test -- tests/status-protocol.test.ts tests/status-resources.test.ts`, affected account/status integration files with approved synthetic test configuration, package/test types and scoped lint/format. Parent owns integration fixture launch approval/review if needed.
- [ ] Self-review and commit Task1 only. Report source paths, RED/GREEN commands/results and any unavailable real-database check; do not claim integration success from mocked tests.

## Task 2: One bounded native transport and typed account adapter

**Owns:** Mobile api errors/request/accounts modules, identity adapter and focused native fixtures/tests. Consume Task1 contracts. No resource lifecycle/UI yet.

**Produces:** `createNativeTransport(baseUrl, getToken, send?)` with a precise exported NativeTransport interface exposing schema-validated `request<T>(path, schema, options): Promise<T>`. Options specify GET/POST/PATCH/PUT, required AbortSignal, JSON body, caller-owned idempotency key and optimistic version where applicable. Cleanup authorization remains a narrow discriminated branch for the existing identity retry endpoint, never an arbitrary header bag.

`NativeTransport.openStatus(selector, signal): Promise<NativeStatusConnection>` is the only raw-stream entry: a GET to the fixed event endpoint with the same token boundary, a15-second handshake deadline and caller-owned lifetime. NativeStatusConnection exposes a structural response (status/headers/body reader) plus idempotent close() that aborts the socket and removes owned listeners. No raw token getter is exposed.

`createAccountsApi(transport)` exposes typed list/read/create/patch/setGrant over existing schemas and HTTP contracts. Keep valuation UI/adapters for IOS4 unless a current proof requires them.

- [ ] Add failing authored-source regressions before extraction, beginning with a stalled body/caller cancellation in the existing identity API. Add no-token/provider terminal errors, malformed DTO, oversized body, safe upstream errors, exact methods/headers, same-key/body retries and stale If-Match tests.

```ts
expect(send).not.toHaveBeenCalled(); // already-aborted request before token acquisition
expect(requestOptions).toMatchObject({
  credentials: "omit",
  redirect: "error",
});
expect(repeatedOptions.headers["Idempotency-Key"]).toBe(originalKey);
```

- [ ] Keep the existing15000ms total token/request/body bound. Cap JSON bodies at1048576bytes, cancel overflow/stalled readers and remove owned timers/listeners even when provider/send/read continuations settle late. Structural injected fetch types must work with Expo and Node tests without unsafe assertions.
- [ ] Extract the core; preserve `createIdentityApi`, `IdentityApiError` construction/instance behavior and `identityError` messages through a compatibility export/wrapper. Use the installed SDK's real error predicate at the token boundary. Keep private provider text out of error messages.
- [ ] Validate account UUIDs, input DTOs, page bounds, keys and versions. Never automatically retry mutations or replace a stale version. Represent an outcome as uncertain when a write may have reached the server; preserve operation inputs for caller reconciliation.
- [ ] Run focused native API/identity/logout tests, then mobile/shared/test types and scoped lint/format. Verify no regression in cleanup tickets or recognized terminal SDK rejection. Self-review and commit.

## Task 3: Native stream, lifecycle and real transport evidence

**Owns:** Native events stream/resource modules, focused tests, synthetic runtime acceptance tooling/evidence and final maps. Consume Tasks1/2; no finance routes or persistent finance cache.

**Produces:** `readNativeStatusStream(selector, transport, signal, onSignal): Promise<void>` over explicit `expo/fetch` and shared strict decoder. Native account selectors are the current supported scope. A focused `NativeResourceController<T>` accepts explicit scope/read/receive/unavailable/failure dependencies and has `start`, `background`, `foreground`, `replaceAuthority`, `retry`, `close` only where exercised. The scope includes provider actor/session plus verified internal user/household/membership/grant epoch; no global hidden actor state.

- [ ] Write failing tests for fragmented streaming before EOF, empty-only controls, wrong MIME/redirect, timeout/reader cancellation, callbacks after abort, startup, duplicate/out-of-order hints, reconnect catch-up and cleanup. Lifecycle tests cover background, actor/household/grant change, old token/read completion, interrupted mutations and zero idle discovery calls.

```ts
expect(received).toEqual([]); // old-epoch response cannot publish after replacement
expect(discoveryReads).toBe(initialReads); // heartbeats before genuine credential expiry
expect(visibleValue).toBeNull(); // clear synchronously before permission refresh
```

- [ ] Bound token/handshake to15000ms and transport silence to45000ms; validated keepalive frames reset liveness but never trigger resource reads. Stream lifetime is not a JSON timeout. Explicitly omit cookies and reject redirects. Cancel/release readers and listeners on every exit.
- [ ] Subscribe before startup read; reconcile from initial change. Serialize one active read plus one pending refresh. Clear exposed data before change/invalidate/loss and before background/authority replacement; fence every awaited continuation by epoch and signal. Resource403/404 is not automatic adult logout; captured-actor401 can delegate to existing identity revocation.
- [ ] Reconnect only for retryable transport/service failures: five bounded exponential waits1000/2000/4000/8000/16000ms, resetting after30000ms of stable live connection. Terminal invalid protocol/authority errors require explicit retry or a new verified scope. No new network-status package, DOM listener or recurring discovery timer.
- [ ] Implement a loopback-only ignored synthetic simulator harness importing actual authored modules. Before launch, obtain exact-source independent tool/security review and an ownership/cleanup brief. Use in-memory synthetic bearer/counters, never a real provider account or retained database. Restore any temporary Expo entry configuration byte-for-byte; standard exports must exclude the probe. Record iOS streaming before EOF, idle counters, background abort and reconnect catch-up. Distinguish this from real API/PostgreSQL commit/RLS integration evidence.
- [ ] Run relevant integrations, all units/types/lint/format/build, current web protocol regressions, online Expo alignment/Doctor and both platform exports. Inspect changed files and final diff. Update feature tree and affected Graphify API/mobile/shared/web scopes; reconcile renamed decoder and consumers so no stale canonical edge survives.
- [ ] Obtain final independent Code Reviewer and Application Security Engineer review, fix findings, then commit/push/open one IOS3 PR. Record exact head/test-merge checks and actual host merge before IOS4. Missing runtime evidence blocks an unqualified completion claim.

## Preflight and acceptance notes

Task1 produces selectors/protocol consumed by Tasks2/3; Task2 produces transport consumed by Task3 and existing identity. Their shared interfaces above are the handoff contract. Parent owns final integration and graph/tree reconciliation. Task1's compatibility reexport and numeric serialization are the only web changes; preserve existing browser behavior and read applicable web guidance.

The approved execution method is autonomous delegated delivery of the agreed IOS3 unit. This brief refines interfaces inside that scope and introduces no new product choice requiring another approval round. Baseline at5077bd0: frozen install passed,591fresh units passed, build9/9 and package types19/19 passed from cache, test types passed. Exact runtime integration and simulator evidence are still to be produced.
