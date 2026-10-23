BEGIN;
-- Planning details are retained only within a surviving owner's recorded rights.
CREATE FUNCTION app.funding_evidence_is_retained(account_id uuid, evidence_version integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS (SELECT 1 FROM app."AccountOwner" o JOIN app."User" u ON u.id=o."userId"
   WHERE o."accountId"=account_id AND u.status<>'DELETED'
     AND (o.status='ACTIVE' OR o."fundingCutoffVersion">=evidence_version))
$$;
CREATE OR REPLACE FUNCTION app.guard_funding_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a app."Account"; v app."BalanceSnapshot"; settled bigint; previous integer;
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Immutable funding evidence' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN
    IF EXISTS (SELECT 1 FROM app."Account" WHERE id=OLD."accountId") AND EXISTS (SELECT 1 FROM app."BalanceSnapshot" WHERE id=OLD."valuationId") AND app.funding_evidence_is_retained(OLD."accountId",OLD.version) THEN
      RAISE EXCEPTION 'Immutable funding evidence' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO a FROM app."Account" WHERE id=NEW."accountId" AND "householdId"=NEW."householdId" FOR UPDATE;
  SELECT * INTO v FROM app."BalanceSnapshot" WHERE id=NEW."valuationId" AND "accountId"=NEW."accountId" AND "householdId"=NEW."householdId";
  IF a.id IS NULL OR v.id IS NULL OR a."archivedAt" IS NOT NULL OR a.currency<>'GBP'
    OR a.kind NOT IN ('CURRENT','SAVINGS','INVESTMENT','OTHER_ASSET') OR a.liquidity<>'AVAILABLE'
    OR a."legalOwnerKind" NOT IN ('ADULT','JOINT_ADULT') OR NOT v.complete OR v.source<>'MANUAL'
    OR v."adultAmountMinor" IS NULL OR v."asOfDate">(statement_timestamp() AT TIME ZONE 'Europe/London')::date
    OR v."asOfDate"<(statement_timestamp() AT TIME ZONE 'Europe/London')::date-30
    OR v.id IS DISTINCT FROM (SELECT id FROM app."BalanceSnapshot" WHERE "accountId"=a.id ORDER BY "asOfDate" DESC,"createdAt" DESC,id LIMIT 1)
    OR NEW."settledAdultAmountMinor">greatest(v."adultAmountMinor",0)
    OR NOT EXISTS (SELECT 1 FROM app."AccountOwner" o JOIN app."Membership" m ON m.id=o."membershipId"
      WHERE o."accountId"=a.id AND o."membershipId"=NEW."authorMembershipId" AND o.status='ACTIVE' AND m.status='ACTIVE') THEN
    RAISE EXCEPTION 'Funding source unavailable' USING ERRCODE='P0003';
  END IF;
  SELECT "settledAdultAmountMinor" INTO settled FROM app."FundingEvidence" WHERE "valuationId"=v.id ORDER BY version LIMIT 1;
  IF settled IS NOT NULL AND settled<>NEW."settledAdultAmountMinor" THEN RAISE EXCEPTION 'Settlement immutable' USING ERRCODE='P0004'; END IF;
  SELECT coalesce(max(version),0) INTO previous FROM app."FundingEvidence" WHERE "accountId"=a.id;
  IF previous=2147483647 OR NEW.version<>previous+1 THEN RAISE EXCEPTION 'Funding version conflict' USING ERRCODE='40001'; END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION app.purge_private_funding_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected uuid[];
BEGIN
 IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='DELETED' THEN
   SELECT coalesce(array_agg("accountId" ORDER BY "accountId"),ARRAY[]::uuid[]) INTO affected FROM app."AccountOwner" WHERE "userId"=NEW.id;
   PERFORM 1 FROM app."Account" WHERE id=ANY(affected) ORDER BY id FOR UPDATE;
   DELETE FROM app."FundingEvidence" e WHERE e."accountId"=ANY(affected) AND NOT app.funding_evidence_is_retained(e."accountId",e.version);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER funding_evidence_purge AFTER UPDATE OF status ON app."User" FOR EACH ROW EXECUTE FUNCTION app.purge_private_funding_evidence();
REVOKE ALL ON FUNCTION app.funding_evidence_is_retained(uuid,integer),app.purge_private_funding_evidence() FROM PUBLIC,joint_app_runtime;
COMMIT;
