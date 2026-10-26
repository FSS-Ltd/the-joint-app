BEGIN;
CREATE INDEX "GoalAllocation_source_goal_idx" ON app."GoalAllocation"("accountId","goalId");
CREATE FUNCTION app.allocation_money(amount numeric) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('amountMinor',trunc(amount)::text,'currency','GBP')
$$;
CREATE FUNCTION app.allocation_amount(input jsonb) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE settled bigint;
BEGIN
  IF input IS NULL THEN RETURN 0; END IF;
  IF input->>'basis'='FIXED' THEN RETURN (input->'amount'->>'amountMinor')::numeric; END IF;
  SELECT "settledAdultAmountMinor" INTO settled FROM app."FundingEvidence"
    WHERE "accountId"=(input->>'accountId')::uuid AND "valuationId"=(input->>'valuationId')::uuid ORDER BY version LIMIT 1;
  RETURN round(settled::numeric*(input->>'fraction')::numeric,0);
END $$;
CREATE FUNCTION app.allocation_available(account_id uuid) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a app."Account"; v app."BalanceSnapshot"; e app."FundingEvidence"; today date:=(clock_timestamp() AT TIME ZONE 'Europe/London')::date;
BEGIN
  SELECT * INTO a FROM app."Account" WHERE id=account_id;
  SELECT * INTO v FROM app."BalanceSnapshot" WHERE "householdId"=a."householdId" AND "accountId"=account_id ORDER BY "asOfDate" DESC,"createdAt" DESC,id LIMIT 1;
  SELECT * INTO e FROM app."FundingEvidence" WHERE "accountId"=account_id AND "valuationId"=v.id ORDER BY version DESC LIMIT 1;
  IF a.id IS NULL OR a."archivedAt" IS NOT NULL OR a.currency<>'GBP' OR a.liquidity<>'AVAILABLE'
    OR a.kind NOT IN ('CURRENT','SAVINGS','INVESTMENT','OTHER_ASSET') OR a."legalOwnerKind" NOT IN ('ADULT','JOINT_ADULT')
    OR v.id IS NULL OR NOT v.complete OR v.source<>'MANUAL' OR v.currency<>'GBP'
    OR v."adultAmountMinor" IS NULL OR v."asOfDate">today OR v."asOfDate"<today-30 OR e.id IS NULL
    OR e."settledAdultAmountMinor">greatest(v."adultAmountMinor",0)
    OR (v."amountMinor"<0 AND (v."adultAmountMinor"<>v."amountMinor" OR a.kind NOT IN ('CURRENT','SAVINGS')))
    OR (v."amountMinor">=0 AND (v."adultAmountMinor"<0 OR v."adultAmountMinor">v."amountMinor")) THEN RETURN NULL; END IF;
  RETURN greatest(0,e."settledAdultAmountMinor"::numeric-e."billReservesMinor"::numeric);
END $$;
CREATE FUNCTION app.allocation_committed(account_id uuid) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE total numeric; valid_count bigint; all_count bigint;
BEGIN
  SELECT coalesce(sum(app.allocation_amount(r.allocation)),0),count(r.allocation) FILTER(WHERE app.allocation_amount(r.allocation) IS NOT NULL),count(*)
    INTO total,valid_count,all_count FROM app."GoalAllocation" a LEFT JOIN app."AccountAllocationRevision" r
      ON r."accountId"=a."accountId" AND r.version=a."sourceVersion" AND r."goalId"=a."goalId"
    WHERE a."accountId"=account_id;
  IF valid_count<>all_count THEN RETURN NULL; END IF;
  RETURN total;
END $$;
CREATE FUNCTION app.allocation_position(account_id uuid, archived boolean, allocation jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE available numeric; committed numeric; allocated numeric; shortfall numeric;
BEGIN
  IF NOT archived THEN
    available:=app.allocation_available(account_id); committed:=app.allocation_committed(account_id); allocated:=app.allocation_amount(allocation);
  END IF;
  IF available IS NULL OR committed IS NULL OR allocated IS NULL THEN
    RETURN jsonb_build_object('accountId',account_id,'status','UNAVAILABLE','reason','FUNDING_UNAVAILABLE',
      'available',NULL,'committed',NULL,'allocated',NULL,'shortfall',NULL);
  END IF;
  shortfall:=greatest(0,committed-available);
  RETURN jsonb_build_object('accountId',account_id,'status',CASE WHEN shortfall=0 THEN 'FUNDED' ELSE 'UNDERFUNDED' END,'reason',NULL,
    'available',app.allocation_money(available),'committed',app.allocation_money(committed),'allocated',app.allocation_money(allocated),'shortfall',app.allocation_money(shortfall));
END $$;
REVOKE ALL ON FUNCTION app.allocation_money(numeric),app.allocation_amount(jsonb),app.allocation_available(uuid),app.allocation_committed(uuid),app.allocation_position(uuid,boolean,jsonb) FROM PUBLIC,joint_app_runtime;
COMMIT;
