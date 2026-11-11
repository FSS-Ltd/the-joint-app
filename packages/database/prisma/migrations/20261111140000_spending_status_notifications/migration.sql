BEGIN;

-- Wake status observers when spending report inputs change; payloads remain opaque.
DO $$
DECLARE relation_name text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY[
  'Transaction','TransactionOverride','TransactionSplit','AccountMonthCoverage',
  'BudgetScope','BudgetScopeAccount','Budget','BudgetLine'
 ] LOOP
  EXECUTE format('CREATE TRIGGER status_change_insert_delete AFTER INSERT OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.notify_status_wakeup()', relation_name);
  EXECUTE format('CREATE TRIGGER status_change_update AFTER UPDATE ON app.%I FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION app.notify_status_wakeup()', relation_name);
 END LOOP;
END $$;

COMMIT;
