BEGIN;

-- Ledger inputs already advance the export detail fence and wake status observers.
CREATE FUNCTION app.spending_ledger_revisions(account_ids uuid[])
RETURNS TABLE("accountId" uuid, revision text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT v."accountId", v."detailVersion"::text
 FROM app."ExportAccountRevision" v
 JOIN app."Account" a ON a.id = v."accountId"
 WHERE cardinality(account_ids) BETWEEN 1 AND 50
   AND v."accountId" = ANY(account_ids)
   AND a."householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
   AND a."archivedAt" IS NULL
   AND app.scope_is_valid()
   AND app.account_access(a.id, 'TRANSACTIONS')
$$;
REVOKE ALL ON FUNCTION app.spending_ledger_revisions(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.spending_ledger_revisions(uuid[]) TO joint_app_runtime;

CREATE FUNCTION app.signal_spending_scope(household uuid) RETURNS void
LANGUAGE sql SET search_path = pg_catalog AS $$
 SELECT pg_notify('joint_spending_wakeup',
  encode(sha256(convert_to('joint.spending:' || household::text, 'UTF8')), 'hex'))
 WHERE household IS NOT NULL
$$;
REVOKE ALL ON FUNCTION app.signal_spending_scope(uuid) FROM PUBLIC;

CREATE FUNCTION app.notify_spending_wakeup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE household uuid;
BEGIN
 IF TG_TABLE_NAME = 'ExportAccountRevision' THEN
  SELECT a."householdId" INTO household FROM app."Account" a WHERE a.id = NEW."accountId";
  PERFORM app.signal_spending_scope(household);
 ELSIF TG_TABLE_NAME IN ('User','ClerkIdentity','ClerkSession','ClerkResourceState') THEN
  -- These authorities are shared across resources and have no household column.
  PERFORM pg_notify('joint_spending_wakeup', '');
 ELSE
  IF TG_OP <> 'DELETE' THEN
   PERFORM app.signal_spending_scope(NEW."householdId");
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD."householdId" IS DISTINCT FROM NEW."householdId") THEN
   PERFORM app.signal_spending_scope(OLD."householdId");
  END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.notify_spending_wakeup() FROM PUBLIC;

-- Keep existing status notifications compatible. Spending observers receive only
-- matching household hints and shared authority changes on their own channel.
DO $$
DECLARE relation_name text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY[
  'Account','AccountOwner','AccountGrant','Membership','User','ClerkIdentity','ClerkSession',
  'AccountMonthCoverage','BudgetScope','BudgetScopeAccount','Budget','BudgetLine'
 ] LOOP
  EXECUTE format('CREATE TRIGGER spending_change_insert_delete AFTER INSERT OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.notify_spending_wakeup()', relation_name);
  EXECUTE format('CREATE TRIGGER spending_change_update AFTER UPDATE ON app.%I FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION app.notify_spending_wakeup()', relation_name);
 END LOOP;
END $$;

CREATE TRIGGER spending_ledger_change AFTER UPDATE OF "detailVersion" ON app."ExportAccountRevision"
 FOR EACH ROW WHEN (OLD."detailVersion" IS DISTINCT FROM NEW."detailVersion")
 EXECUTE FUNCTION app.notify_spending_wakeup();

CREATE TRIGGER spending_session_insert_delete AFTER INSERT OR DELETE ON app."SessionRegistry"
 FOR EACH ROW EXECUTE FUNCTION app.notify_spending_wakeup();
CREATE TRIGGER spending_session_update AFTER UPDATE ON app."SessionRegistry"
 FOR EACH ROW WHEN (
  (OLD."userId",OLD."householdId",OLD.kind,OLD."browserTokenHash",OLD.purpose,OLD."expiresAt",OLD."revokedAt")
  IS DISTINCT FROM
  (NEW."userId",NEW."householdId",NEW.kind,NEW."browserTokenHash",NEW.purpose,NEW."expiresAt",NEW."revokedAt")
 ) EXECUTE FUNCTION app.notify_spending_wakeup();

CREATE TRIGGER spending_clerk_resource_insert_delete AFTER INSERT OR DELETE ON app."ClerkResourceState"
 FOR EACH ROW EXECUTE FUNCTION app.notify_spending_wakeup();
CREATE TRIGGER spending_clerk_resource_update AFTER UPDATE ON app."ClerkResourceState"
 FOR EACH ROW WHEN (
  (OLD.issuer,OLD."resourceId",OLD.subject,OLD.kind,OLD.state)
  IS DISTINCT FROM (NEW.issuer,NEW."resourceId",NEW.subject,NEW.kind,NEW.state)
 ) EXECUTE FUNCTION app.notify_spending_wakeup();

COMMIT;
