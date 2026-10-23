BEGIN;
ALTER FUNCTION app.revoke_clerk_session(text,text,text,boolean,timestamptz,text) RENAME TO revoke_clerk_session_mapped;
REVOKE ALL ON FUNCTION app.revoke_clerk_session_mapped(text,text,text,boolean,timestamptz,text) FROM PUBLIC,joint_app_runtime;

-- A terminal observation must beat an earlier provider snapshot even if neither
-- the identity nor this external session has completed its first local mapping.
CREATE FUNCTION app.revoke_clerk_session(instance text,external_subject text,external_session text,all_sessions boolean,
 credential_expiry timestamptz,actor_action text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE moment timestamptz=clock_timestamp(); prior app."ClerkResourceState";
BEGIN
 IF instance IS NULL OR length(instance) NOT BETWEEN 1 AND 255
 OR external_subject IS NULL OR external_subject !~ '^user_[A-Za-z0-9]{1,123}$'
 OR external_session IS NULL OR external_session !~ '^sess_[A-Za-z0-9]{1,123}$'
 OR all_sessions IS NULL OR credential_expiry IS NULL
 OR (credential_expiry<=moment AND actor_action IS NULL)
 OR (actor_action IS NOT NULL AND (actor_action<>'PROVIDER_SESSION_REVOKED' OR all_sessions)) THEN
   RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':user:'||external_subject,0));
 SELECT * INTO prior FROM app."ClerkResourceState" r WHERE r.issuer=instance AND r."resourceId"=external_session FOR UPDATE;
 IF prior."resourceId" IS NOT NULL AND (prior.subject<>external_subject OR prior.kind<>'SESSION') THEN
   RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 INSERT INTO app."ClerkResourceState"(issuer,"resourceId",subject,kind,state,"observedAt")
 VALUES(instance,external_session,external_subject,'SESSION','REVOKED',moment)
 ON CONFLICT(issuer,"resourceId") DO UPDATE SET state='REVOKED',"observedAt"=greatest(app."ClerkResourceState"."observedAt",excluded."observedAt");
 RETURN app.revoke_clerk_session_mapped(instance,external_subject,external_session,all_sessions,credential_expiry,actor_action);
END $$;
REVOKE ALL ON FUNCTION app.revoke_clerk_session(text,text,text,boolean,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.revoke_clerk_session(text,text,text,boolean,timestamptz,text) TO joint_app_runtime;
COMMIT;
