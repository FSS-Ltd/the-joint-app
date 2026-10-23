BEGIN;
CREATE TABLE app."FundingEvidence" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "householdId" uuid NOT NULL,
  "accountId" uuid NOT NULL,
  "valuationId" uuid NOT NULL,
  "authorMembershipId" uuid NOT NULL,
  version integer NOT NULL CHECK (version>0),
  "settledAdultAmountMinor" bigint NOT NULL CHECK ("settledAdultAmountMinor">=0),
  "billReservesMinor" bigint NOT NULL CHECK ("billReservesMinor">=0),
  "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE ("accountId",version),
  FOREIGN KEY ("householdId","accountId") REFERENCES app."Account"("householdId",id) ON DELETE CASCADE,
  FOREIGN KEY ("householdId","accountId","valuationId") REFERENCES app."BalanceSnapshot"("householdId","accountId",id) ON DELETE CASCADE,
  FOREIGN KEY ("householdId","authorMembershipId") REFERENCES app."Membership"("householdId",id)
);
CREATE INDEX "FundingEvidence_valuationId_idx" ON app."FundingEvidence"("valuationId");
ALTER TABLE app."FundingEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."FundingEvidence" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."FundingEvidence" TO CURRENT_USER USING (true) WITH CHECK (true);
REVOKE ALL ON app."FundingEvidence" FROM PUBLIC,joint_app_runtime;
ALTER TABLE app."AccountOwner" ADD COLUMN "fundingCutoffVersion" integer NOT NULL DEFAULT 0 CHECK ("fundingCutoffVersion">=0);
CREATE FUNCTION app.freeze_owner_funding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='INSERT' THEN NEW."fundingCutoffVersion":=0;
  ELSIF OLD.status='ACTIVE' AND NEW.status='ARCHIVED' THEN
    PERFORM 1 FROM app."Account" WHERE id=OLD."accountId" FOR UPDATE;
    SELECT coalesce(max(version),0) INTO NEW."fundingCutoffVersion" FROM app."FundingEvidence" WHERE "accountId"=OLD."accountId";
  ELSE NEW."fundingCutoffVersion":=OLD."fundingCutoffVersion";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER owner_funding_cutoff BEFORE INSERT OR UPDATE ON app."AccountOwner" FOR EACH ROW EXECUTE FUNCTION app.freeze_owner_funding();
