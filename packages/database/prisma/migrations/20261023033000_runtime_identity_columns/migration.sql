BEGIN;
-- Immutable parent identity columns must also be protected: foreign-key UPDATE
-- cascades are referential-integrity operations and can bypass child-row RLS.
REVOKE UPDATE ON app."User", app."Membership", app."SessionRegistry", app."Household", app."Invitation", app."Job", app."RequestKey" FROM joint_app_runtime;
GRANT UPDATE (status, "emailHash") ON app."User" TO joint_app_runtime;
GRANT UPDATE (role, status, slot, "grantVersion", "acceptedAt") ON app."Membership" TO joint_app_runtime;
GRANT UPDATE ("householdId", "providerTokens", "providerExpiresAt", purpose, "expiresAt", "revokedAt", "lastSeenAt") ON app."SessionRegistry" TO joint_app_runtime;
GRANT UPDATE (name, "baseCurrency", timezone, revision) ON app."Household" TO joint_app_runtime;
GRANT UPDATE ("consumedAt", "revokedAt") ON app."Invitation" TO joint_app_runtime;
GRANT UPDATE (state, attempt, "runAfter", "leaseOwner", "leaseToken", "leaseUntil") ON app."Job" TO joint_app_runtime;
COMMIT;
