BEGIN;

CREATE TABLE app."Subscription" (
  id uuid PRIMARY KEY,
  "householdId" uuid NOT NULL,
  "purchaserUserId" uuid NOT NULL,
  provider varchar(20) NOT NULL,
  environment varchar(20) NOT NULL,
  "externalCustomerId" varchar(120) NOT NULL,
  "externalSubscriptionId" varchar(120) NOT NULL,
  status varchar(20) NOT NULL,
  interval varchar(20) NOT NULL,
  "effectiveUntil" timestamptz(3) NOT NULL,
  "graceUntil" timestamptz(3),
  "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
  "lastEventId" varchar(120),
  "lastEventAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "Subscription_provider_externalSubscriptionId_key" UNIQUE (provider, "externalSubscriptionId"),
  CONSTRAINT "Subscription_fields" CHECK (
    provider IN ('STRIPE', 'REVENUECAT') AND
    environment IN ('SANDBOX', 'PRODUCTION') AND
    status IN ('ACTIVE', 'TRIALING', 'GRACE_PERIOD', 'PAST_DUE', 'CANCELED', 'EXPIRED') AND
    interval IN ('MONTHLY', 'ANNUAL') AND
    length(btrim("externalCustomerId")) > 0 AND
    length(btrim("externalSubscriptionId")) > 0
  )
);

CREATE INDEX "Subscription_householdId_idx" ON app."Subscription"("householdId");
CREATE INDEX "Subscription_purchaserUserId_idx" ON app."Subscription"("purchaserUserId");

CREATE TABLE app."SubscriptionAudit" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "subscriptionId" uuid NOT NULL,
  "householdId" uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  "changedAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  "databaseActor" text NOT NULL DEFAULT session_user,
  snapshot jsonb NOT NULL
);

CREATE INDEX "SubscriptionAudit_subscriptionId_id_idx" ON app."SubscriptionAudit"("subscriptionId", id);

CREATE OR REPLACE FUNCTION app.record_subscription_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO app."SubscriptionAudit" ("subscriptionId", "householdId", operation, snapshot)
      VALUES (OLD.id, OLD."householdId", TG_OP, to_jsonb(OLD));
    RETURN OLD;
  ELSE
    INSERT INTO app."SubscriptionAudit" ("subscriptionId", "householdId", operation, snapshot)
      VALUES (NEW.id, NEW."householdId", TG_OP, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER "Subscription_audit"
  AFTER INSERT OR UPDATE OR DELETE ON app."Subscription"
  FOR EACH ROW EXECUTE FUNCTION app.record_subscription_change();

REVOKE ALL ON FUNCTION app.record_subscription_change() FROM PUBLIC;
REVOKE ALL ON app."Subscription", app."SubscriptionAudit" FROM PUBLIC, joint_app_runtime;
REVOKE ALL ON SEQUENCE app."SubscriptionAudit_id_seq" FROM PUBLIC, joint_app_runtime;
GRANT SELECT ON app."Subscription" TO joint_app_runtime;

CREATE FUNCTION app.expire_subscriptions() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE affected integer;
BEGIN
  WITH expired AS (
    SELECT id FROM app."Subscription"
    WHERE status IN ('ACTIVE', 'GRACE_PERIOD', 'CANCELED')
      AND "effectiveUntil" < clock_timestamp()
      AND ("graceUntil" IS NULL OR "graceUntil" < clock_timestamp())
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  UPDATE app."Subscription" s
  SET status = 'EXPIRED', "updatedAt" = clock_timestamp()
  FROM expired x
  WHERE s.id = x.id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION app.expire_subscriptions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.expire_subscriptions() TO joint_app_runtime;

ALTER TABLE app."Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."Subscription" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."SubscriptionAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."SubscriptionAudit" FORCE ROW LEVEL SECURITY;

CREATE POLICY maintenance ON app."Subscription" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."SubscriptionAudit" TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY subscription_household_read ON app."Subscription" FOR SELECT TO joint_app_runtime USING (
  app.scope_is_valid()
  AND "householdId" = nullif(current_setting('joint.household_id', true), '')::uuid
);

DO $$ DECLARE blocked_role text; BEGIN
  FOREACH blocked_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname=blocked_role) THEN
      EXECUTE format('REVOKE ALL ON app."Subscription",app."SubscriptionAudit" FROM %I',blocked_role);
    END IF;
  END LOOP;
END $$;

COMMIT;
