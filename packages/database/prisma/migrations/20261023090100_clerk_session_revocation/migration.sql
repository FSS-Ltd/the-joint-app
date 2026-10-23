BEGIN;
ALTER TABLE app."ClerkIdentity" ADD COLUMN "revokedBeforeAt" timestamptz(3);
DROP FUNCTION app.resolve_clerk_identity(text,text,text,text,timestamptz,timestamptz);
CREATE FUNCTION app.resolve_clerk_identity(
  instance text, external_subject text, external_session text, email_hash text,
  credential_expiry timestamptz, session_expiry timestamptz, session_created_at timestamptz
) RETURNS TABLE("userId" uuid,"sessionId" uuid,"expiresAt" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding app."ClerkIdentity"; mapped app."ClerkSession"; registry app."SessionRegistry";
 actor app."User"; household_id uuid; new_session uuid;
BEGIN
 IF instance IS NULL OR length(instance) NOT BETWEEN 1 AND 255
 OR external_subject IS NULL OR external_subject !~ '^user_[A-Za-z0-9]{1,123}$'
 OR external_session IS NULL OR external_session !~ '^sess_[A-Za-z0-9]{1,123}$'
 OR email_hash IS NULL OR email_hash !~ '^[0-9a-f]{64}$'
 OR credential_expiry IS NULL OR session_expiry IS NULL OR session_created_at IS NULL
 OR session_created_at>clock_timestamp()
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
 IF actor.id IS NULL OR actor.status<>'ACTIVE' OR binding."disabledAt" IS NOT NULL
 OR (binding."revokedBeforeAt" IS NOT NULL AND session_created_at<=binding."revokedBeforeAt") THEN
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

CREATE FUNCTION app.revoke_clerk_session(instance text,external_subject text,external_session text,all_sessions boolean,credential_expiry timestamptz,actor_action text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding app."ClerkIdentity"; mapped app."ClerkSession"; registry app."SessionRegistry"; moment timestamptz=clock_timestamp();
BEGIN
 IF (actor_action IS NOT NULL AND (actor_action<>'PROVIDER_SESSION_REVOKED' OR all_sessions))
 OR credential_expiry IS NULL OR (credential_expiry<=moment AND actor_action IS NULL) THEN RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':user:'||external_subject,0));
 SELECT * INTO binding FROM app."ClerkIdentity" c WHERE c.issuer=instance AND c.subject=external_subject FOR UPDATE;
 IF binding.subject IS NULL THEN RETURN NULL; END IF;
 PERFORM 1 FROM app."User" u WHERE u.id=binding."userId" FOR UPDATE;
 SELECT * INTO mapped FROM app."ClerkSession" c WHERE c.issuer=instance AND c."externalSessionId"=external_session AND c.subject=external_subject FOR UPDATE;
 IF mapped."externalSessionId" IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO registry FROM app."SessionRegistry" s WHERE s.id=mapped."internalSessionId" FOR UPDATE;
 -- Replaying an already logged-out session must not revoke a later genuine sign-in.
 IF registry.id IS NULL OR registry."revokedAt" IS NOT NULL OR registry."expiresAt"<=moment OR mapped."revokedAt" IS NOT NULL THEN RETURN NULL; END IF;
 IF all_sessions THEN
   UPDATE app."ClerkIdentity" SET "revokedBeforeAt"=greatest(coalesce("revokedBeforeAt",'-infinity'::timestamptz),moment) WHERE issuer=instance AND subject=external_subject;
   UPDATE app."ClerkSession" SET "revokedAt"=coalesce("revokedAt",moment) WHERE issuer=instance AND subject=external_subject;
   UPDATE app."SessionRegistry" SET "revokedAt"=coalesce("revokedAt",moment),"providerTokens"=NULL,"providerExpiresAt"=NULL WHERE "userId"=binding."userId";
 ELSE
   UPDATE app."ClerkSession" SET "revokedAt"=moment WHERE issuer=instance AND "externalSessionId"=external_session;
   UPDATE app."SessionRegistry" SET "revokedAt"=moment,"providerTokens"=NULL,"providerExpiresAt"=NULL WHERE id=registry.id;
 END IF;
 INSERT INTO app."AuditEvent"(id,"userId",action) VALUES(gen_random_uuid(),binding."userId",coalesce(actor_action,CASE WHEN all_sessions THEN 'LOGOUT_GLOBAL' ELSE 'LOGOUT_LOCAL' END));
 RETURN binding."userId";
END $$;
REVOKE ALL ON FUNCTION app.resolve_clerk_identity(text,text,text,text,timestamptz,timestamptz,timestamptz),app.revoke_clerk_session(text,text,text,boolean,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_clerk_identity(text,text,text,text,timestamptz,timestamptz,timestamptz),app.revoke_clerk_session(text,text,text,boolean,timestamptz,text) TO joint_app_runtime;
COMMIT;
