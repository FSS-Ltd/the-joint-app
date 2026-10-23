CREATE OR REPLACE FUNCTION app.check_transfer_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE from_row record; to_row record;
BEGIN
 IF TG_OP='UPDATE' AND NOT OLD.active AND NEW.active THEN
 RAISE EXCEPTION 'Removed transfers cannot be reactivated' USING ERRCODE='23514'; END IF;
 IF NOT NEW.active THEN RETURN NEW; END IF;
 PERFORM 1 FROM app."Transaction" WHERE id IN (NEW."fromTransactionId",NEW."toTransactionId") ORDER BY id FOR UPDATE;
 SELECT * INTO from_row FROM app."Transaction" WHERE id=NEW."fromTransactionId";
 SELECT * INTO to_row FROM app."Transaction" WHERE id=NEW."toTransactionId";
 IF from_row."amountMinor" >= 0 OR to_row."amountMinor" <= 0 OR from_row."amountMinor"::numeric + to_row."amountMinor"::numeric <> 0
 OR from_row.currency <> 'GBP' OR to_row.currency <> 'GBP' OR from_row.status <> 'BOOKED' OR to_row.status <> 'BOOKED'
 OR (from_row."originImportBatchId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app."ImportBatch" WHERE id=from_row."originImportBatchId" AND state='COMMITTED'))
 OR (to_row."originImportBatchId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app."ImportBatch" WHERE id=to_row."originImportBatchId" AND state='COMMITTED'))
 OR EXISTS(SELECT 1 FROM app."TransactionSplit" WHERE "transactionId" IN (NEW."fromTransactionId",NEW."toTransactionId"))
 OR EXISTS(SELECT 1 FROM app."TransferLink" l WHERE l.id <> NEW.id AND l.active
 AND (l."fromTransactionId" IN (NEW."fromTransactionId",NEW."toTransactionId") OR l."toTransactionId" IN (NEW."fromTransactionId",NEW."toTransactionId")))
 THEN RAISE EXCEPTION 'Transfer legs are not eligible' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app.check_split_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE transaction_id uuid;
BEGIN
 transaction_id := CASE WHEN TG_OP='DELETE' THEN OLD."transactionId" ELSE NEW."transactionId" END;
 -- Cascading maintenance deletion has already removed the parent row.
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM app."Transaction" WHERE id=transaction_id) THEN RETURN OLD; END IF;
 IF EXISTS(SELECT 1 FROM app."TransferLink" WHERE active AND ("fromTransactionId" = transaction_id OR "toTransactionId" = transaction_id))
 THEN RAISE EXCEPTION 'Remove confirmed transfer before splitting' USING ERRCODE='23514'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
