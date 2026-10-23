BEGIN;

-- CreateEnum
CREATE TYPE "app"."UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'DELETED');

-- CreateEnum
CREATE TYPE "app"."MembershipStatus" AS ENUM ('ACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "app"."MembershipRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "app"."SessionKind" AS ENUM ('BEARER', 'WEB');

-- AlterTable
ALTER TABLE "app"."Household" ADD COLUMN     "baseCurrency" CHAR(3) NOT NULL DEFAULT 'GBP',
ADD COLUMN     "name" VARCHAR(80) NOT NULL DEFAULT 'Our household',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/London';

-- Preserve the composite session reference while the membership key changes.
ALTER TABLE app."SessionRegistry" DROP CONSTRAINT "SessionRegistry_userId_householdId_fkey";

-- AlterTable
ALTER TABLE "app"."Membership" DROP CONSTRAINT "Membership_pkey",
ADD COLUMN     "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "grantVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN     "role" "app"."MembershipRole" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "slot" INTEGER,
ADD COLUMN     "status" "app"."MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
ADD CONSTRAINT "Membership_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "app"."SessionRegistry" ADD COLUMN     "browserTokenHash" CHAR(64),
ADD COLUMN     "kind" "app"."SessionKind" NOT NULL DEFAULT 'BEARER',
ADD COLUMN     "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "providerExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "providerTokens" TEXT,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'NORMAL',
ALTER COLUMN "householdId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "app"."User" (
    "id" UUID NOT NULL,
    "status" "app"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailHash" CHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Invitation" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "issuedByUserId" UUID NOT NULL,
    "emailHash" CHAR(64) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."RequestKey" (
    "userId" UUID NOT NULL,
    "route" VARCHAR(100) NOT NULL,
    "key" UUID NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "resultCiphertext" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RequestKey_pkey" PRIMARY KEY ("userId","route","key")
);

-- CreateTable
CREATE TABLE "app"."AuditEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "householdId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_emailHash_key" ON "app"."User"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "app"."Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_householdId_expiresAt_idx" ON "app"."Invitation"("householdId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_householdId_createdAt_idx" ON "app"."AuditEvent"("householdId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_householdId_key" ON "app"."Membership"("userId", "householdId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_householdId_slot_key" ON "app"."Membership"("householdId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRegistry_browserTokenHash_key" ON "app"."SessionRegistry"("browserTokenHash");

-- Backfill only identity references/version fields; do not invent verified emails.
INSERT INTO app."User" (id)
SELECT "userId" FROM app."Membership" UNION SELECT "userId" FROM app."SessionRegistry"
ON CONFLICT DO NOTHING;
ALTER TABLE app."Membership" ALTER COLUMN id DROP DEFAULT;
WITH slots AS (
  SELECT id, row_number() OVER (PARTITION BY "householdId" ORDER BY "acceptedAt", id)::integer AS number
  FROM app."Membership" WHERE status = 'ACTIVE'
)
UPDATE app."Membership" AS member SET slot = slots.number FROM slots WHERE member.id = slots.id;
ALTER TABLE app."Membership" ADD CONSTRAINT "Membership_active_slot" CHECK (
  (status = 'ACTIVE' AND slot IN (1, 2) AND slot IS NOT NULL) OR (status = 'LEFT' AND slot IS NULL)
);
CREATE UNIQUE INDEX "Membership_one_active_household" ON app."Membership" ("userId") WHERE status = 'ACTIVE';
ALTER TABLE app."SessionRegistry" ADD CONSTRAINT "SessionRegistry_userId_householdId_fkey"
FOREIGN KEY ("userId", "householdId") REFERENCES app."Membership" ("userId", "householdId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE app."SessionRegistry" ADD CONSTRAINT "SessionRegistry_token_storage" CHECK (
  (kind = 'BEARER' AND "browserTokenHash" IS NULL AND "providerTokens" IS NULL AND "providerExpiresAt" IS NULL)
  OR (kind = 'WEB' AND "browserTokenHash" IS NOT NULL AND ("revokedAt" IS NOT NULL OR ("providerTokens" IS NOT NULL AND "providerExpiresAt" IS NOT NULL)))
);

-- AddForeignKey
ALTER TABLE "app"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."SessionRegistry" ADD CONSTRAINT "SessionRegistry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Invitation" ADD CONSTRAINT "Invitation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "app"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Invitation" ADD CONSTRAINT "Invitation_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "app"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."RequestKey" ADD CONSTRAINT "RequestKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AuditEvent" ADD CONSTRAINT "AuditEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "app"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
