BEGIN;
-- Leave ledger replay must not silently invalidate a later reactivation. An
-- exited household remains closed to that identity, even without owned sources.
-- The user can join/create a different household and retain their owner archive.
CREATE OR REPLACE FUNCTION app.protect_archived_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.status = 'LEFT' AND NEW.status = 'ACTIVE' THEN
    RAISE EXCEPTION 'Exited membership cannot be reactivated' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
COMMIT;
