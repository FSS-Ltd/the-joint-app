BEGIN;
CREATE FUNCTION app.capture_contribution_goal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p app."ContributionPlan"; budget_version integer; input jsonb; entry jsonb;
BEGIN
  -- A privacy rewind restores an existing immutable head; it is not a new edit.
  IF NEW.version<=OLD.version THEN RETURN NEW; END IF;
  SELECT * INTO p FROM app."ContributionPlan" WHERE "householdId"=NEW."householdId" AND "goalId"=NEW.id AND "budgetId" IS NOT NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT version INTO budget_version FROM app."ContributionBudget" WHERE id=p."budgetId" FOR UPDATE;
  SELECT jsonb_build_object('firstContributionDate',to_char(p."firstContributionDate",'YYYY-MM-DD'),
    'monthlyContributions',jsonb_agg(jsonb_build_object('fromMonth',"fromMonth",
      'amount',jsonb_build_object('amountMinor',"amountMinor"::text,'currency','GBP')) ORDER BY "fromMonth"))
    INTO input FROM app."ContributionStep" WHERE "planId"=p.id;
  entry:=app.contribution_plan_entry(NEW.id,p.id,p.version,input);
  PERFORM app.record_contribution_revision(p."budgetId",budget_version,NEW.id,jsonb_build_object('kind','GOAL','entry',entry));
  RETURN NEW;
END $$;
CREATE TRIGGER contribution_goal_revision AFTER UPDATE ON app."Goal" FOR EACH ROW EXECUTE FUNCTION app.capture_contribution_goal();

CREATE FUNCTION app.freeze_contribution_participation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.status='ACTIVE' AND NEW.status='LEFT' THEN
    PERFORM b.id FROM app."ContributionBudget" b JOIN app."ContributionBudgetParticipant" p ON p."budgetId"=b.id
      WHERE p."membershipId"=OLD.id ORDER BY b.id FOR UPDATE OF b;
    UPDATE app."ContributionBudgetParticipant" p SET "cutoffVersion"=b.version FROM app."ContributionBudget" b
      WHERE p."membershipId"=OLD.id AND p."budgetId"=b.id AND p."cutoffVersion" IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contribution_participant_exit AFTER UPDATE OF status ON app."Membership"
  FOR EACH ROW EXECUTE FUNCTION app.freeze_contribution_participation();
CREATE FUNCTION app.guard_contribution_cutoff() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD."cutoffVersion" IS NOT NULL THEN NEW."cutoffVersion":=OLD."cutoffVersion";
  ELSIF NEW."cutoffVersion" IS NOT NULL THEN
    SELECT b.version INTO NEW."cutoffVersion" FROM app."ContributionBudget" b JOIN app."Membership" m ON m.id=NEW."membershipId"
      WHERE b.id=NEW."budgetId" AND m.status='LEFT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contribution_cutoff_immutable BEFORE UPDATE OF "cutoffVersion" ON app."ContributionBudgetParticipant"
  FOR EACH ROW EXECUTE FUNCTION app.guard_contribution_cutoff();
REVOKE ALL ON FUNCTION app.capture_contribution_goal(),app.freeze_contribution_participation(),app.guard_contribution_cutoff() FROM PUBLIC,joint_app_runtime;
COMMIT;
