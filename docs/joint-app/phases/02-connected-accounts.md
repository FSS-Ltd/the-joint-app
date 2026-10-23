# Phase 2 — Approved connected accounts

> **CSV-first MVP revision, 23 October 2026:** Direct bank connections and bank procurement are post-MVP by founder instruction. The current MVP uses CSV/manual records; historical live-bank prerequisites and live-refresh paywall promises below are deferred. Provider evidence remains required before future live work. No live broker connector is included in the CSV-first build; its separate permission gate remains. See the [canonical scope revision](../01-product-specification.md).

**Goal:** connect one supported UK bank and one owned Trading 212 Invest/Stocks ISA account through approved read-only integrations, with accurate ingestion and independent partner permissions.

**Architecture:** Next.js PWA → NestJS `ConnectionsModule` → PostgreSQL Job/Outbox → worker → approved provider. Supabase Auth/Postgres are in London; financial tables remain in the unexposed `app` schema. KMS envelopes protect provider secrets; the web/API and worker hosts use distinct EC2 instance profiles as specified in 02. No local-agent access to provider credentials.

**Stack:** TypeScript, Zod, NestJS, Prisma, PostgreSQL, Next.js, AWS KMS, existing Phase 1 authentication/grants/imports. Use its pinned versions and package names.

**Specifications:** [product](../01-product-specification.md), [architecture](../02-architecture-and-project-structure.md), [financial rules](../03-data-model-and-financial-rules.md), [integration evidence/contracts](../04-account-integrations.md).

**Global constraints:** read-only; no scraping or bank passwords; `NONE/TOTALS/TRANSACTIONS`; canonical cash is signed `BIGINT` minor units serialized as strings; holdings/source decimals retain decimal precision. Provider-specific Trading 212 development for other users waits for written permission. Generic interfaces, synthetic mocks and CSV remain available.

**Review focus:** approval scope, cross-member isolation, callback binding, secret handling, cursor/batch atomicity, revocation races, pending replacement, duplicate-account counting and truthful completeness.

**Estimate:** **12–18 engineer-days**, excluding provider/legal waiting time. Dependencies are planned, **not implemented**: Phase 1 must prove identity/MFA, household grants, scoped repositories/RLS, Job/Outbox, manual import, money primitives and CI. All paths below are planned repository files; all commands are future verification steps, not claimed executions. Keep the phase `BLOCKED_EXTERNAL` when required live permissions/feeds are unavailable.

## Task 1 — Establish the entry and provider gates · 0.5–1 day

**Files:** `docs/decisions/0006-account-data-provider.md`, `docs/decisions/0007-trading212-permission.md`, `apps/api/src/config/connections.config.ts`.

