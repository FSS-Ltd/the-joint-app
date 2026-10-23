BEGIN;
-- Reuse the ledger's statement-scoped visibility once, including publication
-- and live actor/lease checks, rather than looking up each revision's row.
ALTER POLICY revision_read ON app."TransactionRevision" USING (
 "transactionId" IN (SELECT id FROM app."Transaction")
);
COMMIT;
