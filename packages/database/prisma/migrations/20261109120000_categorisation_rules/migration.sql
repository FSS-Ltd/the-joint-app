-- CreateTable
CREATE TABLE "app"."CategorisationRule" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "authorMembershipId" UUID NOT NULL,
    "merchantPattern" VARCHAR(120) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CategorisationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategorisationRule_householdId_authorMembershipId_priority_idx" ON "app"."CategorisationRule"("householdId", "authorMembershipId", "priority");

-- AddForeignKey
ALTER TABLE "app"."CategorisationRule" ADD CONSTRAINT "CategorisationRule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "app"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."CategorisationRule" ADD CONSTRAINT "CategorisationRule_householdId_authorMembershipId_fkey" FOREIGN KEY ("householdId", "authorMembershipId") REFERENCES "app"."Membership"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security and Grants
REVOKE ALL ON app."CategorisationRule" FROM PUBLIC, joint_app_runtime;
ALTER TABLE app."CategorisationRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."CategorisationRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."CategorisationRule" TO CURRENT_USER USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, DELETE ON app."CategorisationRule" TO joint_app_runtime;
GRANT UPDATE (category, "merchantPattern", priority, enabled, version, "updatedAt") ON app."CategorisationRule" TO joint_app_runtime;

-- RLS Policies
CREATE POLICY rule_read ON app."CategorisationRule" FOR SELECT TO joint_app_runtime
  USING ("householdId" = nullif(current_setting('joint.household_id', true), '')::uuid);

CREATE POLICY rule_create ON app."CategorisationRule" FOR INSERT TO joint_app_runtime
  WITH CHECK (
    "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
    AND "authorMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid
  );

CREATE POLICY rule_update ON app."CategorisationRule" FOR UPDATE TO joint_app_runtime
  USING (
    "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
    AND "authorMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid
  )
  WITH CHECK (
    "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
    AND "authorMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid
  );

CREATE POLICY rule_delete ON app."CategorisationRule" FOR DELETE TO joint_app_runtime
  USING (
    "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
    AND "authorMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid
  );
