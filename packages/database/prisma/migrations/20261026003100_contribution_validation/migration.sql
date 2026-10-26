BEGIN;
CREATE FUNCTION app.contribution_integer_valid(value jsonb, minimum integer, maximum integer) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE WHEN jsonb_typeof(value)='number' AND value#>>'{}' ~ '^(0|[1-9][0-9]{0,9})$'
    THEN (value#>>'{}')::numeric BETWEEN minimum AND maximum ELSE false END
$$;
CREATE FUNCTION app.validate_contribution_schedule(input jsonb, capacity boolean) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE horizon integer; first_date date; step jsonb; previous_month integer:=0; current_month integer; amount jsonb;
BEGIN
  IF jsonb_typeof(input) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023';
  END IF;
  IF capacity THEN
    IF NOT input ?& ARRAY['firstContributionDate','horizonMonths','monthlyContributions']
      OR (SELECT count(*) FROM jsonb_object_keys(input))<>3
      OR NOT app.contribution_integer_valid(input->'horizonMonths',1,600) THEN
      RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023';
    END IF;
    horizon:=(input->>'horizonMonths')::integer;
  ELSE
    IF NOT input ?& ARRAY['firstContributionDate','expectedGoalVersion','expectedPlanVersion','monthlyContributions']
      OR (SELECT count(*) FROM jsonb_object_keys(input))<>4
      OR NOT app.contribution_integer_valid(input->'expectedGoalVersion',1,2147483647)
      OR NOT app.contribution_integer_valid(input->'expectedPlanVersion',0,2147483647) THEN
      RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023';
    END IF;
    horizon:=600;
  END IF;
  IF jsonb_typeof(input->'firstContributionDate') IS DISTINCT FROM 'string'
    OR (input->>'firstContributionDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR jsonb_typeof(input->'monthlyContributions') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023';
  END IF;
  BEGIN
    first_date:=(input->>'firstContributionDate')::date;
    IF first_date<date '0001-01-01' OR to_char(first_date,'YYYY-MM-DD')<>input->>'firstContributionDate'
      OR extract(day FROM first_date+1)<>1
      OR extract(year FROM first_date)*12+extract(month FROM first_date)-1+horizon-1>119999 THEN
      RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023';
    END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023';
  END;
  IF jsonb_array_length(input->'monthlyContributions') NOT BETWEEN 1 AND 600 THEN
    RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023';
  END IF;
  FOR step IN SELECT value FROM jsonb_array_elements(input->'monthlyContributions') LOOP
    IF jsonb_typeof(step) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023';
    END IF;
    IF NOT step ?& ARRAY['fromMonth','amount'] OR (SELECT count(*) FROM jsonb_object_keys(step))<>2
      OR NOT app.contribution_integer_valid(step->'fromMonth',1,horizon)
      OR jsonb_typeof(step->'amount') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023';
    END IF;
    current_month:=(step->>'fromMonth')::integer;
    amount:=step->'amount';
    IF current_month<=previous_month OR (previous_month=0 AND current_month<>1)
      OR NOT amount ?& ARRAY['amountMinor','currency'] OR (SELECT count(*) FROM jsonb_object_keys(amount))<>2
      OR amount->>'currency' IS DISTINCT FROM 'GBP'
      OR jsonb_typeof(amount->'amountMinor') IS DISTINCT FROM 'string'
      OR (amount->>'amountMinor') !~ '^(0|[1-9][0-9]{0,18})$' THEN
      RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023';
    END IF;
    IF (amount->>'amountMinor')::numeric>9223372036854775807 THEN
      RAISE EXCEPTION 'Invalid contribution input' USING ERRCODE='22023';
    END IF;
    previous_month:=current_month;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION app.contribution_integer_valid(jsonb,integer,integer),app.validate_contribution_schedule(jsonb,boolean) FROM PUBLIC,joint_app_runtime;
COMMIT;
