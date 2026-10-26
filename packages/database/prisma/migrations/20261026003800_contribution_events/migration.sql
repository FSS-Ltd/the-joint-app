BEGIN;
CREATE TRIGGER contribution_change AFTER INSERT ON app."ContributionBudgetRevision"
  FOR EACH ROW EXECUTE FUNCTION app.notify_status_wakeup();
COMMIT;
