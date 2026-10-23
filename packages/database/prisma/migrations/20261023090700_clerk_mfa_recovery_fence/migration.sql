BEGIN;
ALTER TABLE app."ClerkIdentity" ADD COLUMN "mfaRequired" boolean NOT NULL DEFAULT false;
CREATE FUNCTION app.clerk_mfa_requirement(instance text,external_subject text,enrolled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE required boolean;
BEGIN
 IF instance IS NULL OR length(instance) NOT BETWEEN 1 AND 255 OR external_subject IS NULL
 OR external_subject !~ '^user_[A-Za-z0-9]{1,123}$' OR enrolled IS NULL
 THEN RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':user:'||external_subject,0));
 IF enrolled THEN
   UPDATE app."ClerkIdentity" SET "mfaRequired"=true
   WHERE issuer=instance AND subject=external_subject AND NOT "mfaRequired";
 END IF;
 SELECT c."mfaRequired" INTO required FROM app."ClerkIdentity" c WHERE c.issuer=instance AND c.subject=external_subject;
 RETURN coalesce(required,enrolled);
END $$;
REVOKE ALL ON FUNCTION app.clerk_mfa_requirement(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.clerk_mfa_requirement(text,text,boolean) TO joint_app_runtime;
COMMIT;
