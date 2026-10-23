BEGIN;
ALTER TABLE app."ClerkSession" ADD COLUMN "totpVerifiedAt" timestamptz(3);
CREATE FUNCTION app.clerk_totp_proof(instance text,external_session text)
RETURNS timestamptz LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog AS $$
 SELECT c."totpVerifiedAt" FROM app."ClerkSession" c
 JOIN app."SessionRegistry" s ON s.id=c."internalSessionId"
 WHERE c.issuer=instance AND c."externalSessionId"=external_session
 AND c."revokedAt" IS NULL AND s."revokedAt" IS NULL AND s."expiresAt">clock_timestamp()
$$;
CREATE FUNCTION app.record_clerk_totp(instance text,external_subject text,external_session text,verified_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE mapped app."ClerkSession"; actor_id uuid;
BEGIN
 IF verified_at IS NULL OR verified_at<clock_timestamp()-interval '30 seconds'
 OR verified_at>clock_timestamp()+interval '30 seconds' THEN
   RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':user:'||external_subject,0));
 SELECT * INTO mapped FROM app."ClerkSession" c WHERE c.issuer=instance
 AND c.subject=external_subject AND c."externalSessionId"=external_session FOR UPDATE;
 SELECT s."userId" INTO actor_id FROM app."SessionRegistry" s
 JOIN app."User" u ON u.id=s."userId" WHERE s.id=mapped."internalSessionId"
 AND s."revokedAt" IS NULL AND s."expiresAt">clock_timestamp() AND u.status='ACTIVE';
 IF mapped."externalSessionId" IS NULL OR mapped."revokedAt" IS NOT NULL OR actor_id IS NULL THEN
   RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 UPDATE app."ClerkSession" SET "totpVerifiedAt"=least(verified_at,clock_timestamp())
 WHERE issuer=instance AND "externalSessionId"=external_session;
 INSERT INTO app."AuditEvent"(id,"userId",action) VALUES(gen_random_uuid(),actor_id,'MFA_VERIFIED');
END $$;
-- Profile/security updates conservatively invalidate explicit local factor proof.
CREATE FUNCTION app.invalidate_clerk_totp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE app."ClerkSession" SET "totpVerifiedAt"=NULL WHERE issuer=NEW.issuer AND subject=NEW."resourceId";
 RETURN NEW;
END $$;
CREATE TRIGGER clerk_totp_security_update AFTER INSERT ON app."ClerkWebhookEvent"
FOR EACH ROW WHEN(NEW.type='user.updated') EXECUTE FUNCTION app.invalidate_clerk_totp();
REVOKE ALL ON FUNCTION app.clerk_totp_proof(text,text),app.record_clerk_totp(text,text,text,timestamptz),app.invalidate_clerk_totp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.clerk_totp_proof(text,text),app.record_clerk_totp(text,text,text,timestamptz) TO joint_app_runtime;
COMMIT;
