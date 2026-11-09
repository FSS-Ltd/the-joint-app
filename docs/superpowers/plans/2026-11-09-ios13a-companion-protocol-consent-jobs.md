# Companion Protocol, Consent and Background Jobs (IOS13a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the server-side companion protocol, per-adult device disclosure consent, device session lifecycle, bounded 5-minute lease protocol, encrypted evidence envelope preparation, and due-time background job maintenance for local AI companion processing.

**Architecture:** Bounded Postgres-backed jobs with five-minute leases; device session challenges authenticated with ECDSA/Ed25519 public keys; strict per-adult `DeviceAccountGrant` isolation; authenticated encryption envelope binding job, device, audience, and grant versions; event-driven worker wakeups and due-time lease expiry.

**Tech Stack:** NestJS, Prisma 7, PostgreSQL, Zod contracts (`@joint/contracts`), Web Crypto / Node `crypto` for nonces and signatures, Vitest integration tests.

**Spec:** [docs/joint-app/05-local-ai-and-projections.md](../../joint-app/05-local-ai-and-projections.md) and [docs/joint-app/phases/04-local-ai-and-founder-mvp.md](../../joint-app/phases/04-local-ai-and-founder-mvp.md).

---

## 1. Problem Statement

Private on-device AI financial assistance requires processing sensitive financial evidence exclusively on a household-owned companion computer without sending unencrypted transactional history or credentials to cloud LLMs.

To guarantee privacy, the server must enforce:

1. Per-adult independent device disclosure consent: Each account owner must explicitly opt their specific accounts into the named device. A partner or household admin cannot consent on behalf of another adult.
2. Short-lived cryptographic device identity: Pairing uses a one-time 10-minute code and fingerprint verification. The companion authenticates via signed nonce challenges using hardware-secured keys; no database or service-role credentials reside on the device.
3. Bounded five-minute job leases and revocation safety: Jobs are claimed with a 5-minute lease. Online execution permits must be verified before evidence fetch and result acceptance. Device revocation immediately invalidates all active sessions, leases, and pending jobs.
4. Event wakeups and due-time retries: The worker checks due-time lease expirations and 24-hour request expirations without standing tight polling loops.
5. Zero cloud model fallback: If the companion is offline, the system clearly surfaces an offline/waiting state. No financial evidence is ever diverted to third-party cloud AI.

---

## 2. Architecture Approach & Key Decisions

### Decision 1: Cryptographic Device Authentication via Nonce Challenge

- The companion generates an asymmetric keypair (ECDSA P-256 or Ed25519).
- Pairing binds the public key and fingerprint with a user-approved 6-digit code.
- Device sessions are obtained via `POST /v1/companion/session/challenge` (generates a 32-byte cryptographic nonce expiring in 5 minutes) followed by `POST /v1/companion/session` (submits signature over the nonce).
- Upon verification, the server issues a scoped `device_session` token valid for 1 hour with constant-time token hash lookup.

### Decision 2: Independent Per-Adult Device Account Grants

- Existing `AccountGrant` controls partner visibility inside the household app.
- `DeviceAccountGrant` controls exposure to the specific companion device.
- For any insight job, effective account access is computed as:
  `EffectiveScope = RequestingUserRights ∩ AudienceScope ∩ DeviceAccountGrants ∩ FeatureRequirements`.
- If an account owner has not granted access to the device, that account is completely excluded from the evidence snapshot, including its balance and existence.

### Decision 3: Bounded Lease Lifecycle

- Jobs follow the state machine:
  `QUEUED -> LEASED -> RUNNING -> VALIDATED -> AVAILABLE`
  Terminal failure states: `EXPIRED`, `CANCELLED`, `FAILED`, `REVOKED`.
- Leases last at most 5 minutes.
- Before decryption and inference, the companion calls `POST /v1/companion/jobs/:jobId/permit` for a fresh online execution permit.
- If the device has been revoked or the lease expired, the permit is denied immediately.
- Companion renewal: `POST /v1/companion/jobs/:jobId/renew` extends the lease by 5 minutes up to a maximum run limit (15 minutes).

### Decision 4: Due-Time Worker Reconciliation

