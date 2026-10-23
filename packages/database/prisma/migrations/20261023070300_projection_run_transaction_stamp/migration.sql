BEGIN;

-- The creation fence is assigned by PostgreSQL, even if a caller supplies one.
CREATE FUNCTION app.stamp_projection_run_transaction() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  NEW."creationTransactionId" := txid_current();
  RETURN NEW;
END $$;
CREATE TRIGGER "ProjectionRun_creation_transaction"
  BEFORE INSERT ON app."ProjectionRun"
  FOR EACH ROW EXECUTE FUNCTION app.stamp_projection_run_transaction();
REVOKE ALL ON FUNCTION app.stamp_projection_run_transaction() FROM PUBLIC, joint_app_runtime;

COMMIT;
