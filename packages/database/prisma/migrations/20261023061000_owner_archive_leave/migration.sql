BEGIN;

-- Archive authority deliberately contains no household or membership supplied by
-- callers. An independently authenticated live session still gates every read.
CREATE FUNCTION app.archive_scope_is_valid() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT current_setting('joint.archive', true) = 'owner' AND EXISTS (
    SELECT 1 FROM app."User" u JOIN app."SessionRegistry" s ON s."userId" = u.id
    WHERE u.id = nullif(current_setting('joint.user_id', true), '')::uuid
      AND u.status = 'ACTIVE'
      AND s.id = nullif(current_setting('joint.session_id', true), '')::uuid
      AND s.purpose = 'NORMAL' AND s."revokedAt" IS NULL AND s."expiresAt" > clock_timestamp()
  )
$$;
CREATE FUNCTION app.archive_owns_account(account_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.archive_scope_is_valid() AND EXISTS (
    SELECT 1 FROM app."AccountOwner" o JOIN app."Membership" m
      ON m.id = o."membershipId" AND m."userId" = o."userId" AND m."householdId" = o."householdId"
    WHERE o."accountId" = account_id
      AND o."userId" = nullif(current_setting('joint.user_id', true), '')::uuid
      AND o.status = 'ARCHIVED' AND m.status = 'LEFT'
  )
$$;
CREATE POLICY archive_account_read ON app."Account" FOR SELECT TO joint_app_runtime USING (app.archive_owns_account(id));
CREATE POLICY archive_owner_read ON app."AccountOwner" FOR SELECT TO joint_app_runtime USING (
  app.archive_owns_account("accountId") AND "userId" = nullif(current_setting('joint.user_id', true), '')::uuid
);
CREATE POLICY archive_balance_read ON app."BalanceSnapshot" FOR SELECT TO joint_app_runtime USING (app.archive_owns_account("accountId"));
CREATE POLICY archive_transaction_read ON app."Transaction" FOR SELECT TO joint_app_runtime USING (app.archive_owns_account("accountId"));
CREATE POLICY archive_override_read ON app."TransactionOverride" FOR SELECT TO joint_app_runtime USING (app.archive_owns_account("accountId"));
CREATE POLICY archive_split_read ON app."TransactionSplit" FOR SELECT TO joint_app_runtime USING (app.archive_owns_account("accountId"));
CREATE POLICY archive_note_read ON app."TransactionNote" FOR SELECT TO joint_app_runtime USING (
  app.archive_owns_account("accountId") AND "authorUserId" = nullif(current_setting('joint.user_id', true), '')::uuid
);

-- Parent export migration replaces this hook. Called within the same leave
-- transaction, before it commits or any new export may pass scope checks.
CREATE FUNCTION app.invalidate_household_privacy_exports(household_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$ SELECT $$;

CREATE FUNCTION app.leave_household() RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  actor_id uuid := nullif(current_setting('joint.user_id', true), '')::uuid;
  household_id uuid := nullif(current_setting('joint.household_id', true), '')::uuid;
  member_id uuid := nullif(current_setting('joint.membership_id', true), '')::uuid;
  source_ids uuid[];
BEGIN
  PERFORM 1 FROM app."User" WHERE id = actor_id AND status = 'ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable actor' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM app."Household" WHERE id = household_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(app.scope_is_valid(), false) THEN
    RAISE EXCEPTION 'Unavailable membership' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(o."accountId" ORDER BY o."accountId"), ARRAY[]::uuid[]) INTO source_ids
    FROM app."AccountOwner" o WHERE o."householdId" = household_id
      AND o."membershipId" = member_id AND o."userId" = actor_id AND o.status = 'ACTIVE';
  PERFORM 1 FROM app."Account" WHERE id = ANY(source_ids) ORDER BY id FOR UPDATE;
  UPDATE app."AccountGrant" SET level = 'NONE', version = version + 1
    WHERE "householdId" = household_id AND ("membershipId" = member_id OR "accountId" = ANY(source_ids));
  UPDATE app."AccountOwner" SET status = 'ARCHIVED'
    WHERE "householdId" = household_id AND "membershipId" = member_id AND "userId" = actor_id AND status = 'ACTIVE';
  UPDATE app."Account" a SET "archivedAt" = clock_timestamp()
    WHERE a.id = ANY(source_ids) AND NOT EXISTS (
      SELECT 1 FROM app."AccountOwner" o WHERE o."accountId" = a.id AND o.status = 'ACTIVE'
    );
  IF EXISTS (SELECT 1 FROM app."Membership" WHERE id = member_id AND role = 'ADMIN') THEN
    UPDATE app."Membership" SET role = 'ADMIN' WHERE id = (
      SELECT m.id FROM app."Membership" m JOIN app."User" u ON u.id = m."userId" AND u.status = 'ACTIVE'
        WHERE m."householdId" = household_id AND m.status = 'ACTIVE' AND m.id <> member_id ORDER BY m.id LIMIT 1
    );
  END IF;
  UPDATE app."Membership" SET "grantVersion" = "grantVersion" + 1
    WHERE "householdId" = household_id AND status = 'ACTIVE';
  UPDATE app."Membership" SET status = 'LEFT', slot = NULL WHERE id = member_id;
  UPDATE app."SessionRegistry" SET "revokedAt" = clock_timestamp(), "providerTokens" = NULL
    WHERE "householdId" = household_id AND "revokedAt" IS NULL;
  UPDATE app."Invitation" SET "revokedAt" = clock_timestamp()
    WHERE "householdId" = household_id AND "consumedAt" IS NULL AND "revokedAt" IS NULL;
  PERFORM app.invalidate_household_privacy_exports(household_id);
  UPDATE app."Household" SET revision = revision + 1 WHERE id = household_id;
  INSERT INTO app."AuditEvent" (id, "userId", "householdId", action)
    VALUES (gen_random_uuid(), actor_id, household_id, 'HOUSEHOLD_LEFT');
  RETURN QUERY SELECT unnest(source_ids);
END
$$;

-- Reactivating the same membership would erase the proof that these are exited
-- records. New-household import remains possible; moving sources needs review.
CREATE FUNCTION app.protect_archived_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.status = 'LEFT' AND NEW.status = 'ACTIVE' AND EXISTS (
    SELECT 1 FROM app."AccountOwner" WHERE "membershipId" = OLD.id AND status = 'ARCHIVED'
  ) THEN RAISE EXCEPTION 'Archived membership cannot be reactivated' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Membership_preserve_archive" BEFORE UPDATE OF status ON app."Membership"
  FOR EACH ROW EXECUTE FUNCTION app.protect_archived_membership();

REVOKE ALL ON FUNCTION app.archive_scope_is_valid(), app.archive_owns_account(uuid), app.leave_household(),
  app.invalidate_household_privacy_exports(uuid), app.protect_archived_membership() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.archive_scope_is_valid(), app.archive_owns_account(uuid), app.leave_household() TO joint_app_runtime;
COMMIT;
