import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import { URL } from "node:url";
import process from "node:process";

const require = createRequire(
  new URL("../packages/database/package.json", import.meta.url),
);
const { Client } = require("pg");

function localDatabaseUrl(value) {
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    [...url.searchParams.keys()].some((key) => key !== "schema") ||
    url.hash ||
    !url.pathname.slice(1)
  )
    throw new Error("Local database URL required");
  return url;
}
function sameDatabase(first, second) {
  return (
    first.hostname === second.hostname &&
    first.port === second.port &&
    first.pathname === second.pathname
  );
}

let client;
try {
  const owner = localDatabaseUrl(
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
  );
  if (owner.username === "joint_app_runtime")
    throw new Error("Migration owner URL required");
  let saved;
  try {
    saved = parseEnv(await readFile(".env.database", "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const runtime = saved ? localDatabaseUrl(saved.DATABASE_URL) : new URL(owner);
  if (
    saved &&
    (!sameDatabase(owner, runtime) ||
      runtime.username !== "joint_app_runtime" ||
      saved.MIGRATION_DATABASE_URL !== owner.href)
  )
    throw new Error(
      "Existing runtime configuration belongs to another database",
    );
  const password = saved
    ? decodeURIComponent(runtime.password)
    : randomBytes(32).toString("base64url");
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(password))
    throw new Error("Invalid runtime credential format");
  runtime.username = "joint_app_runtime";
  runtime.password = password;
  client = new Client({
    connectionString: owner.href,
    connectionTimeoutMillis: 2000,
    statement_timeout: 5000,
  });
  await client.connect();
  const { rows } =
    await client.query(`SELECT r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
    EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member = r.oid) AS has_membership,
    EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner = r.oid) AS owns_tables
    FROM pg_catalog.pg_roles r WHERE rolname = 'joint_app_runtime'`);
  const role = rows[0];
  if (!role || Object.values(role).some(Boolean))
    throw new Error("Missing or unsafe runtime role; apply migrations first");
  // PostgreSQL role DDL has no bind parameters; the generated password's strict
  // base64url alphabet is validated above and never printed or sent to a shell.
  await client.query(
    `ALTER ROLE joint_app_runtime LOGIN PASSWORD '${password}'`,
  );
  if (!saved)
    await writeFile(
      ".env.database",
      `DATABASE_URL=${runtime.href}\nMIGRATION_DATABASE_URL=${owner.href}\n`,
      { mode: 0o600, flag: "wx" },
    );
  process.stdout.write(
    "Local restricted runtime database configured; credentials remain in ignored .env.database.\n",
  );
} catch {
  process.stderr.write(
    "Runtime database setup failed. Check local migration-owner configuration, migrations and existing .env.database.\n",
  );
  process.exitCode = 1;
} finally {
  await client?.end();
}