- [ ] Confirm Phase 1 acceptance evidence; resolve missing dependencies before connector integration.
- [ ] Record B1–B3 and T1–T2 from specification 04: precise bank/account product, regulatory arrangement, contract/quote, allowed refreshes, retention and Trading 212 written approval. Store approval references and scope; keep confidential agreements outside the public repository.
- [ ] Obtain Trading 212 approval **before** implementing its provider-specific adapter for this intended shared app. Its [API Terms](https://www.trading212.com/legal-documentation/API-Terms_EN.pdf), especially 6.3 and 6.7, apply before the planned launch. Approval must cover custom founder use and the intended other users; commercial use needs explicit coverage too.
- [ ] Choose one bank implementation. Default candidate is TrueLayer v3; choose Plaid only through a recorded decision if eligibility/cost/coverage is better. Do not build both.
- [ ] Default provider feature flags off; distinguish sandbox/live and approved household cohort. Test that a disabled/unapproved provider cannot be enabled by a request parameter.

**Gate:** unapproved Trading 212 work stops at the generic seam. A bank-only result remains a partial milestone.

## Task 2 — Define contracts and additive storage · 1.5–2 days

**Files:** `packages/contracts/src/connections.ts`, `packages/provider-adapters/src/contracts.ts`, `packages/provider-adapters/src/mock.adapter.ts`, `packages/database/prisma/schema.prisma`, `packages/database/src/connections.repository.ts`.

- [ ] Add `Connection`, `ConnectionSecret`, `ProviderAccountLink`, `ProviderCapability`, `SyncCheckpoint`, `SyncRun` and `SourceRecord` where absent. Reuse canonical `Account`, `AccountGrant`, `Transaction`, `InvestmentEvent`, `Job` and `OutboxEvent`; do not create parallel synonyms.
- [ ] Generate the next ordered Prisma migration named `connected_accounts` under `packages/database/prisma/migrations/`; record its exact generated directory in the task evidence. Include tenant-matched foreign keys, source uniqueness scoped to account, secret-table role restrictions, checkpoint uniqueness by connection/account/stream and required RLS policies.
- [ ] Persist consent scopes/expiry, approving member, environment, revocation generation, capability version, committed checkpoint, in-progress continuation, and actual history coverage.
- [ ] Implement shared types below, matching specification 04. Contexts are server-created and contain resource IDs/fencing information; public DTOs never include credentials, provider tokens or raw payloads.

```ts
interface ReadOnlyAccountAdapter {
  capabilities(ctx: ConnectionContext): Promise<AccountCapabilities[]>;
  beginConsent(ctx: OwnerContext): Promise<ConsentStart>;
  completeConsent(ctx: BoundCallbackContext): Promise<ConnectionResult>;
  listAccounts(ctx: ConnectionContext): Promise<ProviderAccount[]>;
  readBalances(ctx: AccountContext): Promise<BalanceSnapshot[]>;
  readPage(ctx: StreamContext, checkpoint: Checkpoint): Promise<PageResult>;
  disconnect(ctx: ConnectionContext): Promise<RevocationResult>;
}
type PageResult =
  | { kind: "pending"; requestId: string; retryAt: string }
  | {
      kind: "page";
      records: NormalizedRecord[];
      next: Checkpoint | null;
      removedIds: string[];
    };
```

- [ ] Add key validation as a capability-specific method, not a fake OAuth implementation. Convert provider cash decimals with the domain money parser; validate currency exponent and safe range. Preserve raw source amounts without float arithmetic.

**Tests:** reject cross-household foreign keys; identical provider IDs in two accounts remain distinct; API role cannot read secrets; synthetic adapter exercises pending pages, corrections and unsupported capabilities.

## Task 3 — Build resilient ingestion · 2–3 days

**Files:** `apps/worker/src/handlers/connection-sync.handler.ts`, `apps/worker/src/handlers/connection-disconnect.handler.ts`, `packages/database/src/sync.repository.ts`, `apps/worker/test/connection-sync.spec.ts`.

- [ ] Enqueue `connection.sync` with a deduplication key and minimal IDs; reuse Phase 1 leases and `FOR UPDATE SKIP LOCKED`. Never hold a database transaction while waiting for a provider.
- [ ] Lock by connection/stream and carry lease plus revocation generations. Recheck them before every publication. A late worker or owner-revoked connection cannot write a successful snapshot.
- [ ] Stage pages and their hashes durably. Commit a complete incremental batch and durable checkpoint atomically. A page continuation is resumable work, **not** proof that the whole update is complete. Preserve the original cursor for restarting provider pagination errors.
- [ ] Implement bounded date-window overlap, incremental cursors, page-loop protection, typed unsupported results, provider budgets, retry metadata, jitter and dead-letter status. Do not fabricate user-presence headers for background refreshes.
- [ ] Publish dataset/outbox changes only after successful normalization; partial history never publishes complete freshness. Keep user overrides separate from source revisions.

**Tests:** crash after staging/before publication; duplicate job delivery; expired lease resumes elsewhere; provider correction removes/replaces a row; last-page failure leaves checkpoint unchanged; revoke during network wait rejects late writes. Replay twice and assert identical booked totals and event counts.

## Task 4 — Implement the approved bank flow · 2–3 days

**Files:** `packages/provider-adapters/src/truelayer-v3.adapter.ts`, `packages/provider-adapters/src/truelayer-v3.schemas.ts`, `apps/api/src/modules/connections/connections.controller.ts`, `connections.service.ts`, `connections.module.ts`, `provider-callbacks.controller.ts`, `provider-webhooks.controller.ts` in the same module directory.

- [ ] After B1–B3, implement TrueLayer v3 hosted consent, application bearer token, connection ID and recurring access. Confirm current scopes, renewal/revocation contract and quota accounting from the provider. If the decision chooses Plaid, substitute `plaid.adapter.ts`/`plaid.schemas.ts` and its documented Link/Sync flows; retain the common contract.
- [ ] Implement member routes under **`/v1/households/{householdId}/connections`**: `POST /start`, `GET /`, `POST /{id}/sync`, `POST /{id}/reauthorize`, `DELETE /{id}`. Derive ownership from authenticated membership; route IDs alone never authorize access. Require Phase 1 MFA/recent-auth rules for credential and sharing operations.
- [ ] Keep browser callback **`GET /v1/connections/callback/{provider}`** public and separate. Validate app-signed, expiring, one-use state bound to the initiating owner and stored connection; verify provider status server-side. Where state echo differs, use the documented provider correlation mechanism plus server binding. Callback arrival creates no app session.
- [ ] Use **`POST /v1/webhooks/accounts/{provider}`** for supported provider webhooks. Verify native signatures over the original body, timestamp/replay rules and event deduplication before enqueueing; reject forged callbacks without changing state.
- [ ] Import selected accounts with partner grants `NONE`. Renew the existing connection without granting new partner visibility. For TrueLayer transactions, retain asynchronous request IDs and create a new request for each next page.

**Tests:** wrong owner/household/state, replay, expired nonce, multi-tab consent, cancelled authorization, forged webhook and wrong-environment credentials. Assert no connection is marked healthy from an unverified browser success parameter.

## Task 5 — Implement Trading 212 only after T1 · 2–3 days

**Files:** `packages/provider-adapters/src/trading212.adapter.ts`, `trading212.schemas.ts`, `trading212.adapter.spec.ts` in that directory; `apps/api/src/modules/connections/connection-credentials.service.ts`; `infra/terraform/kms.tf` and existing runtime IAM configuration.

- [ ] Recheck written permission and owned supported account. If unavailable, leave every provider-specific implementation checkbox open and record the dependency; do not substitute a successful demo for live access.
- [ ] Add `POST /v1/households/{householdId}/connections/trading212`, a write-only key/secret DTO. Encrypt through the narrow credential service; only the worker can retrieve/decrypt stored secrets. Redact request bodies and exception metadata. Configure approved fixed egress/IP restrictions.
- [ ] Validate identity with permitted reads. Use only specification 04’s GET allowlist and account/portfolio/history permissions; no generic URL proxy or trade/pie mutation method. Do not test scope by submitting a real order.
- [ ] Implement per-account rate control, safe same-origin `nextPagePath` validation, history overlap and separate summary/holdings snapshots. Validate currency semantics, fees, dividends and corporate-action enums; retain unknown types for review.
- [ ] Separate demo/live configuration and labels; disable automatic fallback between environments. Confirm key rotation/revocation and truthful timestamp presentation.

**Tests:** hostile pagination URL is rejected before credentials leave the approved origin; non-GET/order paths are impossible; two keys for one account share a limiter; missing scopes, changed currency, split and fee fixtures preserve accurate amounts. Trace/log snapshots contain no key or secret.

## Task 6 — Deliver account status and reconciliation · 1.5–2 days

**Files:** `apps/web/app/(app)/connections/page.tsx`, `apps/web/components/connections/connection-card.tsx`, `connection-consent-panel.tsx`, `connection-reconcile-panel.tsx` in that components directory; `apps/api/src/modules/accounts/account-linking.service.ts`.

- [ ] Show connecting, syncing, healthy, partial, stale, reconnect-required and disconnected states with coverage and last successful observation; unknown is never rendered as zero.
- [ ] Provide owner-only refresh/reauthorize/disconnect controls and safe missing-permission instructions. A partner can view only granted account projections, not administer the owner’s connection.
- [ ] Reconcile manual-to-live accounts and confirmed joint-account duplicates without silently merging masked descriptors or disclosing hidden connections. Preserve annotations and import provenance; count the canonical account once.
- [ ] Implement pending replacement, distinct same-value purchases, transfer/card-payment handling and source-statement comparison. Offer review for ambiguity rather than destructive deduplication.
- [ ] Reuse Phase 1 CSV fallback and rollback; label its provenance clearly. Provider credentials never enter browser storage, query caches, analytics or Playwright traces.

## Task 7 — Prove isolation and revocation · 1–1.5 days

**Files:** `apps/api/test/connections.isolation.spec.ts`, `packages/database/test/connections.rls.spec.ts`, `apps/web/tests/connections.spec.ts`, `packages/test-fixtures/src/connected-households.ts`.

- [ ] Test two households and two adults with colliding external IDs. Assert inaccessible resources reveal neither existence nor detail, including jobs, callbacks, exports and cached screens.
- [ ] Verify `TOTALS` excludes merchants, counts, securities and transaction-derived aggregates; `NONE` hides account existence. Billing administration supplies no override.
- [ ] Remove a grant during sync and a queued insight request. Invalidate relevant caches/derived results, cancel unauthorized work and reject subsequent reads. Reauthorization preserves the reduced grant.
- [ ] Disconnect locally immediately, attempt upstream revocation, then destroy credentials according to the approved lifecycle. Document provider-side manual revocation if unavailable; distinguish disconnect from history erasure.

## Task 8 — Migration, live evidence and rollback · 1.5–2.5 days

**Files:** `docs/runbooks/connection-recovery.md`, `docs/runbooks/phase2-acceptance.md`, `.github/workflows/ci.yml`, relevant workspace `package.json` scripts.

- [ ] Wire the following scripts to real runners; use the established package names if Phase 1 differs. Run against isolated synthetic/staging databases, never production test fixtures.

```bash
pnpm --filter @joint/provider-adapters test
pnpm --filter @joint/worker test -- connection-sync
pnpm --filter @joint/api test:integration -- connections
pnpm --filter @joint/database test:rls -- connections
pnpm --filter @joint/web test:e2e -- connections.spec.ts
pnpm --filter @joint/database exec prisma migrate deploy
pnpm lint
pnpm typecheck
```

- [ ] Prove migration from Phase 1 data preserves imports/grants; validate RLS using runtime roles, pooled-context alternation and denied direct Data API access. Stage the additive migration before enabling workers; test previous-release read compatibility.
- [ ] Enable one approved household. Manually compare real bank balance/booked activity and Trading 212 summary/holdings against dated provider evidence. Observe a later automatic refresh, reconnection/revocation behavior and reconciliation of real changes; keep private evidence outside logs/repository fixtures.
- [ ] Test rollback: disable new connects and scheduling, fence/cancel active work, deploy the compatible prior application, retain source evidence/checkpoints and preserve historical manual views. Do not drop tables or restore an old backup over newer finances as routine rollback.
- [ ] Record provider/contract versions, coverage, redacted test results, remaining issues and gate status. Commit small reviewed changes in task order; independently review permission checks and money normalization before rollout.

**Exit:** all mandatory tests and both approved live feeds pass. Otherwise deliver the completed generic/bank work with the phase explicitly **incomplete**, naming missing approval or supported account evidence. Do not check off the founder connectivity requirement because mocks or CSV work.
