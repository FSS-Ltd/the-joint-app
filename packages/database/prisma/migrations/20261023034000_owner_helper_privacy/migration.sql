BEGIN;
-- The INSERT RETURNING helper only needs to inspect the creator's own account.
-- A same-household hidden UUID must be indistinguishable from an unknown UUID.
CREATE OR REPLACE FUNCTION app.account_has_owner(account_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.scope_is_valid() AND EXISTS (
    SELECT 1 FROM app."Account" a
    JOIN app."AccountOwner" o ON o."accountId" = a.id AND o."householdId" = a."householdId"
    WHERE a.id = account_id
      AND a."householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
      AND a."creatorUserId" = nullif(current_setting('joint.user_id', true), '')::uuid
      AND a."creatorMembershipId" = nullif(current_setting('joint.membership_id', true), '')::uuid
  )
$$;
COMMIT;
