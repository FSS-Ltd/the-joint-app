BEGIN;
-- Only account-level estimates cross the TOTALS boundary, never transaction details.
CREATE FUNCTION app.csv_balance_estimates(account_ids uuid[])
RETURNS TABLE("accountId" uuid, kind text, revision integer, "anchorId" uuid, "anchorDate" date,
  "amountMinor" text, "throughDate" date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT a.id, a.kind::text, a."totalsVersion", anchor.id, anchor."asOfDate",
    (anchor."amountMinor"::numeric + coalesce(activity.amount, 0))::text, activity.through
  FROM app."Account" a
  LEFT JOIN LATERAL (
    SELECT b.id,b."asOfDate",b."amountMinor"
    FROM app."BalanceSnapshot" b
    WHERE b."householdId"=a."householdId" AND b."accountId"=a.id
      AND b.source='MANUAL' AND b.complete
      AND b."asOfDate" <= (statement_timestamp() AT TIME ZONE 'Europe/London')::date
    ORDER BY b."asOfDate" DESC,b."createdAt" DESC,b.id ASC LIMIT 1
  ) anchor ON true
  LEFT JOIN LATERAL (
    SELECT sum(t."amountMinor"::numeric) AS amount, max(t."bookedDate") AS through
    FROM app."Transaction" t
    LEFT JOIN app."ImportBatch" b ON b.id=t."originImportBatchId"
      AND b."householdId"=t."householdId" AND b."accountId"=t."accountId"
    WHERE t."householdId"=a."householdId" AND t."accountId"=a.id
      AND t.status='BOOKED' AND t.currency='GBP'
      AND ((t."sourceNamespace"='MANUAL' AND t."originImportBatchId" IS NULL)
        OR (t."sourceNamespace"='CSV' AND b.state='COMMITTED'))
      AND t."bookedDate">anchor."asOfDate"
      AND t."bookedDate" <= (statement_timestamp() AT TIME ZONE 'Europe/London')::date
  ) activity ON true
  WHERE coalesce(app.scope_is_valid(),false)
    AND cardinality(account_ids) BETWEEN 1 AND 50
    AND a."householdId"=nullif(current_setting('joint.household_id',true),'')::uuid
    AND a."archivedAt" IS NULL AND a.id=ANY(account_ids)
    AND app.account_access(a.id,'TOTALS')
  ORDER BY a.id
$$;
REVOKE ALL ON FUNCTION app.csv_balance_estimates(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.csv_balance_estimates(uuid[]) TO joint_app_runtime;

-- Publication and rollback change aggregate visibility for TOTALS subscribers.
CREATE FUNCTION app.advance_csv_balance_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF (OLD.state='COMMITTED') IS DISTINCT FROM (NEW.state='COMMITTED') THEN
    UPDATE app."Account" SET "totalsVersion"="totalsVersion"+1
      WHERE id=NEW."accountId" AND "householdId"=NEW."householdId"
        AND kind IN ('CURRENT','SAVINGS') AND EXISTS (
          SELECT 1 FROM app."Transaction" t
          WHERE t."householdId"=NEW."householdId" AND t."accountId"=NEW."accountId"
            AND t."originImportBatchId"=NEW.id AND t."sourceNamespace"='CSV' AND t.status='BOOKED'
            AND t."bookedDate" > (
              SELECT s."asOfDate" FROM app."BalanceSnapshot" s
              WHERE s."householdId"=NEW."householdId" AND s."accountId"=NEW."accountId"
                AND s.source='MANUAL' AND s.complete
                AND s."asOfDate" <= (statement_timestamp() AT TIME ZONE 'Europe/London')::date
              ORDER BY s."asOfDate" DESC,s."createdAt" DESC,s.id ASC LIMIT 1
            )
            AND t."bookedDate" <= (statement_timestamp() AT TIME ZONE 'Europe/London')::date
        );
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER import_balance_version AFTER UPDATE OF state ON app."ImportBatch"
  FOR EACH ROW EXECUTE FUNCTION app.advance_csv_balance_version();
REVOKE ALL ON FUNCTION app.advance_csv_balance_version() FROM PUBLIC;

-- Manual financial changes can alter the same estimate; staged CSV rows cannot.
CREATE FUNCTION app.advance_manual_balance_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  account_id uuid;
  household_id uuid;
  old_date date;
  new_date date;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD."amountMinor",OLD."bookedDate",OLD.status)
    IS NOT DISTINCT FROM (NEW."amountMinor",NEW."bookedDate",NEW.status) THEN RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' AND OLD."sourceNamespace"='MANUAL' AND OLD.status='BOOKED' THEN
    account_id:=OLD."accountId"; household_id:=OLD."householdId"; old_date:=OLD."bookedDate";
  END IF;
  IF TG_OP <> 'DELETE' AND NEW."sourceNamespace"='MANUAL' AND NEW.status='BOOKED' THEN
    account_id:=NEW."accountId"; household_id:=NEW."householdId"; new_date:=NEW."bookedDate";
  END IF;
  IF account_id IS NOT NULL THEN
    UPDATE app."Account" a SET "totalsVersion"=a."totalsVersion"+1
    WHERE a.id=account_id AND a."householdId"=household_id AND a.kind IN ('CURRENT','SAVINGS')
      AND EXISTS (
        SELECT 1 FROM LATERAL (
          SELECT b."asOfDate" FROM app."BalanceSnapshot" b
          WHERE b."householdId"=household_id AND b."accountId"=account_id AND b.source='MANUAL' AND b.complete
            AND b."asOfDate" <= (statement_timestamp() AT TIME ZONE 'Europe/London')::date
          ORDER BY b."asOfDate" DESC,b."createdAt" DESC,b.id ASC LIMIT 1
        ) anchor WHERE (old_date > anchor."asOfDate" AND old_date <= (statement_timestamp() AT TIME ZONE 'Europe/London')::date)
          OR (new_date > anchor."asOfDate" AND new_date <= (statement_timestamp() AT TIME ZONE 'Europe/London')::date)
      );
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER manual_balance_insert AFTER INSERT ON app."Transaction"
  FOR EACH ROW WHEN (NEW."sourceNamespace"='MANUAL') EXECUTE FUNCTION app.advance_manual_balance_version();
CREATE TRIGGER manual_balance_update AFTER UPDATE OF "amountMinor", "bookedDate", status ON app."Transaction"
  FOR EACH ROW WHEN (OLD."sourceNamespace"='MANUAL' OR NEW."sourceNamespace"='MANUAL') EXECUTE FUNCTION app.advance_manual_balance_version();
CREATE TRIGGER manual_balance_delete AFTER DELETE ON app."Transaction"
  FOR EACH ROW WHEN (OLD."sourceNamespace"='MANUAL') EXECUTE FUNCTION app.advance_manual_balance_version();
REVOKE ALL ON FUNCTION app.advance_manual_balance_version() FROM PUBLIC;
COMMIT;