- `apps/worker/src/companion-maintenance.ts`:
  - Re-queues expired leased jobs if attempts remain (< maxAttempts).
  - Marks jobs `EXPIRED` if 24 hours have elapsed since creation.
  - Cleans expired pairing codes and device session nonces.
  - Uses event wakeups when new jobs are enqueued (`companion.job.queued`).

---

## 3. Data Model

### Database Models (`packages/database/prisma/schema.prisma`)

```prisma
enum DeviceStatus {
  PENDING
  APPROVED
  REVOKED
  @@schema("app")
}

enum DeviceAccountPermission {
  NONE
  TOTALS
  TRANSACTIONS
  @@schema("app")
}

enum InsightJobStatus {
  QUEUED
  LEASED
  RUNNING
  VALIDATED
  AVAILABLE
  EXPIRED
  CANCELLED
  FAILED
  REVOKED
  @@schema("app")
}

enum InsightFeatureType {
  SPEND_SUMMARY
  RECURRING_COSTS
  GOAL_PROJECTION
  GOAL_COMPARISON
  @@schema("app")
}

model Device {
  id              String        @id @default(uuid()) @db.Uuid
  householdId     String        @db.Uuid
  household       Household     @relation(fields: [householdId], references: [id], onDelete: Cascade)
  name            String
  fingerprint     String
  publicKey       String        @db.Text
  keyVersion      Int           @default(1)
  status          DeviceStatus  @default(PENDING)
  pairedByUserId  String        @db.Uuid
  pairedByUser    User          @relation(fields: [pairedByUserId], references: [id], onDelete: Cascade)
  createdAt       DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime      @updatedAt @db.Timestamptz(3)
  lastSeenAt      DateTime?     @db.Timestamptz(3)

  pairingCodes    DevicePairingCode[]
  sessions        DeviceSession[]
  accountGrants   DeviceAccountGrant[]
  insightJobs     InsightJob[]

  @@unique([householdId, fingerprint])
  @@index([householdId, status])
  @@schema("app")
}

model DevicePairingCode {
  id          String    @id @default(uuid()) @db.Uuid
  householdId String    @db.Uuid
  code        String    // 6-digit or formatted pairing secret
  fingerprint String
  createdBy   String    @db.Uuid
  expiresAt   DateTime  @db.Timestamptz(3)
  consumedAt  DateTime? @db.Timestamptz(3)
  createdAt   DateTime  @default(now()) @db.Timestamptz(3)

  deviceId    String?   @db.Uuid
  device      Device?   @relation(fields: [deviceId], references: [id], onDelete: SetNull)

  @@index([code, expiresAt])
  @@schema("app")
}

model DeviceSession {
  id          String    @id @default(uuid()) @db.Uuid
  deviceId    String    @db.Uuid
  device      Device    @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  tokenHash   String    @unique
  nonce       String?   // Challenge nonce
  nonceExpiresAt DateTime? @db.Timestamptz(3)
  expiresAt   DateTime  @db.Timestamptz(3)
  revokedAt   DateTime? @db.Timestamptz(3)
  createdAt   DateTime  @default(now()) @db.Timestamptz(3)

  @@index([deviceId, expiresAt])
  @@schema("app")
}

model DeviceAccountGrant {
  id          String                  @id @default(uuid()) @db.Uuid
  deviceId    String                  @db.Uuid
  device      Device                  @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  accountId   String                  @db.Uuid
  account     Account                 @relation(fields: [accountId], references: [id], onDelete: Cascade)
  ownerUserId String                  @db.Uuid
  permission  DeviceAccountPermission @default(NONE)
  createdAt   DateTime                @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime                @updatedAt @db.Timestamptz(3)

  @@unique([deviceId, accountId])
  @@index([ownerUserId, deviceId])
  @@schema("app")
}

model InsightJob {
  id                 String             @id @default(uuid()) @db.Uuid
  householdId        String             @db.Uuid
  household          Household          @relation(fields: [householdId], references: [id], onDelete: Cascade)
  requesterUserId    String             @db.Uuid
  requesterUser      User               @relation(fields: [requesterUserId], references: [id], onDelete: Cascade)
  audienceScope      String             // PERSONAL | HOUSEHOLD
  status             InsightJobStatus   @default(QUEUED)
  featureType        InsightFeatureType
  parameters         Json
  promptCiphertext   String?            @db.Text
  promptKeyId        String?

  assignedDeviceId   String?            @db.Uuid
  assignedDevice     Device?            @relation(fields: [assignedDeviceId], references: [id], onDelete: SetNull)

  leaseToken         String?            @db.Uuid
  leaseExpiresAt     DateTime?          @db.Timestamptz(3)
  leaseRenewals      Int                @default(0)

  attempts           Int                @default(0)
  maxAttempts        Int                @default(2)

  evidenceHash       String?
  resultPayload      Json?
  grantVersion       Int                @default(1)

  createdAt          DateTime           @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime           @updatedAt @db.Timestamptz(3)
  expiresAt          DateTime           @db.Timestamptz(3) // 24h lifetime

  @@index([householdId, status])
  @@index([status, leaseExpiresAt])
  @@index([assignedDeviceId, status])
  @@schema("app")
}
```

