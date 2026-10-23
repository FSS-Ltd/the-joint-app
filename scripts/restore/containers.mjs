import { URL } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { docker } from "./commands.mjs";

const require = createRequire(
  new URL("../../packages/database/package.json", import.meta.url),
);
const { Client } = require("pg");
export function localDatabase(value) {
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => key !== "schema") ||
    !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(decodeURIComponent(url.username)) ||
    !/^\/[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(url.pathname) ||
    url.username === "joint_app_runtime"
  )
    throw new Error("Local maintenance database required");
  return url;
}
export function clientFor(url) {
  return new Client({
    connectionString: url.href,
    connectionTimeoutMillis: 2000,
    statement_timeout: 15000,
  });
}
export async function sourceContainer(url) {
  const ids = (
    await docker([
      "ps",
      "--filter",
      `publish=${url.port || "5432"}`,
      "--format",
      "{{.ID}}",
    ])
  )
    .split("\n")
    .filter(Boolean);
  const matching = [];
  for (const id of ids) {
    const bindings = JSON.parse(
      await docker([
        "inspect",
        "--format",
        '{{json (index .NetworkSettings.Ports "5432/tcp")}}',
        id,
      ]),
    );
    if (
      Array.isArray(bindings) &&
      bindings.some(
        (binding) =>
          binding.HostIp === "127.0.0.1" &&
          binding.HostPort === (url.port || "5432"),
      )
    )
      matching.push(id);
  }
  if (matching.length !== 1)
    throw new Error("Unique loopback source container required");
  return { name: matching[0], url };
}
export async function dumpApp(container, path) {
  const file = await open(path, "wx", 0o600);
  try {
    await docker(
      [
        "exec",
        "--env",
        "PGPASSWORD",
        container.name,
        "pg_dump",
        "--username",
        decodeURIComponent(container.url.username),
        "--dbname",
        container.url.pathname.slice(1),
        "--format=custom",
        "--schema=app",
        "--no-owner",
      ],
      {
        env: { PGPASSWORD: decodeURIComponent(container.url.password) },
        output: file.fd,
      },
    );
    await file.sync();
  } finally {
    await file.close();
  }
}
export async function createTarget(ownerRole) {
  const id = randomUUID(),
    name = `joint-restore-${id}`,
    volume = `${name}-data`,
    password = randomBytes(32).toString("base64url");
  const target = { id, name, volume, password, url: null, client: null };
  try {
    await docker([
      "volume",
      "create",
      "--label",
      `joint.restore-rehearsal=${id}`,
      volume,
    ]);
    await docker(
      [
        "run",
        "--detach",
        "--pull=never",
        "--name",
        name,
        "--label",
        `joint.restore-rehearsal=${id}`,
        "--publish",
        "127.0.0.1::5432",
        "--volume",
        `${volume}:/var/lib/postgresql/data`,
        "--env",
        "POSTGRES_PASSWORD",
        "--env",
        "POSTGRES_USER=restore_admin",
        "--env",
        "POSTGRES_DB=joint_restore",
        "postgres:17.6",
      ],
      { env: { POSTGRES_PASSWORD: password } },
    );
    const binding = await docker(["port", name, "5432/tcp"]);
    if (!/^127\.0\.0\.1:\d+$/.test(binding))
      throw new Error("Isolated target binding unavailable");
    target.url = new URL(
      `postgresql://restore_admin:${password}@${binding}/joint_restore`,
    );
    for (let attempt = 0; attempt < 60; attempt++) {
      const client = clientFor(target.url);
      try {
        await client.connect();
        target.client = client;
        break;
      } catch {
        await client.end().catch(() => {});
        await delay(100);
      }
    }
    if (!target.client) throw new Error("Isolated target unavailable");
    await target.client.query(
      "CREATE ROLE joint_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
    );
    const { rows } = await target.client.query(
      "SELECT 1 FROM pg_roles WHERE rolname=$1",
      [ownerRole],
    );
    if (!rows.length)
      await target.client.query(`CREATE ROLE "${ownerRole}" NOLOGIN`);
    await target.client.query(
      "CREATE TABLE public.restore_gate (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),state text NOT NULL CHECK(state IN ('CLOSED','OPEN')),verified boolean NOT NULL DEFAULT false)",
    );
    await target.client.query(
      "INSERT INTO public.restore_gate(state) VALUES('CLOSED')",
    );
    await target.client.query(
      'CREATE TABLE public.restore_receipt ("eventId" uuid PRIMARY KEY,digest char(64) NOT NULL,"appliedAt" timestamptz NOT NULL DEFAULT clock_timestamp())',
    );
    return target;
  } catch (error) {
    try {
      await destroyTarget(target);
    } catch (cleanupError) {
      throw new Error("RESTORE_CLEANUP_PENDING", { cause: cleanupError });
    }
    throw error;
  }
}
export async function restoreApp(target, path) {
  await assertTarget(target);
  const file = await open(path, "r");
  try {
    await docker(
      [
        "exec",
        "-i",
        "--env",
        "PGPASSWORD",
        target.name,
        "pg_restore",
        "--exit-on-error",
        "--no-owner",
        "--username",
        "restore_admin",
        "--dbname",
        "joint_restore",
      ],
      { env: { PGPASSWORD: target.password }, input: file.fd },
    );
  } finally {
    await file.close();
  }
}
export async function assertTarget(target) {
  if (
    !target.url ||
    target.url.hostname !== "127.0.0.1" ||
    target.url.pathname !== "/joint_restore" ||
    target.name !== `joint-restore-${target.id}`
  )
    throw new Error("Isolated target required");
  const label = await docker([
    "inspect",
    "--format",
    '{{ index .Config.Labels "joint.restore-rehearsal" }}',
    target.name,
  ]);
  if (label !== target.id) throw new Error("Isolated target required");
}
export async function destroyTarget(target) {
  await target.client?.end().catch(() => {});
  // A successful inventory, not a failed inspect, establishes resource absence.
  const containers = (
    await docker([
      "ps",
      "--all",
      "--filter",
      `name=^${target.name}$`,
      "--format",
      "{{.Names}}",
    ])
  ).split("\n");
  if (containers.includes(target.name)) {
    const label = await docker([
      "inspect",
      "--format",
      '{{ index .Config.Labels "joint.restore-rehearsal" }}',
      target.name,
    ]);
    if (label !== target.id)
      throw new Error("Restore resource ownership mismatch");
    await docker(["rm", "--force", target.name]);
  }
  const volumes = (
    await docker([
      "volume",
      "ls",
      "--filter",
      `name=^${target.volume}$`,
      "--format",
      "{{.Name}}",
    ])
  ).split("\n");
  if (volumes.includes(target.volume)) {
    const label = await docker([
      "volume",
      "inspect",
      "--format",
      '{{ index .Labels "joint.restore-rehearsal" }}',
      target.volume,
    ]);
    if (label !== target.id)
      throw new Error("Restore resource ownership mismatch");
    await docker(["volume", "rm", target.volume]);
  }
}
