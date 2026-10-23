BEGIN;
-- A fraction's named settlement basis must retain the original valuation too.
CREATE FUNCTION app.guard_funded_valuation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM 1 FROM app."Account" WHERE id=OLD."accountId" FOR UPDATE;
  IF FOUND AND EXISTS (SELECT 1 FROM app."FundingEvidence" WHERE "valuationId"=OLD.id) THEN
    RAISE EXCEPTION 'Recorded funding source is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER funded_valuation_immutable BEFORE UPDATE OR DELETE ON app."BalanceSnapshot" FOR EACH ROW EXECUTE FUNCTION app.guard_funded_valuation();
REVOKE ALL ON FUNCTION app.guard_funded_valuation() FROM PUBLIC,joint_app_runtime;
COMMIT;
