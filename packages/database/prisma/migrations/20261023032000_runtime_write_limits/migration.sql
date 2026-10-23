BEGIN;
-- Parent-row cascades bypass child-row RLS. These lifecycle deletions have no
-- current runtime flow; fixtures and future audited deletion tooling use an
-- explicitly privileged maintenance connection, never the application login.
REVOKE DELETE ON app."User", app."Membership", app."SessionRegistry", app."Household", app."Invitation", app."Job", app."OutboxEvent" FROM joint_app_runtime;
REVOKE UPDATE ON app."OutboxEvent" FROM joint_app_runtime;
-- Validation must see only accounts already visible to its caller. A definer
-- trigger could otherwise reveal a hidden account's liability kind through its
-- error before the INSERT policy rejects the cross-account write.
ALTER FUNCTION app.check_snapshot_amount() SECURITY INVOKER;
COMMIT;
