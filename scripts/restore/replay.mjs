import { URL } from "node:url";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { assertTarget } from "./containers.mjs";

async function closed(target) {
  await assertTarget(target);
  const { rows } = await target.client.query(
    "SELECT rolcanlogin FROM pg_roles WHERE rolname='joint_app_runtime'",
  );
  const gate = await target.client.query(
    "SELECT state FROM public.restore_gate",
  );
  if (rows[0]?.rolcanlogin !== false || gate.rows[0]?.state !== "CLOSED")
    throw new Error("Restore replay requires closed application access");
}

export async function replayJournal(target, journal, provider) {
  await closed(target);
  await target.client.query("UPDATE public.restore_gate SET verified=false");
  let count = 0;
  // Validate a complete independent snapshot before applying the first intent.
  const entries = [];
  for await (const entry of journal.entries()) entries.push(entry);
  for (const entry of entries) {
    const digest = createHash("sha256")
      .update(JSON.stringify(entry))
      .digest("hex");
    const { rows: prior } = await target.client.query(
      'SELECT digest FROM public.restore_receipt WHERE "eventId"=$1',
      [entry.eventId],
    );
    if (prior.length) {
      if (prior[0].digest !== digest)
        throw new Error("Conflicting restore intent");
      continue;
    }
    if (entry.kind === "DELETE_USER")
      await replayDeletion(target.client, entry, provider);
    else await replayLeave(target.client, entry);
    await target.client.query(
      'INSERT INTO public.restore_receipt("eventId",digest) VALUES($1,$2)',
      [entry.eventId, digest],
    );
    count++;
  }
  await target.client.query("UPDATE public.restore_gate SET verified=true");
  return count;
}
async function replayLeave(client, entry) {
  await client.query("BEGIN");
  try {
    const { rows } = await client.query(
      'SELECT m.id FROM app."Membership" m WHERE m."userId"=$1 AND m."householdId"=$2 AND m.status=\'ACTIVE\' FOR UPDATE',
      [entry.userId, entry.householdId],
    );
    if (rows[0])
      await client.query(
        "SELECT app.exit_household_member($1::uuid,$2::uuid,$3::uuid)",
        [entry.userId, entry.householdId, rows[0].id],
      );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
async function replayDeletion(client, entry, provider) {
  if (entry.providerIdentities?.length && !provider.supportsClerk)
    throw new Error("Clerk restore reconciliation unavailable");
  let requestId, leaseToken;
  await client.query("BEGIN");
  try {
    await client.query(
      "INSERT INTO app.\"User\"(id,status) VALUES($1,'DISABLED') ON CONFLICT(id) DO UPDATE SET status='DISABLED'",
      [entry.userId],
    );
    for (const identity of entry.providerIdentities ?? []) {
      // The journal may be newer than the backup, including its identity mapping.
      // Keep a terminal provider tombstone even when no binding existed in that backup.
      const eventId = `restore_${entry.eventId.replaceAll("-", "")}_${createHash(
        "sha256",
      )
        .update(identity.issuer + identity.subject)
        .digest("hex")
        .slice(0, 24)}`;
      await client.query(
        "SELECT app.apply_clerk_webhook($1,$2,$3,'user.deleted',$4,$4,$5::timestamptz,'DELETED')",
        [
          identity.issuer,
          eventId,
          createHash("sha256").update(JSON.stringify(entry)).digest("hex"),
          identity.subject,
          entry.recordedAt,
        ],
      );
    }
    const { rows: members } = await client.query(
      'SELECT id,"householdId" FROM app."Membership" WHERE "userId"=$1 AND status=\'ACTIVE\' ORDER BY "householdId" FOR UPDATE',
      [entry.userId],
    );
    for (const member of members)
      await client.query(
        "SELECT app.exit_household_member($1::uuid,$2::uuid,$3::uuid)",
        [entry.userId, member.householdId, member.id],
      );
    const { rows } = await client.query(
      'INSERT INTO app."DeletionRequest"(id,"userId","statusTokenHash","statusExpiresAt") VALUES($1,$2,$3,clock_timestamp()+interval \'1 day\') ON CONFLICT("userId") DO UPDATE SET state=\'PENDING\',"leaseToken"=NULL,"leaseUntil"=NULL,"completedAt"=NULL,"providerDeletedAt"=NULL RETURNING id',
      [entry.requestId, entry.userId, randomBytes(32).toString("hex")],
    );
    requestId = rows[0].id;
    leaseToken = randomUUID();
    await client.query(
      'UPDATE app."DeletionRequest" SET "leaseToken"=$2,"leaseUntil"=clock_timestamp()+interval \'30 seconds\' WHERE id=$1',
      [requestId, leaseToken],
    );
    await client.query("SELECT app.purge_deletion_request($1::uuid,$2::uuid)", [
      requestId,
      leaseToken,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  if (
    !(await provider.deleteUser(
      entry.userId,
      undefined,
      entry.providerIdentities,
    ))
  )
    throw new Error("Restore provider reconciliation pending");
  await client.query(
    "SELECT app.finish_deletion_request($1::uuid,$2::uuid,true)",
    [requestId, leaseToken],
  );
}

export async function openForProof(target) {
  await closed(target);
  const { rows } = await target.client.query(
    "SELECT verified FROM public.restore_gate",
  );
  if (rows[0]?.verified !== true)
    throw new Error("Verified replay required before login");
  const password = randomBytes(32).toString("base64url");
  // The generated base64url alphabet is safe for PostgreSQL role DDL. It is never logged.
  await target.client.query(
    `ALTER ROLE joint_app_runtime LOGIN PASSWORD '${password}'`,
  );
  await target.client.query("UPDATE public.restore_gate SET state='OPEN'");
  const url = new URL(target.url);
  url.username = "joint_app_runtime";
  url.password = password;
  return url;
}
