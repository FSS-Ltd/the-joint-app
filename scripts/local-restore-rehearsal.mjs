import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { PrivacyJournal } from "../packages/database/dist/privacy-journal.js";
import {
  clientFor,
  createTarget,
  destroyTarget,
  dumpApp,
  localDatabase,
  restoreApp,
  sourceContainer,
} from "./restore/containers.mjs";
import { seedRestoreFixture, fixtureIntents } from "./restore/fixtures.mjs";
import { createAuthMirror } from "./restore/auth-mirror.mjs";
import { replayJournal, openForProof } from "./restore/replay.mjs";
import { verifyRestoredAccess } from "./restore/proof.mjs";

const sourceState = async (client) =>
  (
    await client.query(
      "SELECT current_setting('default_transaction_read_only') AS read_only,(SELECT jsonb_build_object('login',rolcanlogin,'superuser',rolsuper,'bypass',rolbypassrls) FROM pg_roles WHERE rolname='joint_app_runtime') AS runtime",
    )
  ).rows[0];
async function step(code, apply) {
  try {
    return await apply();
  } catch (error) {
    const sqlCode =
      typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
        ? `_${error.code}`
        : "";
    const field = [
      "currency",
      "updatedAt",
      "version",
      "id",
      "slot",
      "kind",
      "status",
      "amountMinor",
    ].includes(error?.column)
      ? `_${error.column.toUpperCase()}`
      : "";
    const check = [
      "Membership_active_slot",
      "SessionRegistry_token_storage",
      "Account_valid_fields",
      "Transaction_valid_source",
      "scope_hash",
      "budget_fields",
      "budget_line_fields",
    ].includes(error?.constraint)
      ? `_${error.constraint.toUpperCase()}`
      : "";
    throw new Error(`${code}${sqlCode}${field}${check}`, { cause: error });
  }
}
async function main() {
  const sourceUrl = localDatabase(
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
  );
  if (!process.env.PRIVACY_JOURNAL_PATH)
    throw new Error("Independent privacy journal required");
  const source = await sourceContainer(sourceUrl),
    development = clientFor(sourceUrl),
    targets = [],
    directories = [];
  let provider,
    cleanup = true,
    result,
    failure;
  try {
    await development.connect();
    await development.query("SET default_transaction_read_only=on");
    const before = await sourceState(development);
    if (before.read_only !== "on")
      throw new Error("RESTORE_SOURCE_READ_ONLY_REQUIRED");
    const backupDirectory = await mkdtemp(
      join(tmpdir(), "joint-restore-backup-"),
    );
    directories.push(backupDirectory);
    await chmod(backupDirectory, 0o700);
    const journalDirectory = await mkdtemp(
      join(tmpdir(), "joint-restore-ledger-"),
    );
    directories.push(journalDirectory);
    await chmod(journalDirectory, 0o700);
    const initial = join(backupDirectory, "development.dump"),
      snapshot = join(backupDirectory, "synthetic-snapshot.dump");
    await step("RESTORE_SOURCE_DUMP", () => dumpApp(source, initial));
    const clone = await createTarget(decodeURIComponent(sourceUrl.username));
    targets.push(clone);
    await step("RESTORE_BASE_COPY", () => restoreApp(clone, initial));
    const recoveryKey = randomBytes(32).toString("base64");
    const fixture = await step("RESTORE_SYNTHETIC_FIXTURE", () =>
      seedRestoreFixture(clone.client, recoveryKey),
    );
    await step("RESTORE_SYNTHETIC_DUMP", () => dumpApp(clone, snapshot));
    const target = await createTarget(decodeURIComponent(sourceUrl.username));
    targets.push(target);
    await step("RESTORE_SYNTHETIC_COPY", () => restoreApp(target, snapshot));
    await target.client.query(
      'UPDATE app."SessionRegistry" SET "revokedAt"=coalesce("revokedAt",clock_timestamp()),"providerTokens"=NULL,"providerExpiresAt"=NULL',
    );
    const role = await target.client.query(
      "SELECT rolcanlogin FROM pg_roles WHERE rolname='joint_app_runtime'",
    );
    if (role.rows[0]?.rolcanlogin !== false)
      throw new Error("Runtime opened before replay");
    const journalPath = join(journalDirectory, "independent.ndjson");
    await writeFile(journalPath, "", { flag: "wx", mode: 0o600 });
    const journal = new PrivacyJournal(journalPath),
      external = new PrivacyJournal(process.env.PRIVACY_JOURNAL_PATH);
    for await (const entry of external.entries()) await journal.append(entry);
    // These verified synthetic intents are deliberately later than the backup.
    for (const entry of fixtureIntents(fixture)) await journal.append(entry);
    const users = (
      await target.client.query('SELECT id FROM app."User"')
    ).rows.map((item) => item.id);
    provider = await createAuthMirror(users);
    // Neither a missing journal nor a provider failure may open application access.
    let missingClosed = false;
    try {
      await replayJournal(
        target,
        new PrivacyJournal(join(journalDirectory, "missing.ndjson")),
        provider,
      );
    } catch {
      missingClosed = true;
    }
    if (!missingClosed) throw new Error("Missing journal accepted");
    const corruptPath = join(journalDirectory, "corrupt.ndjson");
    await writeFile(corruptPath, '{"secret":"RESTORE_SECRET_SENTINEL"}', {
      flag: "wx",
      mode: 0o600,
    });
    let corruptClosed = false;
    try {
      await replayJournal(target, new PrivacyJournal(corruptPath), provider);
    } catch {
      corruptClosed = true;
    }
    if (!corruptClosed) throw new Error("Corrupt journal accepted");
    provider.failNext();
    let providerClosed = false;
    try {
      await step("RESTORE_JOURNAL_REPLAY", () =>
        replayJournal(target, journal, provider),
      );
    } catch {
      providerClosed = true;
    }
    const closed = await target.client.query(
      "SELECT r.rolcanlogin,g.state FROM pg_roles r CROSS JOIN public.restore_gate g WHERE r.rolname='joint_app_runtime'",
    );
    if (
      !providerClosed ||
      closed.rows[0]?.rolcanlogin !== false ||
      closed.rows[0]?.state !== "CLOSED"
    )
      throw new Error("Provider failure opened restore");
    const replayed = await step("RESTORE_JOURNAL_REPLAY", () =>
      replayJournal(target, journal, provider),
    );
    const repeated = await step("RESTORE_JOURNAL_REPLAY", () =>
      replayJournal(target, journal, provider),
    );
    if (
      repeated !== 0 ||
      provider.has(fixture.deleted.userId) ||
      provider.has(fixture.absentUserId)
    )
      throw new Error("Restore replay verification failed");
    const runtimeUrl = await step("RESTORE_ACCESS_GATE", () =>
      openForProof(target),
    );
    const proof = await step("RESTORE_SCOPE_PROOF", () =>
      verifyRestoredAccess(target, runtimeUrl, fixture, recoveryKey),
    );
    const after = await sourceState(development);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error("Development runtime changed during rehearsal");
    result = {
      result: "PASS",
      runtimeClosedBeforeReplay: true,
      failurePathsClosed: true,
      staleSessionsRevoked: true,
      canonicalPurge: true,
      ...proof,
      idempotentReplay: true,
      providerMode: "ISOLATED_SYNTHETIC_MIRROR",
      developmentUnchanged: true,
      replayedIntents: replayed,
    };
  } catch (error) {
    failure = error;
  } finally {
    await provider?.close().catch(() => {
      cleanup = false;
    });
    for (const target of targets.reverse())
      await destroyTarget(target).catch(() => {
        cleanup = false;
      });
    await development.end().catch(() => {
      cleanup = false;
    });
    for (const directory of directories)
      await rm(directory, { recursive: true }).catch(() => {
        cleanup = false;
      });
  }
  if (!cleanup) throw new Error("RESTORE_CLEANUP_PENDING", { cause: failure });
  if (failure !== undefined) throw failure;
  return { ...result, cleanup };
}
main()
  .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error) => {
    const code =
      error instanceof Error && /^RESTORE_[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "RESTORE_UNAVAILABLE";
    process.stderr.write(`${code}\n`);
    process.stderr.write(
      "Local restore rehearsal unavailable; application access remains closed. Check local configuration, journal, migrations, and owned test resource cleanup.\n",
    );
    process.exitCode = 1;
  });
