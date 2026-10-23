-- CreateTable
CREATE TABLE "app"."Membership" (
    "userId" UUID NOT NULL,
    "householdId" UUID NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId","householdId")
);

-- CreateTable
CREATE TABLE "app"."AppSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppSession_userId_idx" ON "app"."AppSession"("userId");

-- AddForeignKey
ALTER TABLE "app"."Membership" ADD CONSTRAINT "Membership_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "app"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AppSession" ADD CONSTRAINT "AppSession_userId_householdId_fkey" FOREIGN KEY ("userId", "householdId") REFERENCES "app"."Membership"("userId", "householdId") ON DELETE CASCADE ON UPDATE CASCADE;

