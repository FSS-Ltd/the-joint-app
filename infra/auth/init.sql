-- Local vendor bootstrap, based on supabase/auth v2.197.0 hack/init_postgres.sql.
-- Auth owns its table migrations; Prisma remains the sole app-schema history.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN CREATEROLE CREATEDB REPLICATION BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION PASSWORD 'local-auth-development-only';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT CREATE ON DATABASE auth TO supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path = auth, public;
