BEGIN;
-- Availability changes do not mutate account/valuation versions. Notify after
-- durable evidence changes so subscribers can reconcile their authorized view.
CREATE TRIGGER allocation_funding_change AFTER INSERT OR DELETE ON app."FundingEvidence"
  FOR EACH ROW EXECUTE FUNCTION app.notify_status_wakeup();
CREATE TRIGGER allocation_goal_change AFTER INSERT ON app."GoalRevision"
  FOR EACH ROW EXECUTE FUNCTION app.notify_status_wakeup();
COMMIT;
