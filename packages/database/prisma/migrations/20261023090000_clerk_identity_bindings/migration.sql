BEGIN;
CREATE TABLE app."ClerkIdentity" (
  issuer varchar(255) NOT NULL,
  subject varchar(128) NOT NULL CHECK (subject ~ '^user_[A-Za-z0-9]+$'),
  "userId" uuid NOT NULL REFERENCES app."User"(id) ON DELETE RESTRICT,
  "disabledAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(issuer,subject),
  UNIQUE(issuer,"userId")
);
CREATE TABLE app."ClerkSession" (
  issuer varchar(255) NOT NULL,
  "externalSessionId" varchar(128) NOT NULL CHECK ("externalSessionId" ~ '^sess_[A-Za-z0-9]+$'),
  subject varchar(128) NOT NULL,
  -- Deliberately no registry FK: purging a registry must retain its replay tombstone.
  "internalSessionId" uuid NOT NULL UNIQUE,
  "revokedAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(issuer,"externalSessionId"),
  FOREIGN KEY(issuer,subject) REFERENCES app."ClerkIdentity"(issuer,subject) ON DELETE RESTRICT
);
CREATE INDEX "ClerkSession_identity_idx" ON app."ClerkSession"(issuer,subject);
ALTER TABLE app."ClerkIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ClerkIdentity" FORCE ROW LEVEL SECURITY;
ALTER TABLE app."ClerkSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ClerkSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance ON app."ClerkIdentity" TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY maintenance ON app."ClerkSession" TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON app."ClerkIdentity",app."ClerkSession" FROM PUBLIC,joint_app_runtime;

CREATE FUNCTION app.resolve_clerk_identity(
  instance text, external_subject text, external_session text, email_hash text,
  credential_expiry timestamptz, session_expiry timestamptz
) RETURNS TABLE("userId" uuid,"sessionId" uuid,"expiresAt" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding app."ClerkIdentity"; mapped app."ClerkSession"; registry app."SessionRegistry";
 actor app."User"; household_id uuid; new_session uuid;
BEGIN
 IF instance IS NULL OR length(instance) NOT BETWEEN 1 AND 255
 OR external_subject IS NULL OR external_subject !~ '^user_[A-Za-z0-9]{1,123}$'
 OR external_session IS NULL OR external_session !~ '^sess_[A-Za-z0-9]{1,123}$'
 OR email_hash IS NULL OR email_hash !~ '^[0-9a-f]{64}$'
 OR credential_expiry IS NULL OR session_expiry IS NULL
 OR credential_expiry <= clock_timestamp() OR session_expiry <= clock_timestamp()
 THEN RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':user:'||external_subject,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('clerk:email:'||email_hash,0));
 SELECT * INTO binding FROM app."ClerkIdentity" c WHERE c.issuer=instance AND c.subject=external_subject FOR UPDATE;
 IF binding.subject IS NULL THEN
   IF EXISTS(SELECT 1 FROM app."User" u WHERE u."emailHash"=email_hash) THEN
     RAISE EXCEPTION 'Identity migration required' USING ERRCODE='P0001';
   END IF;
   INSERT INTO app."User"(id,"emailHash") VALUES(gen_random_uuid(),email_hash) RETURNING * INTO actor;
   INSERT INTO app."ClerkIdentity"(issuer,subject,"userId") VALUES(instance,external_subject,actor.id) RETURNING * INTO binding;
 ELSE
   SELECT * INTO actor FROM app."User" u WHERE u.id=binding."userId" FOR UPDATE;
 END IF;
 IF actor.id IS NULL OR actor.status<>'ACTIVE' OR binding."disabledAt" IS NOT NULL THEN
   RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 IF actor."emailHash" IS DISTINCT FROM email_hash THEN
   IF EXISTS(SELECT 1 FROM app."User" u WHERE u."emailHash"=email_hash AND u.id<>actor.id) THEN
     RAISE EXCEPTION 'Identity migration required' USING ERRCODE='P0001';
   END IF;
   UPDATE app."User" SET "emailHash"=email_hash WHERE id=actor.id;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':session:'||external_session,0));
 SELECT * INTO mapped FROM app."ClerkSession" c WHERE c.issuer=instance AND c."externalSessionId"=external_session FOR UPDATE;
 IF mapped."externalSessionId" IS NOT NULL THEN
   IF mapped.subject<>external_subject OR mapped."revokedAt" IS NOT NULL THEN
     RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
   END IF;
   SELECT * INTO registry FROM app."SessionRegistry" s WHERE s.id=mapped."internalSessionId" FOR UPDATE;
   IF registry.id IS NULL OR registry."userId"<>actor.id OR registry.kind<>'BEARER'
   OR registry."revokedAt" IS NOT NULL OR registry."expiresAt"<=clock_timestamp() OR registry.purpose<>'NORMAL'
   OR (registry."householdId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app."Membership" m
     WHERE m."userId"=actor.id AND m."householdId"=registry."householdId" AND m.status='ACTIVE'))
   THEN RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501'; END IF;
 ELSE
   SELECT m."householdId" INTO household_id FROM app."Membership" m WHERE m."userId"=actor.id AND m.status='ACTIVE';
   new_session=gen_random_uuid();
   INSERT INTO app."SessionRegistry"(id,"userId","householdId",kind,purpose,"expiresAt")
     VALUES(new_session,actor.id,household_id,'BEARER','NORMAL',least(session_expiry,clock_timestamp()+interval '7 days')) RETURNING * INTO registry;
   INSERT INTO app."ClerkSession"(issuer,"externalSessionId",subject,"internalSessionId") VALUES(instance,external_session,external_subject,new_session);
   INSERT INTO app."AuditEvent"(id,"userId",action) VALUES(gen_random_uuid(),actor.id,'SESSION_CREATED');
 END IF;
 -- Recheck expiry after lock waits, without extending the registry's absolute lifetime.
 IF credential_expiry<=clock_timestamp() OR session_expiry<=clock_timestamp() THEN
   RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT actor.id,registry.id,least(registry."expiresAt",session_expiry);
