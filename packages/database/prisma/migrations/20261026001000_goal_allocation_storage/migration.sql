BEGIN;

CREATE TABLE app."AccountAllocationState" (
  "accountId" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL,
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE ("householdId","accountId"),
  FOREIGN KEY ("householdId","accountId") REFERENCES app."Account"("householdId",id) ON DELETE CASCADE
);

CREATE FUNCTION app.valid_allocation_revision(input jsonb, account_id uuid, valuation_id uuid) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
  IF input IS NULL THEN RETURN valuation_id IS NULL; END IF;
  IF valuation_id IS NULL OR jsonb_typeof(input) IS DISTINCT FROM 'object'
    OR input->>'accountId' IS DISTINCT FROM account_id::text
    OR input->>'valuationId' IS DISTINCT FROM valuation_id::text THEN RETURN false; END IF;
  CASE input->>'basis'
    WHEN 'FIXED' THEN
      IF NOT input ?& ARRAY['basis','accountId','valuationId','amount']
        OR input-ARRAY['basis','accountId','valuationId','amount']<>'{}'::jsonb
        OR jsonb_typeof(input->'amount') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
      IF NOT (input->'amount') ?& ARRAY['amountMinor','currency']
        OR (input->'amount')-ARRAY['amountMinor','currency']<>'{}'::jsonb
        OR input->'amount'->>'currency' IS DISTINCT FROM 'GBP'
        OR jsonb_typeof(input->'amount'->'amountMinor') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
      IF (input->'amount'->>'amountMinor') !~ '^(0|[1-9][0-9]{0,18})$' THEN RETURN false; END IF;
      RETURN (input->'amount'->>'amountMinor')::numeric<=9223372036854775807;
    WHEN 'FRACTION' THEN
      IF NOT input ?& ARRAY['basis','accountId','valuationId','fraction']
        OR input-ARRAY['basis','accountId','valuationId','fraction']<>'{}'::jsonb
        OR jsonb_typeof(input->'fraction') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
      RETURN coalesce((input->>'fraction') ~ '^(1|0\.[0-9]{0,11}[1-9])$',false);
    ELSE RETURN false;
  END CASE;
END $$;

CREATE TABLE app."AccountAllocationRevision" (
  "accountId" uuid NOT NULL,
  version integer NOT NULL CHECK (version>0),
  "householdId" uuid NOT NULL,
  "goalId" uuid NOT NULL,
  "valuationId" uuid,
  allocation jsonb,
  "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY ("accountId",version),
  UNIQUE ("householdId","accountId","goalId",version),
  FOREIGN KEY ("householdId","accountId") REFERENCES app."Account"("householdId",id) ON DELETE CASCADE,
  FOREIGN KEY ("householdId","goalId") REFERENCES app."Goal"("householdId",id) ON DELETE CASCADE,
  FOREIGN KEY ("householdId","accountId","valuationId") REFERENCES app."BalanceSnapshot"("householdId","accountId",id) ON DELETE CASCADE,
  CHECK (app.valid_allocation_revision(allocation,"accountId","valuationId"))
);
CREATE INDEX "AccountAllocationRevision_goal_source_idx" ON app."AccountAllocationRevision" ("accountId","goalId",version DESC);
CREATE INDEX "AccountAllocationRevision_goal_idx" ON app."AccountAllocationRevision" ("goalId");
CREATE INDEX "AccountAllocationRevision_valuation_idx" ON app."AccountAllocationRevision" ("valuationId");

ALTER TABLE app."GoalAllocation" ADD COLUMN "sourceVersion" integer CHECK ("sourceVersion">0);
ALTER TABLE app."GoalAllocation" ADD CONSTRAINT "GoalAllocation_sourceRevision_fkey"
  FOREIGN KEY ("householdId","accountId","goalId","sourceVersion")
  REFERENCES app."AccountAllocationRevision"("householdId","accountId","goalId",version);
ALTER TABLE app."AccountOwner" ADD COLUMN "allocationCutoffVersion" integer NOT NULL DEFAULT 0 CHECK ("allocationCutoffVersion">=0);

ALTER TABLE app."AccountAllocationState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."AccountAllocationState" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."AccountAllocationRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."AccountAllocationRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."AccountAllocationState" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."AccountAllocationRevision" TO CURRENT_USER USING (true) WITH CHECK (true);
REVOKE ALL ON app."AccountAllocationState",app."AccountAllocationRevision" FROM PUBLIC,joint_app_runtime;

CREATE FUNCTION app.guard_allocation_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' OR (
    EXISTS (SELECT 1 FROM app."Account" WHERE id=OLD."accountId")
    AND EXISTS (SELECT 1 FROM app."Goal" WHERE id=OLD."goalId")
    AND (OLD."valuationId" IS NULL OR EXISTS (SELECT 1 FROM app."BalanceSnapshot" WHERE id=OLD."valuationId"))
  ) THEN
    RAISE EXCEPTION 'Allocation history is immutable' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER allocation_revision_guard BEFORE UPDATE OR DELETE ON app."AccountAllocationRevision"
  FOR EACH ROW EXECUTE FUNCTION app.guard_allocation_revision();
REVOKE ALL ON FUNCTION app.valid_allocation_revision(jsonb,uuid,uuid),app.guard_allocation_revision() FROM PUBLIC,joint_app_runtime;

COMMIT;
