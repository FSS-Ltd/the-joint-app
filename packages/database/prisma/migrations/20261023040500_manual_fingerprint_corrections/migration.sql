BEGIN;
GRANT UPDATE (fingerprint) ON app."Transaction" TO joint_app_runtime;
CREATE OR REPLACE FUNCTION app.protect_csv_original() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF OLD."sourceNamespace" = 'CSV' AND (NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."bookedDate" IS DISTINCT FROM OLD."bookedDate" OR NEW.description IS DISTINCT FROM OLD.description OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint) THEN
 RAISE EXCEPTION 'CSV financial originals are immutable' USING ERRCODE = '42501'; END IF;
 RETURN NEW;
END $$;
COMMIT;
