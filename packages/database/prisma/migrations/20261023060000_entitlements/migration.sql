BEGIN;

-- Maintenance issues bounded, named grants; application credentials only read.
CREATE TABLE app."EntitlementGrant" (
  id uuid PRIMARY KEY,
  "householdId" uuid NOT NULL,
  "membershipId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  issuer varchar(120) NOT NULL,
  reason varchar(500) NOT NULL,
  capabilities text[] NOT NULL,
  "issuedAt" timestamptz(3) NOT NULL,
  "expiresAt" timestamptz(3) NOT NULL,
  "revokedAt" timestamptz(3),
  revision integer NOT NULL DEFAULT 1,
  CONSTRAINT "EntitlementGrant_recipient_fkey" FOREIGN KEY ("householdId","membershipId","userId")
    REFERENCES app."Membership"("householdId",id,"userId") ON DELETE CASCADE,
  CONSTRAINT "EntitlementGrant_fields" CHECK (
    length(btrim(issuer)) > 0 AND length(btrim(reason)) > 0 AND revision > 0
    AND "expiresAt" > "issuedAt" AND "expiresAt" <= "issuedAt" + interval '90 days'
    AND ("revokedAt" IS NULL OR "revokedAt" >= "issuedAt")
    AND cardinality(capabilities) BETWEEN 1 AND 7
    AND array_position(capabilities, NULL) IS NULL
    AND capabilities <@ ARRAY['finance.manual','projections.basic','connections.bank','connections.broker',
      'projections.advanced','categorisation.automation','insights.local']::text[]
  )
);
CREATE INDEX "EntitlementGrant_householdId_membershipId_userId_idx"
  ON app."EntitlementGrant"("householdId","membershipId","userId");

-- No FK: deletion of a recipient must not erase maintenance provenance.
CREATE TABLE app."EntitlementGrantAudit" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "grantId" uuid NOT NULL,
  "householdId" uuid NOT NULL,
  issuer varchar(120) NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  "changedAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  "databaseActor" text NOT NULL DEFAULT session_user,
  snapshot jsonb NOT NULL
);
CREATE INDEX "EntitlementGrantAudit_grantId_id_idx" ON app."EntitlementGrantAudit"("grantId",id);

CREATE FUNCTION app.record_entitlement_grant_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO app."EntitlementGrantAudit" ("grantId","householdId",issuer,operation,snapshot)
      VALUES (OLD.id,OLD."householdId",OLD.issuer,TG_OP,to_jsonb(OLD));
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.revision := 1;
  ELSE NEW.revision := OLD.revision + 1;
  END IF;
  INSERT INTO app."EntitlementGrantAudit" ("grantId","householdId",issuer,operation,snapshot)
    VALUES (NEW.id,NEW."householdId",NEW.issuer,TG_OP,to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER "EntitlementGrant_audit" BEFORE INSERT OR UPDATE OR DELETE ON app."EntitlementGrant"
  FOR EACH ROW EXECUTE FUNCTION app.record_entitlement_grant_change();
REVOKE ALL ON FUNCTION app.record_entitlement_grant_change() FROM PUBLIC;
REVOKE ALL ON app."EntitlementGrant", app."EntitlementGrantAudit" FROM PUBLIC, joint_app_runtime;
REVOKE ALL ON SEQUENCE app."EntitlementGrantAudit_id_seq" FROM PUBLIC, joint_app_runtime;
GRANT SELECT ON app."EntitlementGrant" TO joint_app_runtime;
ALTER TABLE app."EntitlementGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."EntitlementGrant" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."EntitlementGrantAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."EntitlementGrantAudit" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."EntitlementGrant" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY maintenance ON app."EntitlementGrantAudit" TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY entitlement_recipient ON app."EntitlementGrant" FOR SELECT TO joint_app_runtime USING (
  app.scope_is_valid()
  AND "householdId" = nullif(current_setting('joint.household_id',true),'')::uuid
  AND "membershipId" = nullif(current_setting('joint.membership_id',true),'')::uuid
  AND "userId" = nullif(current_setting('joint.user_id',true),'')::uuid
);
DO $$ DECLARE blocked_role text; BEGIN
  FOREACH blocked_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname=blocked_role) THEN
      EXECUTE format('REVOKE ALL ON app."EntitlementGrant",app."EntitlementGrantAudit" FROM %I',blocked_role);
    END IF;
  END LOOP;
END $$;
COMMIT;
