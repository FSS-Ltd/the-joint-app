-- Owner archives span original households. Avoid scanning every source when a
-- user lists their own retained accounts after independently authenticating.
CREATE INDEX "AccountOwner_userId_status_accountId_idx"
  ON app."AccountOwner" ("userId", status, "accountId");
