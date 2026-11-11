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

-- Wake observers for the remaining spending inputs with empty notifications.
DO $$
DECLARE relation_name text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY[
  'AccountMonthCoverage','BudgetScope','BudgetScopeAccount','Budget','BudgetLine'
 ] LOOP
  EXECUTE format('CREATE TRIGGER status_change_insert_delete AFTER INSERT OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.notify_status_wakeup()', relation_name);
  EXECUTE format('CREATE TRIGGER status_change_update AFTER UPDATE ON app.%I FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION app.notify_status_wakeup()', relation_name);
 END LOOP;
END $$;

COMMIT;
