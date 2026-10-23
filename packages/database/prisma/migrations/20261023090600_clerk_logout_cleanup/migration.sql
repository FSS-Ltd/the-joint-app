BEGIN;
ALTER TABLE app."ClerkSession" ADD COLUMN "logoutScope" text CHECK("logoutScope" IN ('local','global')),
 ADD COLUMN "logoutCutoffAt" timestamptz(3),
 ADD CONSTRAINT "ClerkSession_logout_context_check" CHECK(("logoutScope" IS NULL)=("logoutCutoffAt" IS NULL));

CREATE FUNCTION app.begin_clerk_logout(instance text,external_subject text,external_session text,requested_scope text,credential_expiry timestamptz)
RETURNS TABLE("userId" uuid,"cutoffAt" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE mapped app."ClerkSession"; actor_id uuid; cutoff timestamptz;
BEGIN
 IF requested_scope IS NULL OR requested_scope NOT IN ('local','global') OR credential_expiry IS NULL OR credential_expiry<=clock_timestamp()
 THEN RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':user:'||external_subject,0));
 SELECT * INTO mapped FROM app."ClerkSession" s WHERE s.issuer=instance AND s.subject=external_subject AND s."externalSessionId"=external_session FOR UPDATE;
 IF mapped."logoutScope" IS NOT NULL THEN
   IF mapped."logoutScope"<>requested_scope OR mapped."logoutCutoffAt"+interval '30 minutes'<=clock_timestamp()
   THEN RAISE EXCEPTION 'Cleanup unavailable' USING ERRCODE='42501'; END IF;
   SELECT c."userId" INTO actor_id FROM app."ClerkIdentity" c WHERE c.issuer=instance AND c.subject=external_subject;
   RETURN QUERY SELECT actor_id,mapped."logoutCutoffAt";
   RETURN;
 END IF;
 actor_id=app.revoke_clerk_session(instance,external_subject,external_session,requested_scope='global',credential_expiry);
 IF actor_id IS NULL THEN RETURN; END IF;
 SELECT s."revokedAt" INTO cutoff FROM app."ClerkSession" s WHERE s.issuer=instance AND s.subject=external_subject AND s."externalSessionId"=external_session;
 UPDATE app."ClerkSession" SET "logoutScope"=requested_scope,"logoutCutoffAt"=cutoff WHERE issuer=instance AND "externalSessionId"=external_session;
 RETURN QUERY SELECT actor_id,cutoff;
END $$;
REVOKE ALL ON FUNCTION app.begin_clerk_logout(text,text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.begin_clerk_logout(text,text,text,text,timestamptz) TO joint_app_runtime;
COMMIT;
