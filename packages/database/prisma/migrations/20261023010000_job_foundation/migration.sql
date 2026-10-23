-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "app"."JobState" AS ENUM ('QUEUED', 'LEASED', 'SUCCEEDED', 'RETRY_WAIT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "app"."Household" (
    "id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Job" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "resourceId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "state" "app"."JobState" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."OutboxEvent" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_state_runAfter_idx" ON "app"."Job"("state", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "Job_householdId_type_idempotencyKey_key" ON "app"."Job"("householdId", "type", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Job_id_householdId_key" ON "app"."Job"("id", "householdId");

-- CreateIndex
CREATE INDEX "OutboxEvent_householdId_createdAt_idx" ON "app"."OutboxEvent"("householdId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_jobId_type_key" ON "app"."OutboxEvent"("jobId", "type");

-- AddForeignKey
ALTER TABLE "app"."Job" ADD CONSTRAINT "Job_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "app"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."OutboxEvent" ADD CONSTRAINT "OutboxEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "app"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."OutboxEvent" ADD CONSTRAINT "OutboxEvent_jobId_householdId_fkey" FOREIGN KEY ("jobId", "householdId") REFERENCES "app"."Job"("id", "householdId") ON DELETE CASCADE ON UPDATE CASCADE;

