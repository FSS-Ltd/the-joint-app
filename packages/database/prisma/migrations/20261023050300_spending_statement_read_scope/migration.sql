-- Report joins must reuse the live, published ledger read set once per statement.
-- The former correlated helper exceeded five seconds for 50,000 classified rows.
ALTER POLICY override_read ON app."TransactionOverride" USING (
 "transactionId" IN (SELECT id FROM app."Transaction")
);
ALTER POLICY split_read ON app."TransactionSplit" USING (
 "transactionId" IN (SELECT id FROM app."Transaction")
);
