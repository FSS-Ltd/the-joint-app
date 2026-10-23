-- PostgreSQL runs BEFORE INSERT before resolving ON CONFLICT. Merchant-only
-- upserts must compare against the existing financial fields, not null defaults.
CREATE OR REPLACE FUNCTION app.check_spending_override() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE amount bigint; existing_category text; existing_kind app."ClassificationKind"; financial_change boolean;
BEGIN
 SELECT "amountMinor" INTO amount FROM app."Transaction" WHERE id = NEW."transactionId";
 IF (NEW."classificationKind" = 'EXPENSE' AND amount >= 0) OR (NEW."classificationKind" IN ('INCOME','REFUND') AND amount <= 0)
 THEN RAISE EXCEPTION 'Classification direction is invalid' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT category,"classificationKind" INTO existing_category,existing_kind FROM app."TransactionOverride" WHERE "transactionId"=NEW."transactionId";
  financial_change := (NEW.category,NEW."classificationKind") IS DISTINCT FROM (existing_category,existing_kind);
 ELSE
  financial_change := (NEW.category,NEW."classificationKind") IS DISTINCT FROM (OLD.category,OLD."classificationKind");
 END IF;
 IF financial_change AND EXISTS(SELECT 1 FROM app."TransferLink" WHERE active AND ("fromTransactionId" = NEW."transactionId" OR "toTransactionId" = NEW."transactionId"))
 THEN RAISE EXCEPTION 'Remove confirmed transfer before classification' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
