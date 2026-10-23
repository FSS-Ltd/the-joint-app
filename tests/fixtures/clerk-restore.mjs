import process from "node:process";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import {
  createTarget,
  destroyTarget,
} from "../../scripts/restore/containers.mjs";
import { replayJournal, openForProof } from "../../scripts/restore/replay.mjs";

// This proof creates its own labelled target. It never reads source data or calls Clerk.
const target = await createTarget("restore_admin");
try {
  for (const migration of (
    await readdir("packages/database/prisma/migrations")
  ).sort()) {
    if (migration === "migration_lock.toml") continue;
    await target.client.query(
      await readFile(
        `packages/database/prisma/migrations/${migration}/migration.sql`,
        "utf8",
      ),
    );
  }
  const identity = {
    provider: "clerk",
    issuer: "https://restorefixture.clerk.accounts.dev",
    subject: "user_restorefixture",
  };
  const entry = {
    version: 1,
    kind: "DELETE_USER",
    userId: randomUUID(),
    eventId: randomUUID(),
    requestId: randomUUID(),
    recordedAt: new Date().toISOString(),
    providerIdentities: [identity],
  };
  const journal = {
    async *entries() {
      yield entry;
    },
  };
  const calls = [];
  const provider = {
    supportsClerk: true,
    async deleteUser(userId, _signal, identities) {
      calls.push({ userId, identities });
      return false;
    },
  };
  await assert.rejects(
    replayJournal(target, journal, provider),
    /provider reconciliation pending/,
  );
  await assert.rejects(openForProof(target), /Verified replay required/);
  provider.deleteUser = async (userId, _signal, identities) => {
    calls.push({ userId, identities });
    return true;
  };
  assert.equal(await replayJournal(target, journal, provider), 1);
  assert.equal(await replayJournal(target, journal, provider), 0);
  assert.deepEqual(calls, [
    { userId: entry.userId, identities: [identity] },
    { userId: entry.userId, identities: [identity] },
  ]);
  const state = await target.client.query(
    'SELECT state FROM app."ClerkResourceState" WHERE issuer=$1 AND "resourceId"=$2',
    [identity.issuer, identity.subject],
  );
  assert.equal(state.rows[0]?.state, "DELETED");
  const user = await target.client.query(
    'SELECT status FROM app."User" WHERE id=$1',
    [entry.userId],
  );
  assert.equal(user.rows[0]?.status, "DELETED");
  const url = await openForProof(target);
  assert.equal(url.hostname, "127.0.0.1");
  await target.client.query("SET ROLE joint_app_runtime");
  await assert.rejects(
    target.client.query(
      "SELECT * FROM app.resolve_clerk_identity($1,$2,$3,$4,clock_timestamp()+interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp()-interval '1 minute')",
      [
        identity.issuer,
        identity.subject,
        "sess_restorefixture",
        createHash("sha256").update(randomUUID()).digest("hex"),
      ],
    ),
    /Identity unavailable/,
  );
  process.stdout.write(
    "Clerk restore proof passed: pending gate, retry, idempotence, missing-binding tombstone and JIT denial.\n",
  );
} finally {
  await destroyTarget(target);
}
