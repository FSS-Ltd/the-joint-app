BEGIN;

-- CreateEnum
CREATE TYPE "app"."AccountKind" AS ENUM ('CURRENT', 'SAVINGS', 'CREDIT_CARD', 'LOAN', 'MORTGAGE', 'INVESTMENT', 'PENSION', 'PROPERTY', 'OTHER_ASSET', 'OTHER_LIABILITY');

-- CreateEnum
CREATE TYPE "app"."LegalOwnerKind" AS ENUM ('ADULT', 'JOINT_ADULT');

-- CreateEnum
CREATE TYPE "app"."Liquidity" AS ENUM ('AVAILABLE', 'RESTRICTED', 'LOCKED');

-- CreateEnum
CREATE TYPE "app"."AccountOwnerStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "app"."AccountGrantLevel" AS ENUM ('NONE', 'TOTALS', 'TRANSACTIONS');

-- CreateTable
CREATE TABLE "app"."Account" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "creatorUserId" UUID NOT NULL,
    "creatorMembershipId" UUID NOT NULL,
    "kind" "app"."AccountKind" NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'GBP',
    "legalOwnerKind" "app"."LegalOwnerKind" NOT NULL DEFAULT 'ADULT',
    "liquidity" "app"."Liquidity" NOT NULL DEFAULT 'AVAILABLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."AccountOwner" (
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "status" "app"."AccountOwnerStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "AccountOwner_pkey" PRIMARY KEY ("accountId","userId")
);

-- CreateTable
CREATE TABLE "app"."AccountGrant" (
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "level" "app"."AccountGrantLevel" NOT NULL DEFAULT 'NONE',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AccountGrant_pkey" PRIMARY KEY ("accountId","membershipId")
);

