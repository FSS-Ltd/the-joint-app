BEGIN;
CREATE TABLE app."ClerkTotpOperation" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), issuer varchar(255) NOT NULL,
 action text NOT NULL CHECK (action IN ('sign-in','enrollment')),
 "nonceHash" char(64) UNIQUE, checkpoint timestamptz(3) NOT NULL,
 subject varchar(128), "sessionId" varchar(128), "verifiedAt" timestamptz(3), "proofAt" timestamptz(3),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','complete')),
 "eventId" varchar(128), "eventHash" char(64), "eventSubjectHash" char(64),
 FOREIGN KEY(issuer,subject) REFERENCES app."ClerkIdentity"(issuer,subject) ON DELETE CASCADE,
 CHECK ((action='enrollment') = ("nonceHash" IS NOT NULL))
);
ALTER TABLE app."ClerkTotpOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ClerkTotpOperation" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."ClerkTotpOperation" TO CURRENT_USER USING (true) WITH CHECK (true);
REVOKE ALL ON app."ClerkTotpOperation" FROM PUBLIC,joint_app_runtime;
CREATE INDEX "ClerkTotpOperation_checkpoint_idx" ON app."ClerkTotpOperation" (checkpoint);
CREATE INDEX "ClerkWebhookEvent_subject_checkpoint_idx" ON app."ClerkWebhookEvent" (issuer,"resourceId","processedAt") WHERE type='user.updated';

CREATE FUNCTION app.begin_clerk_totp_operation(instance text, operation_action text, nonce_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE operation_id uuid;
BEGIN
 IF instance IS NULL OR length(instance) NOT BETWEEN 1 AND 255 OR operation_action NOT IN ('sign-in','enrollment')
 OR (operation_action='enrollment' AND (nonce_hash IS NULL OR nonce_hash !~ '^[a-f0-9]{64}$'))
 OR (operation_action='sign-in' AND nonce_hash IS NOT NULL) THEN
  RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('lock_timeout','2s',true);
 LOCK TABLE app."ClerkWebhookEvent" IN SHARE MODE;
 DELETE FROM app."ClerkTotpOperation" WHERE id IN (SELECT id FROM app."ClerkTotpOperation" WHERE checkpoint<clock_timestamp()-interval '5 minutes' ORDER BY checkpoint LIMIT 100 FOR UPDATE SKIP LOCKED);
 INSERT INTO app."ClerkTotpOperation"(issuer,action,"nonceHash",checkpoint)
 VALUES(instance,operation_action,nonce_hash,date_trunc('milliseconds',clock_timestamp())) RETURNING id INTO operation_id;
 RETURN operation_id;
END $$;

CREATE OR REPLACE FUNCTION app.invalidate_clerk_totp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op app."ClerkTotpOperation"; marker text;
BEGIN
 marker := nullif(current_setting('app.clerk_totp_nonce_hash',true),'');
 IF marker IS NOT NULL THEN
   SELECT * INTO op FROM app."ClerkTotpOperation" WHERE issuer=NEW.issuer AND "nonceHash"=marker FOR UPDATE;
   IF op.id IS NOT NULL AND op."eventId" IS NULL AND NEW."processedAt">=op.checkpoint AND clock_timestamp()<op.checkpoint+interval '2 minutes'
      AND (op.subject IS NULL OR op.subject=NEW."resourceId") THEN
     UPDATE app."ClerkTotpOperation" SET "eventId"=NEW."eventId", "eventHash"=NEW."payloadHash", "eventSubjectHash"=encode(sha256(convert_to(NEW."resourceId",'UTF8')),'hex') WHERE id=op.id;
     IF op.status='complete' THEN
       UPDATE app."ClerkSession" SET "totpVerifiedAt"=NULL WHERE issuer=NEW.issuer AND subject=NEW."resourceId" AND ("externalSessionId"<>op."sessionId" OR "totpVerifiedAt" IS DISTINCT FROM op."proofAt");
       RETURN NEW;
     END IF;
   END IF;
 END IF;
 UPDATE app."ClerkSession" SET "totpVerifiedAt"=NULL WHERE issuer=NEW.issuer AND subject=NEW."resourceId";
 RETURN NEW;
END $$;

CREATE FUNCTION app.apply_clerk_webhook_with_totp_marker(instance text,event_id text,payload_hash text,event_type text,
 resource_id text,external_subject text,event_time timestamptz,resource_state text,nonce_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF nonce_hash IS NOT NULL AND (event_type<>'user.updated' OR nonce_hash !~ '^[a-f0-9]{64}$') THEN
   RAISE EXCEPTION 'Webhook unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.clerk_totp_nonce_hash',coalesce(nonce_hash,''),true);
 PERFORM app.apply_clerk_webhook(instance,event_id,payload_hash,event_type,resource_id,external_subject,event_time,resource_state);
 PERFORM set_config('app.clerk_totp_nonce_hash','',true);
END $$;

CREATE FUNCTION app.complete_clerk_totp_operation(operation_id uuid, instance text, external_subject text, external_session text, verified_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op app."ClerkTotpOperation";
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':user:'||external_subject,0));
 SELECT * INTO op FROM app."ClerkTotpOperation" WHERE id=operation_id FOR UPDATE;
 IF op.id IS NULL OR op.issuer<>instance OR (op.status='complete' AND
   (op.subject<>external_subject OR op."sessionId"<>external_session OR op."verifiedAt"<>verified_at)) THEN
   RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 IF op.status='complete' THEN RETURN; END IF;
 IF op.checkpoint<clock_timestamp()-interval '2 minutes' OR (op."eventSubjectHash" IS NOT NULL AND op."eventSubjectHash"<>encode(sha256(convert_to(external_subject,'UTF8')),'hex')) OR EXISTS (
   SELECT 1 FROM app."ClerkWebhookEvent" e WHERE e.issuer=instance AND e."resourceId"=external_subject
   AND e.type='user.updated' AND e."processedAt">=op.checkpoint
   AND NOT (op.action='enrollment' AND e."eventId" IS NOT DISTINCT FROM op."eventId" AND e."payloadHash" IS NOT DISTINCT FROM op."eventHash")
 ) THEN RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501'; END IF;
 PERFORM app.record_clerk_totp(instance,external_subject,external_session,verified_at);
 UPDATE app."ClerkTotpOperation" SET subject=external_subject,"sessionId"=external_session,"verifiedAt"=verified_at,"proofAt"=app.clerk_totp_proof(instance,external_session),status='complete' WHERE id=operation_id;
END $$;
CREATE FUNCTION app.clerk_totp_operation_complete(operation_id uuid, instance text, external_subject text, external_session text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS (SELECT 1 FROM app."ClerkTotpOperation" WHERE id=operation_id AND issuer=instance AND subject=external_subject AND "sessionId"=external_session AND status='complete' AND app.clerk_totp_proof(instance,external_session)="proofAt")
$$;
REVOKE ALL ON FUNCTION app.begin_clerk_totp_operation(text,text,text), app.apply_clerk_webhook_with_totp_marker(text,text,text,text,text,text,timestamptz,text,text), app.complete_clerk_totp_operation(uuid,text,text,text,timestamptz), app.clerk_totp_operation_complete(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.begin_clerk_totp_operation(text,text,text), app.apply_clerk_webhook_with_totp_marker(text,text,text,text,text,text,timestamptz,text,text), app.complete_clerk_totp_operation(uuid,text,text,text,timestamptz), app.clerk_totp_operation_complete(uuid,text,text,text) TO joint_app_runtime;
COMMIT;
