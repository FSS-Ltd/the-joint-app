BEGIN;

-- Missing data or expired authority must never masquerade as a successful EOF.
DROP FUNCTION app.export_download_chunk(uuid,integer);
CREATE FUNCTION app.export_download_chunk(export_id uuid,chunk_sequence integer)
RETURNS TABLE(ciphertext text,done boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE expected_count integer; stored_ciphertext text;
BEGIN
 IF NOT coalesce(app.export_actor(export_id),false) OR NOT coalesce(app.export_fresh_mfa(),false) THEN
  RAISE EXCEPTION 'Export unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM app."Account" a JOIN app."ExportSource" s ON s."accountId"=a.id WHERE s."exportId"=export_id ORDER BY a.id FOR SHARE OF a;
 PERFORM 1 FROM app."ExportAccountRevision" v JOIN app."ExportSource" s ON s."accountId"=v."accountId" WHERE s."exportId"=export_id ORDER BY v."accountId" FOR SHARE OF v;
 PERFORM 1 FROM app."ExportNoteRevision" n JOIN app."ExportSource" s ON s."accountId"=n."accountId"
 JOIN app."ExportRequest" e ON e.id=s."exportId" AND e."userId"=n."userId"
 WHERE s."exportId"=export_id AND s.level='TRANSACTIONS' ORDER BY n."accountId",n."userId" FOR SHARE OF n;
 IF NOT coalesce(app.export_fence(export_id),false) THEN
  RAISE EXCEPTION 'Export unavailable' USING ERRCODE='42501';
 END IF;
 SELECT e."chunkCount" INTO expected_count FROM app."ExportRequest" e
 WHERE e.id=export_id AND e.state='READY' AND e."downloadExpiresAt">clock_timestamp();
 IF expected_count IS NULL OR expected_count<1 OR chunk_sequence IS NULL OR chunk_sequence<0 OR chunk_sequence>expected_count THEN
  RAISE EXCEPTION 'Export unavailable' USING ERRCODE='42501';
 END IF;
 IF chunk_sequence=expected_count THEN
  RETURN QUERY SELECT NULL::text,true;
  RETURN;
 END IF;
 SELECT c.ciphertext INTO stored_ciphertext FROM app."ExportChunk" c
 WHERE c."exportId"=export_id AND c.sequence=chunk_sequence;
 IF stored_ciphertext IS NULL THEN
  RAISE EXCEPTION 'Export unavailable' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT stored_ciphertext,false;
END $$;
REVOKE ALL ON FUNCTION app.export_download_chunk(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.export_download_chunk(uuid,integer) TO joint_app_runtime;
COMMIT;
