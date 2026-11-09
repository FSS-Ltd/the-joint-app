# Design Document: IOS13c Native Companion UI, Consent Controls, and Evaluation Harness

## 1. Problem Statement

Following the completion and merge of the companion protocol (IOS13a) and local runtime with grounded tools (IOS13b), household adults require a native mobile interface in The Joint App to:

1. Initiate pairing and display the 6-digit numeric pairing code.
2. Review and approve paired companion devices, verifying the public key fingerprint.
3. Configure per-adult account consent grants (NONE, TOTALS, TRANSACTIONS) to ensure strict data minimization before evidence snapshots are created.
4. Trigger background insight jobs (e.g., Spending Review, Recurring Costs Audit, Goal Projection) and inspect the completed grounded results.
5. Immediately revoke device authorization, cutting off active leases and invalidating sessions.
6. Verify model evaluation, determinism, and malicious-input resilience through an evaluation harness.

## 2. Architecture Approach and Key Decisions

### 2.1 Native Companion Architecture

- **Mobile API Client (`apps/mobile/src/api/devices.ts`):** Typed functions consuming `/v1/households/:householdId/devices/*` and `/v1/households/:householdId/insight-jobs/*` using the existing authenticated HTTP transport.
- **State Management (`apps/mobile/src/features/companion/use-companion.ts`):** Encapsulates device loading, pairing generation, device approval, account grant mutation, job creation, and job result presentation.
- **Accessible UI (`apps/mobile/src/features/companion/companion-screen.tsx`):** Built with native Apple Human Interface Guidelines and Liquid Glass design tokens. Meets WCAG 2.2 AA contrast, 48pt touch targets, and Dynamic Type accessibility requirements.
- **Route Handler (`apps/mobile/app/(workspace)/companion.tsx`):** Route exposing the companion management screen.
- **Navigation Integration:** Added to `AccountScreen` (More tab) as "Local companion (Mac)".

### 2.2 Evaluation Harness

- Multi-run evaluation harness in `tests/companion-eval.test.ts` testing 100 evaluation cases spanning:
  1. Spending summaries with category and date filters.
  2. Recurring cost cadence and baseline detection.
  3. Deterministic goal projections and scenario comparisons.
  4. Malicious prompt injection and jailbreak attempts (attempting to trigger cloud calls or execute ungrounded tools).
  5. Privacy fence enforcement during grant revocation.
  6. Memory bounds and latency bounds (< 2 minutes execution).

## 3. Data Model

Consumes existing `@joint/contracts` schemas:

- `DeviceDto`: `id`, `householdId`, `name`, `fingerprint`, `status`, `pairedByUserId`, `approvedAt`, `revokedAt`, `lastSeenAt`.
- `DeviceAccountGrantDto`: `id`, `deviceId`, `accountId`, `userId`, `permission`, `updatedAt`.
- `InsightJobDto`: `id`, `householdId`, `requestedByUserId`, `featureType`, `status`, `resultPayload`, `errorReason`, `createdAt`, `completedAt`.

## 4. Failure Modes and Resilience

- **Device Offline:** When the paired Mac is sleeping or Ollama is offline, queued jobs remain in `QUEUED` state until claimed. The UI informs the user that computation will run when the Mac wakes up.
- **Lease Expiry:** If the companion crashes during execution, the 5-minute lease expires and the worker due-time maintenance task resets the job to `QUEUED` or marks it `FAILED` after 24 hours.
- **Revocation Mid-Inference:** If an adult revokes a device or modifies account grants while the companion is executing, the companion's fresh online permit check or the server's completion privacy fence aborts the job immediately.
- **Network Glitches:** Mobile API client retries transient network errors using standard exponential backoff.

## 5. Security and Privacy

- **Zero Cloud Model Fallback:** All inference runs on the user's paired Mac over loopback. No financial snapshots or prompts are ever routed to cloud LLMs.
- **Per-Adult Account Consent:** Accounts owned by an adult can only be accessed by the companion if that specific adult has granted `TOTALS` or `TRANSACTIONS` permission.
- **Fingerprint Verification:** The 64-character SHA-256 fingerprint is displayed in the mobile app during approval so the user can verify it against the CLI output.

## 6. Rollout and Rollback Plan

- **Rollout:** Merged behind the Plus entitlement or local companion feature flag. Companion screen is accessed via the Settings/More tab.
- **Rollback:** Device revocation can be performed instantly by any adult in the household or via database migration/feature flag.

## 7. Success Metrics

- Native pairing, approval, consent grant update, job creation, and revocation work with zero unhandled exceptions.
- 100/100 evaluation harness cases pass without deviation or hallucination.
- Monorepo build, typecheck, lint, and full test suite pass cleanly with 100% green checks.