-- CreateTable
CREATE TABLE "app"."BalanceSnapshot" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'GBP',
    "amountMinor" BIGINT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorMembershipId" UUID NOT NULL,
    "complete" BOOLEAN NOT NULL DEFAULT true,
    "source" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "BalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_householdId_createdAt_id_idx" ON "app"."Account"("householdId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Account_householdId_id_key" ON "app"."Account"("householdId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Account_householdId_id_currency_key" ON "app"."Account"("householdId", "id", "currency");

-- CreateIndex
CREATE INDEX "AccountOwner_householdId_membershipId_accountId_idx" ON "app"."AccountOwner"("householdId", "membershipId", "accountId");

-- CreateIndex
CREATE INDEX "AccountGrant_householdId_membershipId_accountId_idx" ON "app"."AccountGrant"("householdId", "membershipId", "accountId");

-- CreateIndex
CREATE INDEX "BalanceSnapshot_householdId_accountId_asOfDate_createdAt_id_idx" ON "app"."BalanceSnapshot"("householdId", "accountId", "asOfDate" DESC, "createdAt" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_householdId_id_key" ON "app"."Membership"("householdId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_householdId_id_userId_key" ON "app"."Membership"("householdId", "id", "userId");

-- AddForeignKey
ALTER TABLE "app"."Account" ADD CONSTRAINT "Account_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "app"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Account" ADD CONSTRAINT "Account_householdId_creatorMembershipId_creatorUserId_fkey" FOREIGN KEY ("householdId", "creatorMembershipId", "creatorUserId") REFERENCES "app"."Membership"("householdId", "id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AccountOwner" ADD CONSTRAINT "AccountOwner_householdId_accountId_fkey" FOREIGN KEY ("householdId", "accountId") REFERENCES "app"."Account"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AccountOwner" ADD CONSTRAINT "AccountOwner_householdId_membershipId_userId_fkey" FOREIGN KEY ("householdId", "membershipId", "userId") REFERENCES "app"."Membership"("householdId", "id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AccountGrant" ADD CONSTRAINT "AccountGrant_householdId_accountId_fkey" FOREIGN KEY ("householdId", "accountId") REFERENCES "app"."Account"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AccountGrant" ADD CONSTRAINT "AccountGrant_householdId_membershipId_fkey" FOREIGN KEY ("householdId", "membershipId") REFERENCES "app"."Membership"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BalanceSnapshot" ADD CONSTRAINT "BalanceSnapshot_householdId_accountId_currency_fkey" FOREIGN KEY ("householdId", "accountId", "currency") REFERENCES "app"."Account"("householdId", "id", "currency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."BalanceSnapshot" ADD CONSTRAINT "BalanceSnapshot_householdId_authorMembershipId_fkey" FOREIGN KEY ("householdId", "authorMembershipId") REFERENCES "app"."Membership"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- No runtime login exists until the local credential setup is run explicitly.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'joint_app_runtime') THEN
    CREATE ROLE joint_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'joint_app_runtime' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Existing runtime role has unsafe privileges';
  END IF;
END $$;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO joint_app_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON app."User", app."Membership", app."SessionRegistry", app."Household", app."Invitation", app."RequestKey", app."Job", app."OutboxEvent" TO joint_app_runtime;
GRANT SELECT, INSERT ON app."AuditEvent" TO joint_app_runtime;

ALTER TABLE app."Account" ADD CONSTRAINT "Account_valid_fields" CHECK (currency = 'GBP' AND length(btrim(label)) BETWEEN 1 AND 80 AND version > 0);
ALTER TABLE app."AccountGrant" ADD CONSTRAINT "AccountGrant_positive_version" CHECK (version > 0);
ALTER TABLE app."BalanceSnapshot" ADD CONSTRAINT "BalanceSnapshot_manual_fields" CHECK (currency = 'GBP' AND source = 'MANUAL' AND complete);

-- The API supplies these values from its verified AuthContext. Recheck all live
-- records per statement; transaction-local scope is never pooled session state.
CREATE FUNCTION app.scope_is_valid() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM app."Membership" m
    JOIN app."User" u ON u.id = m."userId" AND u.status = 'ACTIVE'
    JOIN app."SessionRegistry" s ON s."userId" = m."userId" AND s."householdId" = m."householdId"
    WHERE m.id = nullif(current_setting('joint.membership_id', true), '')::uuid
      AND m."userId" = nullif(current_setting('joint.user_id', true), '')::uuid
      AND m."householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
      AND m.status = 'ACTIVE' AND m."grantVersion"::text = current_setting('joint.grant_version', true)
      AND s.id = nullif(current_setting('joint.session_id', true), '')::uuid
      AND s."revokedAt" IS NULL AND s."expiresAt" > clock_timestamp() AND s.purpose = 'NORMAL'
  )
$$;
CREATE FUNCTION app.owns_account(account_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.scope_is_valid() AND EXISTS (
    SELECT 1 FROM app."Account" a
    WHERE a.id = account_id AND a."householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM app."AccountOwner" o WHERE o."accountId" = a.id AND o."householdId" = a."householdId"
          AND o."membershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid
          AND o."userId" = nullif(current_setting('joint.user_id', true), '')::uuid AND o.status = 'ACTIVE'
      )
  )
$$;
CREATE FUNCTION app.account_access(account_id uuid, required_level app."AccountGrantLevel") RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT required_level <> 'NONE' AND app.scope_is_valid() AND EXISTS (
    SELECT 1 FROM app."Account" a
    WHERE a.id = account_id AND a."householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
      AND (app.owns_account(a.id) OR EXISTS (
        SELECT 1 FROM app."AccountGrant" g WHERE g."accountId" = a.id AND g."householdId" = a."householdId"
          AND g."membershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid AND g.level >= required_level
      ))
  )
$$;
CREATE FUNCTION app.can_record_owner(account_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.scope_is_valid() AND EXISTS (
    SELECT 1 FROM app."Account" a WHERE a.id = account_id
      AND a."householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
      AND a."creatorUserId" = nullif(current_setting('joint.user_id', true), '')::uuid
      AND a."creatorMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid
      AND a."legalOwnerKind" = 'ADULT'
      AND NOT EXISTS (SELECT 1 FROM app."AccountOwner" o WHERE o."accountId" = a.id)
  )
$$;
CREATE FUNCTION app.scope_has_recent_mfa() RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT current_setting('joint.aal', true) = 'aal2' AND CASE
    WHEN current_setting('joint.mfa_authenticated_at', true) ~ '^[0-9]{1,16}$' THEN
      current_setting('joint.mfa_authenticated_at', true)::bigint BETWEEN
        extract(epoch FROM clock_timestamp() - interval '5 minutes') * 1000 AND extract(epoch FROM clock_timestamp()) * 1000
    ELSE false END
$$;
CREATE FUNCTION app.check_grant_widening() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF current_user = 'joint_app_runtime' AND ((TG_OP = 'INSERT' AND NEW.level <> 'NONE') OR (TG_OP = 'UPDATE' AND NEW.level > OLD.level)) THEN
    IF NOT coalesce(app.scope_has_recent_mfa(), false) THEN
      RAISE EXCEPTION 'Recent verified MFA is required to widen sharing' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AccountGrant_recent_mfa" BEFORE INSERT OR UPDATE ON app."AccountGrant" FOR EACH ROW EXECUTE FUNCTION app.check_grant_widening();
CREATE FUNCTION app.check_snapshot_amount() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW."amountMinor" < 0 AND EXISTS (
    SELECT 1 FROM app."Account" WHERE id = NEW."accountId" AND "householdId" = NEW."householdId"
      AND kind IN ('CREDIT_CARD', 'LOAN', 'MORTGAGE', 'OTHER_LIABILITY')
  ) THEN RAISE EXCEPTION 'Outstanding debt must be nonnegative' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "BalanceSnapshot_debt_sign" BEFORE INSERT ON app."BalanceSnapshot" FOR EACH ROW EXECUTE FUNCTION app.check_snapshot_amount();

-- Only these tables have finance privileges. Column UPDATE grants prevent
-- account identity, ownership, provenance or tenant changes at the SQL boundary.
REVOKE ALL ON app."Account", app."AccountOwner", app."AccountGrant", app."BalanceSnapshot" FROM PUBLIC, joint_app_runtime;
GRANT SELECT, INSERT ON app."Account", app."AccountOwner", app."AccountGrant", app."BalanceSnapshot" TO joint_app_runtime;
GRANT UPDATE (label, liquidity, version) ON app."Account" TO joint_app_runtime;
GRANT UPDATE (level, version) ON app."AccountGrant" TO joint_app_runtime;
ALTER TABLE app."Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."Account" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."AccountOwner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."AccountOwner" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."AccountGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."AccountGrant" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."BalanceSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."BalanceSnapshot" FORCE ROW LEVEL SECURITY;

-- Definer functions use this explicit maintenance policy, avoiding recursion
-- without requiring the migration owner to have BYPASSRLS or superuser status.
CREATE POLICY maintenance ON app."Account" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."AccountOwner" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."AccountGrant" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."BalanceSnapshot" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY account_read ON app."Account" FOR SELECT TO joint_app_runtime USING (
  app.account_access(id, 'TOTALS') OR app.can_record_owner(id)
);
CREATE POLICY account_create ON app."Account" FOR INSERT TO joint_app_runtime WITH CHECK (
  app.scope_is_valid() AND "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
    AND "creatorUserId" = nullif(current_setting('joint.user_id', true), '')::uuid AND "creatorMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid
    AND "legalOwnerKind" = 'ADULT' AND current_setting('joint.aal', true) = 'aal2' AND "archivedAt" IS NULL AND version = 1
);
CREATE POLICY account_edit ON app."Account" FOR UPDATE TO joint_app_runtime USING (app.owns_account(id)) WITH CHECK (app.owns_account(id));
CREATE POLICY owner_read ON app."AccountOwner" FOR SELECT TO joint_app_runtime USING (app.account_access("accountId", 'TOTALS'));
CREATE POLICY owner_create ON app."AccountOwner" FOR INSERT TO joint_app_runtime WITH CHECK (
  app.can_record_owner("accountId") AND "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
    AND "userId" = nullif(current_setting('joint.user_id', true), '')::uuid AND "membershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid AND status = 'ACTIVE'
);
CREATE POLICY grant_read ON app."AccountGrant" FOR SELECT TO joint_app_runtime USING (app.owns_account("accountId") OR (app.account_access("accountId", 'TOTALS') AND "membershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid));
CREATE POLICY grant_create ON app."AccountGrant" FOR INSERT TO joint_app_runtime WITH CHECK (
  app.owns_account("accountId") AND EXISTS (SELECT 1 FROM app."Membership" m WHERE m.id = "AccountGrant"."membershipId" AND m."householdId" = "AccountGrant"."householdId" AND m.status = 'ACTIVE')
);
CREATE POLICY grant_edit ON app."AccountGrant" FOR UPDATE TO joint_app_runtime USING (app.owns_account("accountId")) WITH CHECK (app.owns_account("accountId"));
CREATE POLICY balance_read ON app."BalanceSnapshot" FOR SELECT TO joint_app_runtime USING (app.account_access("accountId", 'TOTALS'));
CREATE POLICY balance_create ON app."BalanceSnapshot" FOR INSERT TO joint_app_runtime WITH CHECK (
  app.owns_account("accountId") AND "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
    AND "authorMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid
);

REVOKE ALL ON FUNCTION app.scope_is_valid(), app.owns_account(uuid), app.account_access(uuid, app."AccountGrantLevel"), app.can_record_owner(uuid), app.scope_has_recent_mfa(), app.check_grant_widening(), app.check_snapshot_amount() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.scope_is_valid(), app.owns_account(uuid), app.account_access(uuid, app."AccountGrantLevel"), app.can_record_owner(uuid), app.scope_has_recent_mfa() TO joint_app_runtime;
DO $$ DECLARE blocked_role text; BEGIN
  FOREACH blocked_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = blocked_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA app FROM %I', blocked_role);
      EXECUTE format('REVOKE ALL ON app."Account", app."AccountOwner", app."AccountGrant", app."BalanceSnapshot" FROM %I', blocked_role);
    END IF;
  END LOOP;
END $$;
COMMIT;