CREATE FUNCTION app.guard_funding_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a app."Account"; v app."BalanceSnapshot"; settled bigint; previous integer;
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Immutable funding evidence' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN
    IF EXISTS (SELECT 1 FROM app."Account" WHERE id=OLD."accountId") AND EXISTS (SELECT 1 FROM app."BalanceSnapshot" WHERE id=OLD."valuationId") THEN
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
CREATE TRIGGER funding_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON app."FundingEvidence" FOR EACH ROW EXECUTE FUNCTION app.guard_funding_evidence();
CREATE FUNCTION app.funding_data(e app."FundingEvidence") RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('id',e.id,'householdId',e."householdId",'accountId',e."accountId",'valuationId',e."valuationId",'version',e.version,
    'settledAdultMoney',jsonb_build_object('amountMinor',e."settledAdultAmountMinor"::text,'currency','GBP'),
    'billReserves',jsonb_build_object('amountMinor',e."billReservesMinor"::text,'currency','GBP'),
    'createdAt',to_char(e."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;
CREATE FUNCTION app.lock_funding_scope(account_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ceiling integer;
BEGIN
  PERFORM 1 FROM app."User" WHERE id=nullif(current_setting('joint.user_id',true),'')::uuid AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable funding scope' USING ERRCODE='42501'; END IF;
  IF current_setting('joint.archive',true)='owner' THEN
    IF NOT coalesce(app.archive_scope_is_valid(),false) THEN RAISE EXCEPTION 'Unavailable funding scope' USING ERRCODE='42501'; END IF;
    SELECT o."fundingCutoffVersion" INTO ceiling FROM app."AccountOwner" o JOIN app."Membership" m ON m.id=o."membershipId"
      WHERE o."accountId"=account_id AND o."userId"=nullif(current_setting('joint.user_id',true),'')::uuid AND o.status='ARCHIVED' AND m.status='LEFT';
  ELSE
    PERFORM 1 FROM app."Household" WHERE id=nullif(current_setting('joint.household_id',true),'')::uuid FOR UPDATE;
    IF NOT coalesce(app.scope_is_valid(),false) THEN RAISE EXCEPTION 'Unavailable funding scope' USING ERRCODE='42501'; END IF;
    PERFORM 1 FROM app."Account" WHERE id=account_id AND "householdId"=nullif(current_setting('joint.household_id',true),'')::uuid AND "archivedAt" IS NULL FOR UPDATE;
    IF FOUND AND app.owns_account(account_id) THEN ceiling:=2147483647; END IF;
  END IF;
  IF ceiling IS NULL THEN RAISE EXCEPTION 'Unavailable funding source' USING ERRCODE='P0002'; END IF;
  RETURN ceiling;
END $$;
CREATE FUNCTION app.write_funding_evidence(account_id uuid, expected_version integer, input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ceiling integer:=app.lock_funding_scope(account_id); previous integer; settlement bigint; reserves bigint; valuation uuid; e app."FundingEvidence";
BEGIN
  IF current_setting('joint.archive',true)='owner' THEN RAISE EXCEPTION 'Unavailable funding source' USING ERRCODE='P0002'; END IF;
  IF expected_version IS NULL OR expected_version<0 OR expected_version>=2147483647
    OR jsonb_typeof(input) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(input))<>3
    OR NOT input ?& ARRAY['valuationId','settledAdultMoney','billReserves'] THEN
    RAISE EXCEPTION 'Invalid funding input' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(input->'valuationId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid funding input' USING ERRCODE='22023'; END IF;
  FOREACH previous IN ARRAY ARRAY[1,2] LOOP
    IF jsonb_typeof(input->CASE previous WHEN 1 THEN 'settledAdultMoney' ELSE 'billReserves' END) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid funding input' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(input->'settledAdultMoney'))<>2 OR (SELECT count(*) FROM jsonb_object_keys(input->'billReserves'))<>2
    OR input->'settledAdultMoney'->>'currency' IS DISTINCT FROM 'GBP' OR input->'billReserves'->>'currency' IS DISTINCT FROM 'GBP'
    OR jsonb_typeof(input->'settledAdultMoney'->'amountMinor') IS DISTINCT FROM 'string'
    OR jsonb_typeof(input->'billReserves'->'amountMinor') IS DISTINCT FROM 'string'
    OR (input->'settledAdultMoney'->>'amountMinor') !~ '^(0|[1-9][0-9]{0,18})$'
    OR (input->'billReserves'->>'amountMinor') !~ '^(0|[1-9][0-9]{0,18})$' THEN
    RAISE EXCEPTION 'Invalid funding input' USING ERRCODE='22023';
  END IF;
  BEGIN
    valuation:=(input->>'valuationId')::uuid; settlement:=(input->'settledAdultMoney'->>'amountMinor')::bigint; reserves:=(input->'billReserves'->>'amountMinor')::bigint;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid funding input' USING ERRCODE='22023'; END;
  SELECT coalesce(max(version),0) INTO previous FROM app."FundingEvidence" WHERE "accountId"=account_id;
  IF previous<>expected_version THEN RAISE EXCEPTION 'Funding version conflict' USING ERRCODE='40001'; END IF;
  INSERT INTO app."FundingEvidence" ("householdId","accountId","valuationId","authorMembershipId",version,"settledAdultAmountMinor","billReservesMinor")
    VALUES (nullif(current_setting('joint.household_id',true),'')::uuid,account_id,valuation,nullif(current_setting('joint.membership_id',true),'')::uuid,previous+1,settlement,reserves) RETURNING * INTO e;
  INSERT INTO app."AuditEvent" (id,"userId","householdId",action) VALUES(gen_random_uuid(),nullif(current_setting('joint.user_id',true),'')::uuid,e."householdId",'FUNDING_EVIDENCE_RECORDED');
  RETURN app.funding_data(e);
END $$;
CREATE FUNCTION app.read_funding_evidence(account_id uuid, after_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ceiling integer:=app.lock_funding_scope(account_id); latest jsonb; entries jsonb; next_version integer;
BEGIN
  IF after_version IS NULL OR after_version<0 THEN RAISE EXCEPTION 'Invalid funding cursor' USING ERRCODE='22023'; END IF;
  SELECT app.funding_data(e) INTO latest FROM app."FundingEvidence" e WHERE "accountId"=account_id AND version<=ceiling ORDER BY version DESC LIMIT 1;
  WITH bounded AS MATERIALIZED (
    SELECT e.*,row_number() OVER(ORDER BY version) AS position FROM app."FundingEvidence" e WHERE "accountId"=account_id AND version>after_version AND version<=ceiling ORDER BY version LIMIT 51
  ) SELECT coalesce(jsonb_agg(app.funding_data(ROW(id,"householdId","accountId","valuationId","authorMembershipId",version,"settledAdultAmountMinor","billReservesMinor","createdAt")::app."FundingEvidence") ORDER BY version) FILTER(WHERE position<=50),'[]'::jsonb),
    CASE WHEN count(*)>50 THEN max(version) FILTER(WHERE position<=50) ELSE NULL END INTO entries,next_version FROM bounded;
  RETURN jsonb_build_object('current',latest,'history',entries,'nextAfterVersion',next_version);
END $$;
REVOKE ALL ON FUNCTION app.freeze_owner_funding(),app.guard_funding_evidence(),app.funding_data(app."FundingEvidence"),app.lock_funding_scope(uuid),app.write_funding_evidence(uuid,integer,jsonb),app.read_funding_evidence(uuid,integer) FROM PUBLIC,joint_app_runtime;
GRANT EXECUTE ON FUNCTION app.write_funding_evidence(uuid,integer,jsonb),app.read_funding_evidence(uuid,integer) TO joint_app_runtime;
COMMIT;
