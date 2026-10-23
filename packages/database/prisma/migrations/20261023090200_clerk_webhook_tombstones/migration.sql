BEGIN;
CREATE TABLE app."ClerkResourceState" (
 issuer varchar(255) NOT NULL, "resourceId" varchar(128) NOT NULL,
 subject varchar(128) NOT NULL, kind text NOT NULL CHECK(kind IN ('USER','SESSION')),
 state text NOT NULL CHECK(state IN ('ACTIVE','DISABLED','DELETED','REVOKED')),
 "observedAt" timestamptz(3) NOT NULL,
 PRIMARY KEY(issuer,"resourceId")
);
CREATE TABLE app."ClerkWebhookEvent" (
 issuer varchar(255) NOT NULL, "eventId" varchar(128) NOT NULL,
 "payloadHash" char(64) NOT NULL, type varchar(100) NOT NULL,
 "resourceId" varchar(128) NOT NULL, "occurredAt" timestamptz(3) NOT NULL,
 "processedAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(issuer,"eventId")
);
CREATE INDEX "ClerkResourceState_subject_idx" ON app."ClerkResourceState"(issuer,subject);
ALTER TABLE app."ClerkResourceState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ClerkResourceState" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."ClerkWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ClerkWebhookEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."ClerkResourceState" TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY maintenance ON app."ClerkWebhookEvent" TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON app."ClerkResourceState",app."ClerkWebhookEvent" FROM PUBLIC,joint_app_runtime;

CREATE FUNCTION app.apply_clerk_webhook(instance text,event_id text,payload_hash text,event_type text,
 resource_id text,external_subject text,event_time timestamptz,resource_state text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior app."ClerkResourceState"; seen app."ClerkWebhookEvent"; binding app."ClerkIdentity";
 resource_kind text;
BEGIN
 IF instance IS NULL OR length(instance) NOT BETWEEN 1 AND 255
 OR event_id IS NULL OR event_id !~ '^[A-Za-z0-9_-]{1,128}$'
 OR payload_hash IS NULL OR payload_hash !~ '^[a-f0-9]{64}$'
 OR external_subject IS NULL OR external_subject !~ '^user_[A-Za-z0-9]{1,123}$'
 OR event_time IS NULL OR event_time>clock_timestamp()+interval '5 minutes'
 OR event_type IS NULL OR event_type NOT IN ('user.created','user.updated','user.deleted',
 'session.created','session.updated','session.ended','session.removed','session.revoked')
 OR resource_state IS NULL OR resource_state NOT IN ('ACTIVE','DISABLED','DELETED','REVOKED')
 THEN RAISE EXCEPTION 'Webhook unavailable' USING ERRCODE='42501'; END IF;
 resource_kind=CASE WHEN event_type LIKE 'user.%' THEN 'USER' ELSE 'SESSION' END;
 IF resource_id IS NULL OR (resource_kind='USER' AND resource_id<>external_subject)
 OR (resource_kind='SESSION' AND resource_id !~ '^sess_[A-Za-z0-9]{1,123}$')
 OR (event_type='user.deleted' AND resource_state<>'DELETED')
 OR (event_type IN ('session.ended','session.removed','session.revoked') AND resource_state<>'REVOKED')
 THEN RAISE EXCEPTION 'Webhook unavailable' USING ERRCODE='42501'; END IF;
 -- Same subject lock as JIT registration and logout; all network work happens before this transaction.
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':user:'||external_subject,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':event:'||event_id,0));
 SELECT * INTO seen FROM app."ClerkWebhookEvent" e WHERE e.issuer=instance AND e."eventId"=event_id;
 IF seen."eventId" IS NOT NULL THEN
   IF seen."payloadHash"<>payload_hash THEN RAISE EXCEPTION 'Webhook unavailable' USING ERRCODE='42501'; END IF;
   RETURN;
 END IF;
 IF resource_kind='SESSION' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(instance||':session:'||resource_id,0));
 END IF;
 SELECT * INTO prior FROM app."ClerkResourceState" r WHERE r.issuer=instance AND r."resourceId"=resource_id FOR UPDATE;
 IF prior."resourceId" IS NOT NULL AND (prior.subject<>external_subject OR prior.kind<>resource_kind) THEN
   RAISE EXCEPTION 'Webhook unavailable' USING ERRCODE='42501';
 END IF;
 -- Terminal states cannot be undone by a retry, newer activation, or an out-of-order update.
 IF prior.state IS NULL OR (prior.state NOT IN ('DELETED','REVOKED')
   AND (resource_state IN ('DELETED','REVOKED') OR event_time>=prior."observedAt")) THEN
   INSERT INTO app."ClerkResourceState"(issuer,"resourceId",subject,kind,state,"observedAt")
     VALUES(instance,resource_id,external_subject,resource_kind,resource_state,event_time)
     ON CONFLICT(issuer,"resourceId") DO UPDATE SET state=excluded.state,"observedAt"=excluded."observedAt";
   SELECT * INTO binding FROM app."ClerkIdentity" c WHERE c.issuer=instance AND c.subject=external_subject FOR UPDATE;
   IF binding.subject IS NOT NULL AND resource_state IN ('DISABLED','DELETED','REVOKED') THEN
     IF resource_kind='USER' THEN
       IF resource_state='DELETED' THEN
         UPDATE app."ClerkIdentity" SET "disabledAt"=coalesce("disabledAt",clock_timestamp()) WHERE issuer=instance AND subject=external_subject;
       END IF;
       UPDATE app."ClerkSession" SET "revokedAt"=coalesce("revokedAt",clock_timestamp()) WHERE issuer=instance AND subject=external_subject;
       UPDATE app."SessionRegistry" SET "revokedAt"=coalesce("revokedAt",clock_timestamp()) WHERE "userId"=binding."userId";
     ELSE
       UPDATE app."ClerkSession" SET "revokedAt"=coalesce("revokedAt",clock_timestamp())
         WHERE issuer=instance AND "externalSessionId"=resource_id AND subject=external_subject;
       UPDATE app."SessionRegistry" SET "revokedAt"=coalesce("revokedAt",clock_timestamp()) WHERE id IN
         (SELECT c."internalSessionId" FROM app."ClerkSession" c WHERE c.issuer=instance AND c."externalSessionId"=resource_id AND c.subject=external_subject);
     END IF;
     INSERT INTO app."AuditEvent"(id,"userId",action) VALUES(gen_random_uuid(),binding."userId",'PROVIDER_ACCESS_REVOKED');
   END IF;
 END IF;
 INSERT INTO app."ClerkWebhookEvent"(issuer,"eventId","payloadHash",type,"resourceId","occurredAt")
   VALUES(instance,event_id,payload_hash,event_type,resource_id,event_time);
