BEGIN;
-- Source deletion is a privacy cascade; valuation edits remain prohibited.
ALTER TABLE app."GoalAllocation" DROP CONSTRAINT "GoalAllocation_account_fkey";
ALTER TABLE app."GoalAllocation" ADD CONSTRAINT "GoalAllocation_account_fkey" FOREIGN KEY("householdId","accountId") REFERENCES app."Account"("householdId",id) ON DELETE CASCADE;
CREATE FUNCTION app.release_source_allocations(account_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE goal_id uuid;
BEGIN
  PERFORM 1 FROM app."Account" WHERE id=account_id FOR UPDATE;
  FOR goal_id IN SELECT "goalId" FROM app."GoalAllocation" WHERE "accountId"=account_id AND "sourceVersion" IS NOT NULL ORDER BY "goalId" LOOP
    PERFORM app.record_goal_allocation(account_id,goal_id,NULL);
  END LOOP;
END $$;
CREATE FUNCTION app.freeze_owner_allocations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='INSERT' THEN NEW."allocationCutoffVersion":=0;
  ELSIF OLD.status='ACTIVE' AND NEW.status='ARCHIVED' THEN
    PERFORM 1 FROM app."Account" WHERE id=OLD."accountId" FOR UPDATE;
    SELECT coalesce((SELECT version FROM app."AccountAllocationState" WHERE "accountId"=OLD."accountId"),0) INTO NEW."allocationCutoffVersion";
  ELSE NEW."allocationCutoffVersion":=OLD."allocationCutoffVersion";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER owner_allocation_cutoff BEFORE INSERT OR UPDATE ON app."AccountOwner" FOR EACH ROW EXECUTE FUNCTION app.freeze_owner_allocations();
CREATE FUNCTION app.release_uncontrolled_allocations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM app."AccountOwner" WHERE "accountId"=NEW."accountId" AND status='ACTIVE') THEN
    PERFORM app.release_source_allocations(NEW."accountId");
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER allocation_last_owner AFTER UPDATE OF status ON app."AccountOwner"
  FOR EACH ROW WHEN(OLD.status='ACTIVE' AND NEW.status='ARCHIVED') EXECUTE FUNCTION app.release_uncontrolled_allocations();
CREATE FUNCTION app.release_archived_allocations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN PERFORM app.release_source_allocations(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER allocation_source_archived AFTER UPDATE OF "archivedAt" ON app."Account"
  FOR EACH ROW WHEN(OLD."archivedAt" IS NULL AND NEW."archivedAt" IS NOT NULL) EXECUTE FUNCTION app.release_archived_allocations();

-- Preserve the established metadata implementation and input boundary. Both
-- release and metadata mutation share one transaction, including any failure.
ALTER FUNCTION app.write_goal(uuid,integer,jsonb) RENAME TO write_goal_metadata;
REVOKE ALL ON FUNCTION app.write_goal_metadata(uuid,integer,jsonb) FROM PUBLIC,joint_app_runtime;
CREATE FUNCTION app.write_goal(goal_id uuid, expected_version integer, input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source_id uuid;
BEGIN
  IF app.lock_goal_scope() THEN RAISE EXCEPTION 'Unavailable goal' USING ERRCODE='42501'; END IF;
  IF input->>'status'='ARCHIVED' AND app.goal_ceiling(goal_id,false) IS NOT NULL THEN
    FOR source_id IN SELECT "accountId" FROM app."GoalAllocation" WHERE "goalId"=goal_id ORDER BY "accountId" LOOP
      PERFORM 1 FROM app."Account" WHERE id=source_id FOR UPDATE;
    END LOOP;
    PERFORM 1 FROM app."Goal" WHERE id=goal_id AND "householdId"=nullif(current_setting('joint.household_id',true),'')::uuid FOR UPDATE;
    FOR source_id IN SELECT "accountId" FROM app."GoalAllocation" WHERE "goalId"=goal_id AND "sourceVersion" IS NOT NULL ORDER BY "accountId" LOOP
      PERFORM app.record_goal_allocation(source_id,goal_id,NULL);
    END LOOP;
  END IF;
  RETURN app.write_goal_metadata(goal_id,expected_version,input);
END $$;
REVOKE ALL ON FUNCTION app.write_goal(uuid,integer,jsonb) FROM PUBLIC,joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.write_goal(uuid,integer,jsonb) TO joint_app_runtime;
REVOKE ALL ON FUNCTION app.release_source_allocations(uuid),app.freeze_owner_allocations(),app.release_uncontrolled_allocations(),app.release_archived_allocations() FROM PUBLIC,joint_app_runtime;
COMMIT;
