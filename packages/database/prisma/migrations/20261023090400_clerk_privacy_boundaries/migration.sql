BEGIN;
-- Serialize the external identity snapshot, durable journal fsync and deletion request
-- against JIT/link operations, which also lock the internal User before binding.
CREATE FUNCTION app.deletion_clerk_identities()
RETURNS TABLE(issuer text,subject text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor_id uuid := nullif(current_setting('joint.user_id',true),'')::uuid;
BEGIN
 PERFORM 1 FROM app."User" u WHERE u.id=actor_id FOR UPDATE;
 IF NOT FOUND OR NOT coalesce(app.deletion_authorized(),false) THEN
   RAISE EXCEPTION 'Verified deletion unavailable' USING ERRCODE='42501';
 END IF;
 IF (SELECT count(*) FROM app."ClerkIdentity" c WHERE c."userId"=actor_id)>5 THEN
   RAISE EXCEPTION 'Verified deletion unavailable' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT c.issuer::text,c.subject::text FROM app."ClerkIdentity" c WHERE c."userId"=actor_id ORDER BY c.issuer,c.subject;
END $$;
REVOKE ALL ON FUNCTION app.deletion_clerk_identities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.deletion_clerk_identities() TO joint_app_runtime;

-- Linking must obey webhook-first tombstones just as JIT resolution does.
ALTER FUNCTION app.bind_clerk_identity(text,text,text,uuid,uuid,timestamptz,timestamptz,timestamptz) RENAME TO bind_clerk_identity_mapped;
REVOKE ALL ON FUNCTION app.bind_clerk_identity_mapped(text,text,text,uuid,uuid,timestamptz,timestamptz,timestamptz) FROM PUBLIC,joint_app_runtime;
CREATE FUNCTION app.bind_clerk_identity(instance text,external_subject text,email_hash text,legacy_user uuid,legacy_session uuid,
 legacy_mfa timestamptz,clerk_mfa timestamptz,credential_expiry timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF instance IS NULL OR external_subject IS NULL THEN
   RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(instance||':user:'||external_subject,0));
 IF EXISTS(SELECT 1 FROM app."ClerkResourceState" r WHERE r.issuer=instance AND r."resourceId"=external_subject AND r.state<>'ACTIVE') THEN
   RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM app.bind_clerk_identity_mapped(instance,external_subject,email_hash,legacy_user,legacy_session,legacy_mfa,clerk_mfa,credential_expiry);
END $$;
REVOKE ALL ON FUNCTION app.bind_clerk_identity(text,text,text,uuid,uuid,timestamptz,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.bind_clerk_identity(text,text,text,uuid,uuid,timestamptz,timestamptz,timestamptz) TO joint_app_runtime;
COMMIT;