---

## 4. Failure Modes & Resilience

1. **Companion Power Down / Sleep During Lease:**
   - The 5-minute lease expires safely without human intervention.
   - The worker due-time task inspects `InsightJob` where `status = LEASED AND leaseExpiresAt < NOW()`.
   - If `attempts < maxAttempts`, status is reset to `QUEUED`, clearing `leaseToken` and `leaseExpiresAt`.
   - If `attempts >= maxAttempts`, status transitions to `FAILED` with an explicit code (`COMPANION_TIMEOUT`).
2. **Device Revocation Mid-Execution:**
   - Calling `DELETE /v1/households/:householdId/devices/:deviceId` immediately marks device `REVOKED`, revokes all active `DeviceSession` records, and transitions any active `InsightJob` for this device to `REVOKED`.
   - Any in-flight permit check or result submission fails with `DEVICE_REVOKED`.
3. **Account Grant Narrowing (Privacy Race):**
   - If an account owner updates their grant to `NONE` or removes an account while a job is running, the `grantVersion` on the household/account increments.
   - Result submission checks `grantVersion`. If mismatched, the result is rejected and the job is cancelled.
4. **Idempotency and Replay Protection:**
   - Claim, permit, renewal, and completion calls require idempotency keys and challenge validation.
   - Replaying a completed job returns the recorded result without reprocessing.

---

## 5. Security & Privacy

1. **Per-Adult Boundary:**
   - Account owners exclusively control `DeviceAccountGrant` for their own accounts (`ownerUserId == requesterUserId`).
   - A household administrator cannot view or alter another adult's device grant.
2. **Zero Unencrypted Network LLM Traffic:**
   - No traffic is sent to OpenAI, Anthropic, Google Cloud, or third-party inference endpoints.
   - Evidence envelopes are constructed only when claimed by an approved device session and encrypted using AES-256-GCM / ChaCha20-Poly1305 with the device's authenticated public key.
3. **No Database or Supabase Credentials on Companion:**
   - The companion CLI connects purely via HTTPS using its scoped `device_session` token.
4. **Short-Lived Ephemeral Nonces:**
   - Nonce challenges expire after 5 minutes and can only be used once.

---

## 6. Rollout & Rollback Plan

- **Rollout:**
  - Execute Prisma migration for `Device`, `DevicePairingCode`, `DeviceSession`, `DeviceAccountGrant`, and `InsightJob`.
  - Expose contracts in `@joint/contracts`.
  - Wire `DevicesModule` and `CompanionJobsModule` into NestJS API.
  - Implement worker due-time maintenance in `apps/worker`.
- **Rollback:**
  - Database migration has clean drops for new tables.
  - Entitlement service and billing operate independently; reverting leaves Free and Plus tiers fully intact.

---

## 7. Success Metrics

1. **Protocol Correctness:** 100% passing tests for pairing, session challenge, grant intersection, 5-minute lease expiry, renewal, and completion.
2. **Revocation Safety:** Zero late results accepted after device or grant revocation.
3. **Cap Preservation:** At most 1 approved companion device per household enforced by entitlement checks.
4. **Build & Bundle Quality:** 0 type errors, 0 lint warnings, clean format, passing native bundle exports.
