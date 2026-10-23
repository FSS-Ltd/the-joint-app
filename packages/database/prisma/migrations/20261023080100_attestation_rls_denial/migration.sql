BEGIN;
CREATE OR REPLACE FUNCTION app.validate_balance_adult_portion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE account_kind app."AccountKind";
BEGIN
 SELECT kind INTO account_kind FROM app."Account"
 WHERE id=NEW."accountId" AND "householdId"=NEW."householdId";
 IF NOT FOUND THEN
  -- Preserve the standard, non-disclosing RLS denial for invisible accounts.
  RETURN NEW;
 END IF;
 IF account_kind IN ('CREDIT_CARD','LOAN','MORTGAGE','OTHER_LIABILITY') AND
   (NEW."amountMinor" < 0 OR
    (NEW."adultAmountMinor" IS NOT NULL AND NEW."adultAmountMinor" <> NEW."amountMinor")) THEN
  RAISE EXCEPTION 'Liability valuation must use the full outstanding amount' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
COMMIT;
