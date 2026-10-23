# Clerk Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the approved Clerk migration, preserving the custom UI, existing identity/data boundaries and local-only operation.

**Architecture:** Official Clerk SDK custom flows authenticate people; Next.js resolves the provider session and forwards its signed token through the existing BFF. NestJS verifies provider and local session state, maps external IDs to stable internal UUIDs and supplies the existing authorization principal. Signed webhook handlers and the privacy worker share durable identity/session tombstones.

**Tech Stack:** Existing pinned Node/TypeScript/Next/React/Nest/PostgreSQL stack; exact @clerk/backend 3.26.1 and @clerk/nextjs 7.9.19 (revalidate compatibility before installation).

**Spec:** [Approved design](task-auth2-clerk-design.md). User approved implementation on 2026-10-23 and requested preparing integration before creating the development instance. Continue native execution without another plan-approval loop.

## Global Constraints

- One AUTH2 delivery branch/PR; no later finance step before current CI and actual merge. Predecessor AUTH1 PR #19 merged as 0e4e3643bc12d9020f738b10c43f2932b43efbdc with required CI39947783524 SUCCESS and actual-main CI39948592227 SUCCESS.
- Preserve running preview, private files, existing internal UUIDs, source permissions, archives, MFA, privacy intent journal and stored data. No email-only linking or silent provider fallback.
- Keep existing login/create-account visual design, mobile-first controls and password visibility. Add Google, provider challenge and meaningful flow states only.
- No live keys in source/CI, tunnel, deployment, service provisioning or paid commitment. Actual email/Google proof remains explicitly unavailable until user setup.
- Validate secrets without echoing them; bounded provider calls fail closed. No raw provider errors/webhook payload logs.
- Native inline execution, regression-driven tasks and one final independent whole-branch review. Task commits do not independently satisfy the AUTH2 host gate.

## Review Focus

- Concurrent JIT/webhook requests for one subject must not create multiple users or revive a deleted identity.
- A revoked external session must not register under a new internal UUID; a genuinely new session must retain lawful archive access.
- Refreshed tokens and minute-rounded factor ages must not extend five-minute MFA freshness or treat Device Trust as MFA.
- Email collisions and proof substitution must not attach another person's stored data.
- Slow/failed provider calls must fail safely without holding local database locks; logout/deletion must remain locally effective.

### Task 1: Clerk configuration and verified credentials

**Files:** create packages/contracts/src/clerk.ts, apps/api/src/modules/identity/clerk/credential-verifier.ts and tests/clerk-credentials.test.ts; modify contracts index, API package manifest and lockfile.

**Interfaces:** clerkServerEnvironmentSchema validates configured issuer, explicit authorized origins, server key and bounded timeout; clerkWebEnvironmentSchema validates publishable key and matching issuer; clerkWebhookEnvironmentSchema validates signing secret. ClerkCredentialVerifier.verify(token:string):Promise<ClerkCredential> returns configured issuer, external subject/session, verified primary email, signed expiry, conservative authentication/MFA timestamps and authoritative MFA enrollment. No internal UUID is inferred here. Inject a narrow provider gateway in tests; production uses the official SDK.

- [ ] Add failing tests for safe configuration errors and malformed/non-session credentials; include wrong issuer/origin, expired/future token, impersonation, pending tasks, unverified/blocked user, inactive/substituted session, missing/stale/rounded MFA and bounded provider outage.
- [ ] Run pnpm test -- tests/clerk-credentials.test.ts; observe missing-module RED before implementation.
- [ ] Install exact backend SDK; implement schemas, official signature verification and bounded authoritative session/user checks. Require configured TOTP for second-factor evidence; reject automatic downgrade.
- [ ] Run targeted tests, contracts/API builds, test TypeScript and scoped ESLint. Commit only Task 1 changes.

### Task 2: Durable identity and session mappings

**Files:** modify packages/database/prisma/schema.prisma; create forward migration, apps/api/src/modules/identity/clerk/identity-store.ts and tests/clerk-identity.integration.ts.

**Interfaces:** ClerkIdentityStore.withCredential(credential,apply) resolves unique instance/subject and instance/session bindings to internal IdentityPrincipal and Prisma transaction. It rechecks active user/session/membership under local locks after provider validation. It never revives a revoked mapping. bindLegacy(verifiedLegacyPrincipal,credential) requires fresh proof of both identities and collision-safe locking; no caller-supplied user ID is authority.

- [ ] Write RED fresh-DB tests for UUID stability, email collision, concurrent creation, revoked replay, new-session archive access, deletion tombstones, proof substitution and runtime-table denial.
- [ ] Add additive mappings without rewriting existing rows. Keep identity mapping/tombstones through financial purge; deny finance-runtime direct access and use narrowly scoped identity operations matching existing identity privileges.
- [ ] Implement transactions/unique constraints and test the populated upgrade. Run targeted integration, database generation/build and strict types. Commit Task 2.

### Task 3: API/BFF provider selection and authorization

**Files:** modify identity service/module/controller boundaries, shared HTTP input/auth guards, API startup, contracts identity schema, web server browser-security/upstream/finance/privacy boundaries; create focused Clerk service/BFF session adapters and tests/clerk-session.integration.ts.

