import { verifyRestoredAllocations } from "./allocation-proof.mjs";
import { verifyRestoredFunding } from "./funding-proof.mjs";
import { verifyRestoredGoals } from "./goal-proof.mjs";
import { Buffer } from "node:buffer";
import { DataVault } from "../../packages/database/dist/data-vault.js";
import { randomUUID } from "node:crypto";
import { createOrm } from "../../packages/database/dist/client.js";
import { ScopedDatabase } from "../../packages/database/dist/scoped-transaction.js";
import { ArchiveDatabase } from "../../packages/database/dist/archive-transaction.js";

function requireProof(value) {
  if (!value) throw new Error("Restored isolation verification failed");
}
export async function verifyRestoredAccess(
  target,
  runtimeUrl,
  fixture,
  recoveryKey,
) {
  const owner = target.client;
  const row = async (query, args) => (await owner.query(query, args)).rows[0];
  requireProof(
    (
      await row('SELECT status FROM app."User" WHERE id=$1', [
        fixture.deleted.userId,
      ])
    )?.status === "DELETED",
  );
  requireProof(
    (
      await row('SELECT status FROM app."User" WHERE id=$1', [
        fixture.absentUserId,
      ])
    )?.status === "DELETED",
  );
  requireProof(
    !(await row('SELECT 1 FROM app."Account" WHERE id=$1', [
      fixture.accounts.sole,
    ])),
  );
  requireProof(
    !(await row('SELECT 1 FROM app."BudgetScope" WHERE id=$1', [
      fixture.scopeId,
    ])),
  );
  requireProof(
    !(await row('SELECT 1 FROM app."Budget" WHERE id=$1', [fixture.budgetId])),
  );
  requireProof(
    !(await row('SELECT 1 FROM app."BudgetLine" WHERE "budgetId"=$1', [
      fixture.budgetId,
    ])),
  );
  requireProof(
    !(await row('SELECT 1 FROM app."TransactionNote" WHERE "authorUserId"=$1', [
      fixture.deleted.userId,
    ])),
  );
  requireProof(
    (
      await row(
        'SELECT "amountMinor"::text AS amount FROM app."Transaction" WHERE id=$1',
        [fixture.jointTransactionId],
      )
    )?.amount === "500",
  );
  requireProof(
    !(await row('SELECT 1 FROM app."BudgetRevision" WHERE "budgetId"=$1', [
      fixture.budgetId,
    ])),
  );
  requireProof(
    !(await row('SELECT 1 FROM app."BudgetScopeAccount" WHERE "scopeId"=$1', [
      fixture.scopeId,
    ])),
  );
  requireProof(
    !(await row('SELECT 1 FROM app."RequestKey" WHERE "userId"=$1', [
      fixture.deleted.userId,
    ])),
  );
  const runtime = createOrm(runtimeUrl.href),
    scoped = new ScopedDatabase(runtime),
    archive = new ArchiveDatabase(runtime);
  async function freshContext(actor, isArchive = false) {
    const sessionId = randomUUID();
    await owner.query(
      'INSERT INTO app."SessionRegistry"(id,"userId","householdId","expiresAt") VALUES($1,$2,$3,clock_timestamp()+interval \'10 minutes\')',
      [sessionId, actor.userId, isArchive ? null : actor.householdId],
    );
    const membership = await row(
      'SELECT "grantVersion" FROM app."Membership" WHERE id=$1',
      [actor.membershipId],
    );
    return {
      ...actor,
      sessionId,
      grantVersion: membership.grantVersion,
      aal: "aal2",
      mfaAuthenticatedAt: Date.now(),
      requestId: randomUUID(),
    };
  }
  let allocationProof;
  let goalProof;
  let fundingProof;
  try {
    fundingProof = await verifyRestoredFunding(
      owner,
      scoped,
      archive,
      freshContext,
      fixture,
    );
    goalProof = await verifyRestoredGoals(
      owner,
      scoped,
      archive,
      freshContext,
      fixture,
    );
    allocationProof = await verifyRestoredAllocations(
      owner,
      scoped,
      archive,
      freshContext,
      fixture,
    );
    const remaining = await freshContext(fixture.remaining);
    const remainingRows = await scoped.withScope(remaining, (tx) =>
      tx.account.findMany({ select: { id: true } }),
    );
    requireProof(remainingRows.length === 2);
    requireProof(
      remainingRows.some((item) => item.id === fixture.accounts.joint),
    );
    requireProof(
      remainingRows.every((item) =>
        [fixture.accounts.joint, fixture.accounts.remaining].includes(item.id),
      ),
    );
    const encrypted = await scoped.withScope(remaining, (tx) =>
      tx.importObject.findUnique({
        where: { batchId: fixture.importBatchId },
        select: { ciphertext: true },
      }),
    );
    requireProof(typeof encrypted?.ciphertext === "string");
    const raw = new DataVault(recoveryKey).open(
      encrypted.ciphertext,
      `import:${remaining.householdId}:${fixture.accounts.remaining}:${fixture.importBatchId}`,
    );
    requireProof(
      Buffer.from(raw).toString() ===
        "date,description,amount\n2026-10-01,Encrypted restore fixture,123.45\n",
    );
    const reconciled = await scoped.withScope(remaining, (tx) =>
      tx.transaction.findUnique({
        where: { id: fixture.encryptedTransactionId },
        select: { amountMinor: true },
      }),
    );
    requireProof(reconciled?.amountMinor.toString() === "12345");
    const notes = await scoped.withScope(remaining, (tx) =>
      tx.transactionNote.findMany({
        where: { transactionId: fixture.jointTransactionId },
        select: { authorUserId: true },
      }),
    );
    requireProof(
      notes.length === 1 && notes[0].authorUserId === fixture.remaining.userId,
    );
    const leaver = await freshContext(fixture.leaver, true);
    const retained = await archive.withScope(leaver, (tx) =>
      tx.account.findMany({ select: { id: true } }),
    );
    requireProof(
      retained.length === 1 && retained[0].id === fixture.accounts.archive,
    );
    const retainedTransactions = await archive.withScope(leaver, (tx) =>
      tx.transaction.findMany({ select: { id: true } }),
    );
    requireProof(
      retainedTransactions.length === 1 &&
        retainedTransactions[0].id === fixture.archiveTransactionId,
    );
    const archiveNotes = await archive.withScope(leaver, (tx) =>
      tx.transactionNote.findMany({ select: { transactionId: true } }),
    );
    requireProof(archiveNotes.length === 0);
    const neighbor = await freshContext(fixture.neighbor);
    const neighborRows = await scoped.withScope(neighbor, (tx) =>
      tx.account.findMany({ select: { id: true } }),
    );
    requireProof(
      neighborRows.length === 1 &&
        neighborRows[0].id === fixture.accounts.neighbor,
    );
    const deleted = {
      ...fixture.deleted,
      aal: "aal2",
      grantVersion: 0,
      mfaAuthenticatedAt: Date.now(),
      requestId: randomUUID(),
    };
    let denied = false;
    try {
      await scoped.withScope(deleted, (tx) => tx.account.count());
    } catch {
      denied = true;
    }
    requireProof(denied);
  } finally {
    await runtime.$disconnect();
  }
  return {
    ...allocationProof,
    ...goalProof,
    ...fundingProof,
    ciphertextRecovered: true,
    absentUserTombstoned: true,
    wholeBudgetScopeRemoved: true,
    jointHistoryRetained: true,
    archiveScopeIsolated: true,
    neighborUnchanged: true,
  };
}
