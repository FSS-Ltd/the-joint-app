BEGIN;
-- INSERT RETURNING evaluates SELECT policies before a STABLE function can see
-- the inserted row. Validate its creator fields directly during initial setup;
-- after any owner is recorded, ordinary ownership/grant policies take over.
CREATE FUNCTION app.account_has_owner(account_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.scope_is_valid() AND EXISTS (
    SELECT 1 FROM app."AccountOwner" WHERE "accountId" = account_id
      AND "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
  )
$$;
REVOKE ALL ON FUNCTION app.account_has_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.account_has_owner(uuid) TO joint_app_runtime;
ALTER POLICY account_read ON app."Account" USING (
  app.account_access(id, 'TOTALS') OR (
    app.scope_is_valid() AND "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
    AND "creatorUserId" = nullif(current_setting('joint.user_id', true), '')::uuid
    AND "creatorMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid
    AND NOT app.account_has_owner(id)
  )
);
ALTER POLICY owner_read ON app."AccountOwner" USING (
  app.account_access("accountId", 'TOTALS') OR (
    "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
    AND "userId" = nullif(current_setting('joint.user_id', true), '')::uuid
    AND "membershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid
    AND app.can_record_owner("accountId")
  )
);
COMMIT;