**Interfaces:** a provider-independent IdentityAccess interface preserves me, actor, financeContext and ownerArchiveContext signatures plus local/global logout. Legacy adapter retains current fixture behavior. Clerk adapter consumes verified credential and mappings. Next server session adapter returns a server-only API credential; configured provider determines parsing, never token-selected issuer. Clerk MFA factor uses explicit opaque provider-safe identifier rather than coercing a Clerk string to UUID.

- [ ] Add RED API/BFF tests for signed credential exchange, no exposed tokens, CSRF/origin enforcement, incomplete/recovery finance denial, cross-user/tenant/session substitution and provider failure.
- [ ] Implement explicit typed provider configuration, retain existing principal/RLS boundaries and revoke locally before provider logout. Reconcile same-session revocation and fresh enrollment/reverification without resurrecting sessions.
- [ ] Run new session tests and existing auth/account/archive/funding/privacy regressions. Build/typecheck both apps and commit Task 3.

### Task 4: Signed webhook lifecycle

**Files:** create focused clerk/webhook-verifier.ts, webhook-service.ts and webhook.controller.ts; add forward event-ledger/tombstone migration if Task 2 cannot include it; modify application raw-body registration; add tests/clerk-webhooks.integration.ts and signed fixture helper.

**Interfaces:** verifyClerkWebhook(rawRequest):Promise<VerifiedWebhook> uses official signature verification. ClerkWebhookService.apply(event,eventId):Promise<void> deduplicates and locks per provider resource; terminal user/session tombstones dominate stale creates/updates. Controller alone owns signature/body boundary, service owns transactions.

- [ ] Observe RED for valid signed HTTP fixtures and signature/timestamp/body-size failures, duplicates/concurrency, ordering, JIT-first and resurrection attempts.
- [ ] Implement 64KiB raw-body limit, signature verification before mutation, transactional minimal event metadata and authoritative reconciliation when event ordering is insufficient. Exempt only this endpoint from browser CSRF. Never grant household/source permissions from metadata.
- [ ] Verify no payload/secret logging, no cascade financial deletion on provider deletion, no duplicate effect. Run targeted integration/types/lint and commit Task 4.

### Task 5: Preserved custom Clerk UI

**Files:** add focused Clerk provider/flow hooks, auth/verification/Google callback/security components under apps/web/components/identity/clerk; modify layout, sign-in/sign-up/recovery/security entry points and provider-aware logout; add tests/browser/clerk-identity.spec.ts with synthetic provider fixtures. Add exact Next SDK and lockfile.

**Interfaces:** custom flow hook provides a discriminated stage, pending/error state and explicit credentials/code/resend/Google actions. Existing frame and PasswordField remain shared. Server selects configured provider; missing Clerk configuration shows actionable unavailable state, never pretends to send email or signs in via legacy fallback.

- [ ] Write RED browser cases for signup email code/resend/expiry, login, Device Trust, Google callback/task/MFA continuation, recovery, TOTP enrollment/freshness, logout/cross-tab changes and unavailable SDK.
- [ ] Implement current Core 3 SDK methods with custom controls and provider challenge mount. Handle allowlisted continuation and provider session tasks before finance. Keep credentials out of app storage/logs.
- [ ] Inspect real desktop/mobile render including valid-email Space/Enter eye toggling and maximum revealed password. Run complete browser regressions, web build/types and scoped lint. Commit Task 5.

### Task 6: Privacy, setup and full acceptance

**Files:** adapt worker privacy provider boundary, deletion repository/mapping retention and restore fixture/replay/proof modules; add tests/clerk-privacy.integration.ts; create infra/auth/clerk.env.example and docs/joint-app/clerk-local-setup.md; modify scripts/config loading, README and docs/progress.md.

**Interfaces:** deletion provider deletes a mapped external subject only after verified journal intent and local purge, returns confirmed absence/success or retryable pending. Restore replay retains durable provider tombstones so later webhook/JIT cannot revive deleted identities. Setup validates local ignored settings without provisioning an instance or printing secrets.

- [ ] Add RED actual purge/restore and dual-proof linking tests, including provider failure/retry, confirmed not-found and joint/archive retention.
- [ ] Implement Clerk deletion adapter, mapping preservation and restore replay; retain legacy local fixtures. Document exact development settings, active provider, data flows/unknown region, real-provider limitation and paid production MFA constraint.
- [ ] Run fresh frozen install, formatting, lint, all package builds/types, complete unit/integration/browser suites against label-verified disposable resources. Inspect every changed file and diff. No development data reset.
- [ ] Obtain one independent whole-branch review; regression-fix material findings and rerun affected/full checks. Record nonblocking suggestions honestly.
- [ ] Publish/attach AUTH2 PR only after local verification; verify current-head/test-merge required CI and authorized actual merge. Record real email/Google checks as NOT RUN until development keys exist; do not claim live-provider acceptance. No subsequent step until merge and required applicable acceptance are satisfied.

## Coverage review

All approved design requirements map to Tasks 1–6. Live email/Google round trips depend on user setup and remain a stated acceptance limitation, not synthetic proof. All five Review Focus classes have explicit regression coverage assigned above. Existing native execution and standing PR/merge authorization are retained.
