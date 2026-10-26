BEGIN;
-- A surviving person must independently hold both source and goal rights.
CREATE FUNCTION app.allocation_revision_is_retained(account_id uuid, goal_id uuid, revision_version integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM app."AccountOwner" o JOIN app."User" u ON u.id=o."userId"
    JOIN app."GoalParticipant" p ON p."membershipId"=o."membershipId" AND p."goalId"=goal_id
    WHERE o."accountId"=account_id AND u.status<>'DELETED'
      AND ((o.status='ACTIVE' AND p."cutoffVersion" IS NULL) OR (o.status='ARCHIVED' AND o."allocationCutoffVersion">=revision_version)))
$$;
CREATE OR REPLACE FUNCTION app.guard_allocation_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' OR (
    EXISTS(SELECT 1 FROM app."Account" WHERE id=OLD."accountId")
    AND EXISTS(SELECT 1 FROM app."Goal" WHERE id=OLD."goalId")
    AND (OLD."valuationId" IS NULL OR EXISTS(SELECT 1 FROM app."BalanceSnapshot" WHERE id=OLD."valuationId"))
    AND app.allocation_revision_is_retained(OLD."accountId",OLD."goalId",OLD.version)
  ) THEN RAISE EXCEPTION 'Allocation history is immutable' USING ERRCODE='23514'; END IF;
  RETURN OLD;
END $$;
CREATE FUNCTION app.purge_private_allocations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected uuid[]; source_id uuid; head app."AccountAllocationRevision";
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='DELETED' THEN
    SELECT coalesce(array_agg("accountId" ORDER BY "accountId"),ARRAY[]::uuid[]) INTO affected FROM app."AccountOwner" WHERE "userId"=NEW.id;
    PERFORM 1 FROM app."Account" WHERE id=ANY(affected) ORDER BY id FOR UPDATE;
    DELETE FROM app."GoalAllocation" a WHERE a."accountId"=ANY(affected) AND a."sourceVersion" IS NOT NULL
      AND NOT app.allocation_revision_is_retained(a."accountId",a."goalId",a."sourceVersion");
    DELETE FROM app."AccountAllocationRevision" r WHERE r."accountId"=ANY(affected)
      AND NOT app.allocation_revision_is_retained(r."accountId",r."goalId",r.version);
    FOREACH source_id IN ARRAY affected LOOP
      IF NOT EXISTS(SELECT 1 FROM app."AccountOwner" o JOIN app."User" u ON u.id=o."userId" WHERE o."accountId"=source_id AND o.status='ACTIVE' AND u.status<>'DELETED') THEN
        SELECT * INTO head FROM app."AccountAllocationRevision" WHERE "accountId"=source_id ORDER BY version DESC LIMIT 1;
        IF head.version IS NULL THEN DELETE FROM app."AccountAllocationState" WHERE "accountId"=source_id;
        ELSE UPDATE app."AccountAllocationState" SET version=head.version,"updatedAt"=head."createdAt" WHERE "accountId"=source_id;
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
-- Run after existing participant purge so deleted rights cannot justify history.
CREATE TRIGGER zz_allocation_purge AFTER UPDATE OF status ON app."User" FOR EACH ROW EXECUTE FUNCTION app.purge_private_allocations();
REVOKE ALL ON FUNCTION app.allocation_revision_is_retained(uuid,uuid,integer),app.purge_private_allocations() FROM PUBLIC,joint_app_runtime;
COMMIT;
