BEGIN;

-- 1. Create StaffRole enum
CREATE TYPE app."StaffRole" AS ENUM ('ANALYTICS_VIEWER', 'STAFF_ADMIN');

-- 2. Create StaffMember table
CREATE TABLE app."StaffMember" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES app."User"(id) ON DELETE CASCADE,
  role app."StaffRole" NOT NULL DEFAULT 'ANALYTICS_VIEWER',
  "grantedByUserId" uuid,
  "revokedAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "StaffMember_userId_role_key" UNIQUE ("userId", role)
);

CREATE INDEX "StaffMember_userId_revokedAt_idx" ON app."StaffMember"("userId", "revokedAt");

-- 3. Create StaffAudit table
CREATE TABLE app."StaffAudit" (
  id bigserial PRIMARY KEY,
  "staffMemberId" uuid NOT NULL REFERENCES app."StaffMember"(id) ON DELETE RESTRICT,
  "userId" uuid NOT NULL,
  action varchar(120) NOT NULL,
  "targetResource" varchar(120),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX "StaffAudit_userId_createdAt_idx" ON app."StaffAudit"("userId", "createdAt");
CREATE INDEX "StaffAudit_staffMemberId_createdAt_idx" ON app."StaffAudit"("staffMemberId", "createdAt");

-- 4. Create AnalyticsLifecycleEvent table
CREATE TABLE app."AnalyticsLifecycleEvent" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "eventId" varchar(120) NOT NULL UNIQUE,
  "eventType" varchar(80) NOT NULL,
  "eventVersion" integer NOT NULL DEFAULT 1,
  "opaqueSubjectId" varchar(64) NOT NULL,
  "subjectType" varchar(20) NOT NULL,
  "occurredAt" timestamptz(3) NOT NULL,
  "isSandbox" boolean NOT NULL DEFAULT false,
  "isTestAccount" boolean NOT NULL DEFAULT false,
  "payload" jsonb NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX "AnalyticsLifecycleEvent_eventType_occurredAt_idx" ON app."AnalyticsLifecycleEvent"("eventType", "occurredAt");
CREATE INDEX "AnalyticsLifecycleEvent_opaqueSubjectId_occurredAt_idx" ON app."AnalyticsLifecycleEvent"("opaqueSubjectId", "occurredAt");
CREATE INDEX "AnalyticsLifecycleEvent_isSandbox_isTestAccount_occurredAt_idx" ON app."AnalyticsLifecycleEvent"("isSandbox", "isTestAccount", "occurredAt");

COMMIT;
