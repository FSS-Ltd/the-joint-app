BEGIN;

-- 1. Create Enums if needed or use CHECK constraints for app portability
CREATE TYPE app."DeviceStatus" AS ENUM ('PENDING', 'APPROVED', 'REVOKED');
CREATE TYPE app."DeviceAccountPermission" AS ENUM ('NONE', 'TOTALS', 'TRANSACTIONS');
CREATE TYPE app."InsightJobStatus" AS ENUM ('QUEUED', 'LEASED', 'RUNNING', 'VALIDATED', 'AVAILABLE', 'EXPIRED', 'CANCELLED', 'FAILED', 'REVOKED');
CREATE TYPE app."InsightFeatureType" AS ENUM ('SPEND_SUMMARY', 'RECURRING_COSTS', 'GOAL_PROJECTION', 'GOAL_COMPARISON');

-- 2. Device table
CREATE TABLE app."Device" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "householdId" uuid NOT NULL REFERENCES app."Household"(id) ON DELETE CASCADE,
  name text NOT NULL,
  fingerprint text NOT NULL,
  "publicKey" text NOT NULL,
  "keyVersion" integer NOT NULL DEFAULT 1,
  status app."DeviceStatus" NOT NULL DEFAULT 'PENDING',
  "pairedByUserId" uuid NOT NULL REFERENCES app."User"(id) ON DELETE CASCADE,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "lastSeenAt" timestamptz(3),
  CONSTRAINT "Device_householdId_fingerprint_key" UNIQUE ("householdId", fingerprint)
);

CREATE INDEX "Device_householdId_status_idx" ON app."Device"("householdId", status);

-- 3. DevicePairingCode table
CREATE TABLE app."DevicePairingCode" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "householdId" uuid NOT NULL,
  code text NOT NULL,
  fingerprint text NOT NULL,
  "createdBy" uuid NOT NULL,
  "expiresAt" timestamptz(3) NOT NULL,
  "consumedAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "deviceId" uuid REFERENCES app."Device"(id) ON DELETE SET NULL
);

CREATE INDEX "DevicePairingCode_code_expiresAt_idx" ON app."DevicePairingCode"(code, "expiresAt");

-- 4. DeviceSession table
CREATE TABLE app."DeviceSession" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deviceId" uuid NOT NULL REFERENCES app."Device"(id) ON DELETE CASCADE,
  "tokenHash" text NOT NULL UNIQUE,
  nonce text,
  "nonceExpiresAt" timestamptz(3),
  "expiresAt" timestamptz(3) NOT NULL,
  "revokedAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX "DeviceSession_deviceId_expiresAt_idx" ON app."DeviceSession"("deviceId", "expiresAt");

-- 5. DeviceAccountGrant table
CREATE TABLE app."DeviceAccountGrant" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "deviceId" uuid NOT NULL REFERENCES app."Device"(id) ON DELETE CASCADE,
  "accountId" uuid NOT NULL REFERENCES app."Account"(id) ON DELETE CASCADE,
  "ownerUserId" uuid NOT NULL,
  permission app."DeviceAccountPermission" NOT NULL DEFAULT 'NONE',
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "DeviceAccountGrant_deviceId_accountId_key" UNIQUE ("deviceId", "accountId")
);

CREATE INDEX "DeviceAccountGrant_ownerUserId_deviceId_idx" ON app."DeviceAccountGrant"("ownerUserId", "deviceId");

-- 6. InsightJob table
CREATE TABLE app."InsightJob" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "householdId" uuid NOT NULL REFERENCES app."Household"(id) ON DELETE CASCADE,
  "requesterUserId" uuid NOT NULL REFERENCES app."User"(id) ON DELETE CASCADE,
  "audienceScope" text NOT NULL,
  status app."InsightJobStatus" NOT NULL DEFAULT 'QUEUED',
  "featureType" app."InsightFeatureType" NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  "promptCiphertext" text,
  "promptKeyId" text,
  "assignedDeviceId" uuid REFERENCES app."Device"(id) ON DELETE SET NULL,
  "leaseToken" uuid,
  "leaseExpiresAt" timestamptz(3),
  "leaseRenewals" integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  "maxAttempts" integer NOT NULL DEFAULT 2,
  "evidenceHash" text,
  "resultPayload" jsonb,
  "grantVersion" integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "expiresAt" timestamptz(3) NOT NULL
);

CREATE INDEX "InsightJob_householdId_status_idx" ON app."InsightJob"("householdId", status);
CREATE INDEX "InsightJob_status_leaseExpiresAt_idx" ON app."InsightJob"(status, "leaseExpiresAt");
CREATE INDEX "InsightJob_assignedDeviceId_status_idx" ON app."InsightJob"("assignedDeviceId", status);

-- 7. Permissions and RLS
REVOKE ALL ON app."Device", app."DevicePairingCode", app."DeviceSession", app."DeviceAccountGrant", app."InsightJob" FROM PUBLIC, joint_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app."Device", app."DevicePairingCode", app."DeviceSession", app."DeviceAccountGrant", app."InsightJob" TO joint_app_runtime;

ALTER TABLE app."Device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."Device" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."DevicePairingCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."DevicePairingCode" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."DeviceSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."DeviceSession" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."DeviceAccountGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."DeviceAccountGrant" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."InsightJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."InsightJob" FORCE ROW LEVEL SECURITY;

CREATE POLICY maintenance ON app."Device" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."DevicePairingCode" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."DeviceSession" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."DeviceAccountGrant" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."InsightJob" TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY device_runtime ON app."Device" TO joint_app_runtime USING (
  nullif(current_setting('joint.household_id', true), '') IS NULL
  OR "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
) WITH CHECK (
  nullif(current_setting('joint.household_id', true), '') IS NULL
  OR "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
);

CREATE POLICY device_pairing_code_runtime ON app."DevicePairingCode" TO joint_app_runtime USING (
  nullif(current_setting('joint.household_id', true), '') IS NULL
  OR "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
) WITH CHECK (
  nullif(current_setting('joint.household_id', true), '') IS NULL
  OR "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
);

CREATE POLICY device_session_runtime ON app."DeviceSession" TO joint_app_runtime USING (true) WITH CHECK (true);

CREATE POLICY device_account_grant_runtime ON app."DeviceAccountGrant" TO joint_app_runtime USING (
  nullif(current_setting('joint.user_id', true), '') IS NULL
  OR "ownerUserId" = nullif(current_setting('joint.user_id', true), '')::uuid
) WITH CHECK (
  nullif(current_setting('joint.user_id', true), '') IS NULL
  OR "ownerUserId" = nullif(current_setting('joint.user_id', true), '')::uuid
);

CREATE POLICY insight_job_runtime ON app."InsightJob" TO joint_app_runtime USING (
  nullif(current_setting('joint.household_id', true), '') IS NULL
  OR "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
) WITH CHECK (
  nullif(current_setting('joint.household_id', true), '') IS NULL
  OR "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
);

DO $$ DECLARE blocked_role text; BEGIN
  FOREACH blocked_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname=blocked_role) THEN
      EXECUTE format('REVOKE ALL ON app."Device",app."DevicePairingCode",app."DeviceSession",app."DeviceAccountGrant",app."InsightJob" FROM %I',blocked_role);
    END IF;
  END LOOP;
END $$;

COMMIT;