END $$;

CREATE FUNCTION app.bind_clerk_identity(
 instance text, external_subject text, email_hash text, legacy_user uuid, legacy_session uuid,
 legacy_mfa timestamptz, clerk_mfa timestamptz, credential_expiry timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor app."User"; binding app."ClerkIdentity";
BEGIN
 IF instance IS NULL OR length(instance) NOT BETWEEN 1 AND 255 OR external_subject IS NULL
 OR external_subject !~ '^user_[A-Za-z0-9]{1,123}$' OR email_hash IS NULL OR email_hash !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':user:'||external_subject,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('clerk:email:'||email_hash,0));
 SELECT * INTO actor FROM app."User" u WHERE u.id=legacy_user FOR UPDATE;
 IF actor.id IS NULL OR actor.status<>'ACTIVE' OR actor."emailHash" IS DISTINCT FROM email_hash
 OR credential_expiry IS NULL OR credential_expiry<=clock_timestamp()
 OR legacy_mfa IS NULL OR clerk_mfa IS NULL
 OR legacy_mfa NOT BETWEEN clock_timestamp()-interval '5 minutes' AND clock_timestamp()
 OR clerk_mfa NOT BETWEEN clock_timestamp()-interval '5 minutes' AND clock_timestamp()
 OR NOT EXISTS(SELECT 1 FROM app."SessionRegistry" s WHERE s.id=legacy_session AND s."userId"=legacy_user
   AND s.kind='WEB' AND s.purpose='NORMAL' AND s."revokedAt" IS NULL AND s."expiresAt">clock_timestamp())
 THEN RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO binding FROM app."ClerkIdentity" c WHERE c.issuer=instance AND c.subject=external_subject FOR UPDATE;
 IF binding.subject IS NOT NULL THEN
   IF binding."userId"<>legacy_user OR binding."disabledAt" IS NOT NULL THEN
     RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
   END IF;
   RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM app."ClerkIdentity" c WHERE c.issuer=instance AND c."userId"=legacy_user) THEN
   RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 INSERT INTO app."ClerkIdentity"(issuer,subject,"userId") VALUES(instance,external_subject,legacy_user);
 INSERT INTO app."AuditEvent"(id,"userId",action) VALUES(gen_random_uuid(),legacy_user,'IDENTITY_LINKED');
END $$;
REVOKE ALL ON FUNCTION app.resolve_clerk_identity(text,text,text,text,timestamptz,timestamptz),app.bind_clerk_identity(text,text,text,uuid,uuid,timestamptz,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_clerk_identity(text,text,text,text,timestamptz,timestamptz),app.bind_clerk_identity(text,text,text,uuid,uuid,timestamptz,timestamptz,timestamptz) TO joint_app_runtime;
COMMIT;