END $$;
REVOKE ALL ON FUNCTION app.apply_clerk_webhook(text,text,text,text,text,text,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.apply_clerk_webhook(text,text,text,text,text,text,timestamptz,text) TO joint_app_runtime;

ALTER FUNCTION app.resolve_clerk_identity(text,text,text,text,timestamptz,timestamptz,timestamptz) RENAME TO resolve_clerk_identity_mapped;
REVOKE ALL ON FUNCTION app.resolve_clerk_identity_mapped(text,text,text,text,timestamptz,timestamptz,timestamptz) FROM PUBLIC,joint_app_runtime;
CREATE FUNCTION app.resolve_clerk_identity(instance text,external_subject text,external_session text,email_hash text,
 credential_expiry timestamptz,session_expiry timestamptz,session_created_at timestamptz)
RETURNS TABLE("userId" uuid,"sessionId" uuid,"expiresAt" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF instance IS NULL OR external_subject IS NULL OR external_session IS NULL THEN
   RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':user:'||external_subject,0));
 IF EXISTS(SELECT 1 FROM app."ClerkResourceState" r WHERE r.issuer=instance
   AND (r."resourceId"=external_subject OR r."resourceId"=external_session) AND r.state<>'ACTIVE') THEN
   RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT * FROM app.resolve_clerk_identity_mapped(instance,external_subject,external_session,email_hash,credential_expiry,session_expiry,session_created_at);
END $$;
REVOKE ALL ON FUNCTION app.resolve_clerk_identity(text,text,text,text,timestamptz,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_clerk_identity(text,text,text,text,timestamptz,timestamptz,timestamptz) TO joint_app_runtime;
COMMIT;
