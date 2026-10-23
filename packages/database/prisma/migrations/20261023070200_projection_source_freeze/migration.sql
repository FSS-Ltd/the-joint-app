BEGIN;

-- Existing runs are already committed: zero prevents retroactive source additions.
-- New runs record the full transaction ID, so source rows must be supplied atomically.
ALTER TABLE app."ProjectionRun" ADD COLUMN "creationTransactionId" bigint NOT NULL DEFAULT 0;
ALTER TABLE app."ProjectionRun" ALTER COLUMN "creationTransactionId" SET DEFAULT txid_current();

CREATE FUNCTION app.guard_projection_source_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM app."ProjectionRun" r
      WHERE r."householdId" = NEW."householdId" AND r.id = NEW."runId"
        AND r."creationTransactionId" = txid_current()
    ) THEN
      RAISE EXCEPTION 'Projection sources must be stored with their run'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Cascading deletion after the parent run is removed remains possible for
  -- authorised maintenance and privacy workflows. A standalone delete fails.
  IF EXISTS (
    SELECT 1 FROM app."ProjectionRun" r
    WHERE r."householdId" = OLD."householdId" AND r.id = OLD."runId"
  ) THEN
    RAISE EXCEPTION 'Projection sources are immutable while their run exists'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER "ProjectionSource_insert_delete_guard"
  BEFORE INSERT OR DELETE ON app."ProjectionSource"
  FOR EACH ROW EXECUTE FUNCTION app.guard_projection_source_mutation();
REVOKE ALL ON FUNCTION app.guard_projection_source_mutation() FROM PUBLIC, joint_app_runtime;

COMMIT;
