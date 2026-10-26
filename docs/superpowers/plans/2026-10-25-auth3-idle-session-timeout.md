# AUTH3 — Ten-minute inactivity lock

> **For agentic workers:** Use superpowers:executing-plans. Implementation stays in this session; one fresh whole-branch reviewer follows verification.

**Goal:** Require fresh sign-in after ten minutes without deliberate interaction, with server enforcement and no Continue action.

**Architecture:** Reuse SessionRegistry.lastSeenAt for explicit activity only. PostgreSQL validates the idle deadline under the session lock. Identity adapters and financial/archive scope guards enforce it. A browser timer clears protected content before sign-out; passive requests never renew it.

**Tech Stack:** Existing strict TypeScript, Next.js, NestJS, PostgreSQL, Zod and test tools. No dependencies or deployment.

**Spec:** User-confirmed ten minutes inactive; existing BUILD.md security and event-driven requirements.

## Global Constraints

- Timeout is exactly 600,000 milliseconds; retain the existing absolute session lifetime.
- No Continue action, automatic app entry from sign-in, polling, or background keep-alive.
- Preserve Clerk verification, MFA tasks, recovery, logout cleanup and session-independent deletion receipts.
- Activity never changes MFA proof, permissions, purpose or another session.
- Use synthetic fixtures. Preserve private files and running local services.
- Verify locally before PR; latest-head and test-merge CI must pass before authorised merge.

## Review Focus

- Sleeping tabs and BFCache must hide protected data before resumed interaction.
- Late activity must never revive an expired or revoked session.
- Cross-tab messages must trigger authenticated reconciliation, not grant authority.
- Clerk task sessions and deletion receipts must not enter a sign-out loop.
- A transient logout failure must leave protected content locked and offer retry.

### Task 1: Server inactivity boundary

**Files:** New forward database migration and identity session helper; modify local/Clerk stores and services, identity controller, shared session contracts and BFF route. Tests in tests/session-idle.integration.ts and affected identity integration suites.

**Interfaces:** GET /v1/auth/session reads the effective deadline. POST /v1/auth/session with strict {activityAgeMs: integer 0..5000} records deliberate interaction. Both return {expiresAt, serverTime}; BFF /api/auth/session applies existing authentication, CSRF and no-store conventions.

- [x] Write failing database and API tests: boundary expiry, passive reads, explicit renewal, hard expiry, revocation, isolation, scope guards and delayed requests.
- [x] Observe RED using the owned synthetic PostgreSQL harness.
- [x] Implement the locked database deadline function and forward-replace scope guards. Reuse lastSeenAt; no data backfill or model change.
- [x] Adapt both identity stores and expose authenticated activity/status endpoints without changing MFA authority.
- [x] Verify GREEN, relevant unit/integration suites, lint, types and builds; commit server boundary.

### Task 2: Browser lock and fresh sign-in

**Files:** Focused idle-session controller/hook and protected-content boundary; identity lifecycle and Clerk auth entry; synthetic unit/browser fixtures and existing progress record.

**Interfaces:** Consume the Task 1 session response. One deadline timer; trusted input coalesces at most one activity request per five seconds, with a trailing request only when new input exists. Startup, visibility restore, reconnect and cross-tab signals perform bounded authenticated reconciliation.

- [x] Write failing timer/browser tests for passive inactivity, active use, multi-tab reconciliation, expiry clearing, cleanup failure, BFCache and fresh sign-in.
- [x] Observe RED, implement, and verify GREEN. Exclude public auth/task/deletion-receipt pages from the protected boundary.
- [ ] Reopen every changed file, inspect the diff, run frozen install, formatting, lint, type checks, full unit/integration/browser suites and builds against exact source.
- [ ] Perform one fresh whole-branch review, fix important findings with regression tests, then raise PR and record exact-head/test-merge CI.
- [ ] Verify protections and authorised merge. Record merge evidence before starting the separate glass refinement.
