import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { ArchiveDatabase } from "../packages/database/dist/archive-transaction.js";
import { DataVault } from "../packages/database/dist/data-vault.js";
import { JobsRepository } from "../packages/database/dist/jobs.repository.js";
import { createFixtureOwner } from "./fixtures/database.js";
import { ExportService } from "../apps/api/src/modules/exports/export.service.js";
import { AccountQueries } from "../apps/api/src/modules/accounts/account-queries.js";
import { AccountMutations } from "../apps/api/src/modules/accounts/account-mutations.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { TransactionAnnotations } from "../apps/api/src/modules/transactions/transaction-annotations.js";
import { createExportHandlers } from "../apps/worker/src/handlers/export.handler.js";

it("fences only projected totals, ledger data and the requester's own private notes", async () => {
  if (!process.env.DATABASE_URL)
    throw new Error("Runtime database URL required");
  const owner = createFixtureOwner(),
    runtime = createOrm(process.env.DATABASE_URL);
  const scoped = new ScopedDatabase(runtime),
    key = randomBytes(32).toString("base64");
  const service = new ExportService(
    scoped,
    new ArchiveDatabase(runtime),
    new DataVault(key),
  );
  const accountVault = new IdentityVault(key, key);
  const accounts = new AccountQueries(scoped, accountVault);
  const accountMutations = new AccountMutations(scoped, accountVault);
  const annotations = new TransactionAnnotations(scoped),
    jobs = new JobsRepository(runtime);
  const handler = createExportHandlers(key)["csv.export"];
  const householdId = randomUUID(),
    accountId = randomUUID(),
    txId = randomUUID();
  const actor: AuthContext = {
    userId: randomUUID(),
    membershipId: randomUUID(),
    sessionId: randomUUID(),
    householdId,
    grantVersion: 0,
    aal: "aal2",
    mfaAuthenticatedAt: Date.now() - 1000,
    requestId: randomUUID(),
  };
  const viewer: AuthContext = {
    ...actor,
    userId: randomUUID(),
    membershipId: randomUUID(),
    sessionId: randomUUID(),
  };
  async function request(context = actor) {
    return service.requestExport(
      { ...context, mfaAuthenticatedAt: Date.now() - 1000 },
      { accountIds: [accountId] },
    );
  }
  async function page(id: string) {
    const job = await owner.job.findFirstOrThrow({
      where: { resourceId: id, type: "csv.export", state: "QUEUED" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const lease = await jobs.claim(
      "privacy-fence-test",
      ["csv.export"],
      5000,
      job.id,
    );
    if (!lease || !handler) throw new Error("Missing export lease");
    expect(await jobs.complete(lease, (tx) => handler(lease, tx))).toBe(true);
  }
  async function ready(context = actor) {
    const value = await request(context);
    for (let n = 0; n < 4; n++) {
      if ((await service.status(context, value.id)).state === "READY")
        return value.id;
      await page(value.id);
    }
    throw new Error("Export did not finish in bounded pages");
  }
  async function csv(id: string, context = actor) {
    const parts: string[] = [];
    for await (const chunk of await service.download(
      { ...context, mfaAuthenticatedAt: Date.now() - 1000 },
      id,
    ))
      parts.push(Buffer.from(chunk).toString("utf8"));
    return parts.join("");
  }
  try {
    await owner.household.create({ data: { id: householdId } });
    for (const [index, context] of [actor, viewer].entries())
      await owner.user.create({
        data: {
          id: context.userId,
          memberships: {
            create: { id: context.membershipId, householdId, slot: index + 1 },
          },
          sessions: {
            create: {
              id: context.sessionId,
              householdId,
              expiresAt: new Date(Date.now() + 3600000),
            },
          },
        },
      });
    await owner.account.create({
      data: {
        id: accountId,
        householdId,
        creatorUserId: actor.userId,
        creatorMembershipId: actor.membershipId,
        kind: "CURRENT",
        label: "Projected privacy source",
        owners: {
          create: { userId: actor.userId, membershipId: actor.membershipId },
        },
        grants: {
          create: { membershipId: viewer.membershipId, level: "TRANSACTIONS" },
        },
      },
    });
    await owner.transaction.createMany({
      data: Array.from({ length: 501 }, (_, index) => ({
        id: index === 0 ? txId : randomUUID(),
        householdId,
        accountId,
        sourceNamespace: "MANUAL" as const,
        sourceId: randomUUID(),
        sourceHash: "a".repeat(64),
        fingerprint: "b".repeat(64),
        amountMinor: -100n,
        bookedDate: new Date("2026-10-01"),
        description: "Private ledger source",
      })),
    });
    const ownerReady = await ready();
    const ownerProcessing = await request();
    await page(ownerProcessing.id);
    expect((await service.status(actor, ownerProcessing.id)).state).toBe(
      "PROCESSING",
    );
    async function noteChange(input: {
      note: string | null;
      noteVersion: number;
    }) {
      const viewerReady = await ready(viewer);
      await annotations.annotate(viewer, txId, input, 1);
      expect((await service.status(actor, ownerReady)).state).toBe("READY");
      expect((await service.status(actor, ownerProcessing.id)).state).toBe(
        "PROCESSING",
      );
      expect((await service.status(viewer, viewerReady)).state).toBe(
        "INVALIDATED",
      );
    }
    await noteChange({ note: "Other author's private note", noteVersion: 0 });
    await noteChange({
      note: "Other author's revised private note",
      noteVersion: 1,
    });
    await noteChange({ note: null, noteVersion: 2 });
    const viewerBeforeDelete = await ready(viewer);
    await owner.transactionNote.deleteMany({
      where: { transactionId: txId, authorUserId: viewer.userId },
    });
    expect((await service.status(actor, ownerReady)).state).toBe("READY");
    expect((await service.status(actor, ownerProcessing.id)).state).toBe(
      "PROCESSING",
    );
    expect((await service.status(viewer, viewerBeforeDelete)).state).toBe(
      "INVALIDATED",
    );
    const viewerOwnScope = await ready(viewer);
    await annotations.annotate(
      actor,
      txId,
      { note: "Owner-only note", noteVersion: 0 },
      1,
    );
    expect((await service.status(actor, ownerReady)).state).toBe("INVALIDATED");
    expect((await service.status(actor, ownerProcessing.id)).state).toBe(
      "INVALIDATED",
    );
    expect((await service.status(viewer, viewerOwnScope)).state).toBe("READY");
    expect(await csv(viewerOwnScope, viewer)).not.toContain("Owner-only note");
    await owner.accountGrant.update({
      where: {
        accountId_membershipId: {
          accountId,
          membershipId: viewer.membershipId,
        },
      },
      data: { level: "TOTALS", version: { increment: 1 } },
    });
    const totals = await ready(viewer),
      originalCsv = await csv(totals, viewer);
    expect(originalCsv).not.toContain("Private ledger source");
    expect(originalCsv).not.toContain("Owner-only note");
    expect(originalCsv).not.toContain('""version""');
    const totalsProjection = await accounts.read(viewer, accountId);
    const ownerProjection = await accounts.read(actor, accountId);
    const details = await ready();
    await annotations.annotate(
      actor,
      txId,
      { category: "Groceries", classificationKind: "EXPENSE" },
      1,
    );
    expect((await service.status(viewer, totals)).state).toBe("READY");
    expect(await csv(totals, viewer)).toBe(originalCsv);
    expect((await service.status(actor, details)).state).toBe("INVALIDATED");
    expect((await accounts.read(viewer, accountId)).version).toBe(
      totalsProjection.version,
    );
    expect((await accounts.read(actor, accountId)).version).toBe(
      ownerProjection.version + 1,
    );
    await expect(
      accountMutations.patch(
        actor,
        accountId,
        { label: "Stale owner write", liquidity: "AVAILABLE" },
        ownerProjection.version,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await owner.transaction.create({
      data: {
        householdId,
        accountId,
        sourceNamespace: "MANUAL",
        sourceId: randomUUID(),
        sourceHash: "e".repeat(64),
        fingerprint: "f".repeat(64),
        amountMinor: -200n,
        bookedDate: new Date("2026-10-01"),
        description: "New excluded source transaction",
      },
    });
    expect((await service.status(viewer, totals)).state).toBe("READY");
    expect(await csv(totals, viewer)).toBe(originalCsv);
    expect(await csv(await ready(viewer), viewer)).toBe(originalCsv);
    const ownerDetails = await ready();
    await annotations.annotate(actor, txId, { note: null, noteVersion: 1 }, 2);
    expect((await service.status(viewer, totals)).state).toBe("READY");
    expect((await service.status(actor, ownerDetails)).state).toBe(
      "INVALIDATED",
    );
    expect((await accounts.read(viewer, accountId)).version).toBe(
      totalsProjection.version,
    );
    await expect(
      scoped.withScope(
        actor,
        (tx) =>
          tx.$executeRaw`UPDATE app."Account" SET "totalsVersion"="totalsVersion"+1 WHERE id=${accountId}::uuid`,
      ),
    ).rejects.toBeDefined();
    await expect(
      scoped.withScope(
        actor,
        (tx) =>
          tx.$executeRaw`INSERT INTO app."Account" (id,"householdId","creatorUserId","creatorMembershipId",kind,label,liquidity,"totalsVersion") VALUES (${randomUUID()}::uuid,${householdId}::uuid,${actor.userId}::uuid,${actor.membershipId}::uuid,'CURRENT','Forged projection counter','AVAILABLE',99)`,
      ),
    ).rejects.toBeDefined();
    await owner.balanceSnapshot.create({
      data: {
        householdId,
        accountId,
        authorMembershipId: actor.membershipId,
        amountMinor: 1000n,
        asOfDate: new Date("2026-10-01"),
      },
    });
    expect((await service.status(viewer, totals)).state).toBe("INVALIDATED");
    expect((await accounts.read(viewer, accountId)).version).toBe(
      totalsProjection.version + 1,
    );
    const beforeMetadata = await ready(viewer);
    const ownerBeforeMetadata = await accounts.read(actor, accountId);
    const updatedMetadata = await accountMutations.patch(
      actor,
      accountId,
      { label: "Metadata change", liquidity: "AVAILABLE" },
      ownerBeforeMetadata.version,
    );
    expect(updatedMetadata.version).toBe(ownerBeforeMetadata.version + 1);
    expect((await accounts.read(viewer, accountId)).version).toBe(
      totalsProjection.version + 2,
    );
    expect((await service.status(viewer, beforeMetadata)).state).toBe(
      "INVALIDATED",
    );
    const beforeRevocation = await ready(viewer);
    await owner.accountGrant.update({
      where: {
        accountId_membershipId: {
          accountId,
          membershipId: viewer.membershipId,
        },
      },
      data: { level: "NONE", version: { increment: 1 } },
    });
    await owner.accountGrant.update({
      where: {
        accountId_membershipId: {
          accountId,
          membershipId: viewer.membershipId,
        },
      },
      data: { level: "TOTALS", version: { increment: 1 } },
    });
    expect((await service.status(viewer, beforeRevocation)).state).toBe(
      "INVALIDATED",
    );
    // Prove both orders of the first-note epoch race using observed database
    // blockers, rather than assuming a delay means either statement has run.
    function gate() {
      let resolve: () => void = () => {};
      const promise = new Promise<void>((finish) => {
        resolve = finish;
      });
      return { promise, resolve };
    }
    async function blockedBy(waiter: number, blocker: number) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await owner.$queryRaw<
          { blocked: boolean }[]
        >`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) AS blocked`;
        if (row?.blocked) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("Expected first-note fence lock was not observed");
    }
    async function raceSource() {
      const source = await owner.account.create({
        data: {
          householdId,
          creatorUserId: actor.userId,
          creatorMembershipId: actor.membershipId,
          kind: "CURRENT",
          label: "Concurrent note source",
          owners: {
            create: { userId: actor.userId, membershipId: actor.membershipId },
          },
        },
      });
      const transaction = await owner.transaction.create({
        data: {
          householdId,
          accountId: source.id,
          sourceNamespace: "MANUAL",
          sourceId: randomUUID(),
          sourceHash: "c".repeat(64),
          fingerprint: "d".repeat(64),
          amountMinor: -100n,
          bookedDate: new Date("2026-10-01"),
          description: "Concurrent source",
        },
      });
      return { accountId: source.id, transactionId: transaction.id };
    }
    const before = await raceSource(),
      writerReady = gate(),
      readerReady = gate(),
      releaseWriter = gate();
    let writerPid = 0,
      readerPid = 0;
    const writeFirst = owner.$transaction(async (tx) => {
      const [pid] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      if (!pid) throw new Error("Missing writer backend");
      writerPid = pid.pid;
      await tx.transactionNote.create({
        data: {
          ...before,
          householdId,
          authorUserId: actor.userId,
          authorMembershipId: actor.membershipId,
          body: "First note before capture",
        },
      });
      writerReady.resolve();
      await releaseWriter.promise;
    });
    await Promise.race([writerReady.promise, writeFirst]);
    const captureAfter = scoped.withScope(actor, async (tx) => {
      const [pid] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      if (!pid) throw new Error("Missing reader backend");
      readerPid = pid.pid;
      readerReady.resolve();
      const [row] = await tx.$queryRaw<
        { id: string }[]
      >`SELECT app.request_export(${[before.accountId]}::uuid[],false) AS id`;
      if (!row) throw new Error("Missing concurrent export");
      return row.id;
    });
    await Promise.race([readerReady.promise, captureAfter]);
    try {
      await blockedBy(readerPid, writerPid);
    } finally {
      releaseWriter.resolve();
    }
    const [, capturedAfter] = await Promise.all([writeFirst, captureAfter]);
    expect((await service.status(actor, capturedAfter)).state).toBe("QUEUED");
    await page(capturedAfter);
    expect(await csv(capturedAfter)).toContain("First note before capture");

    const after = await raceSource(),
      capturedReady = gate(),
      nextWriterReady = gate(),
      releaseReader = gate();
    const captureFirst = scoped.withScope(actor, async (tx) => {
      const [pid] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      if (!pid) throw new Error("Missing reader backend");
      readerPid = pid.pid;
      const [row] = await tx.$queryRaw<
        { id: string }[]
      >`SELECT app.request_export(${[after.accountId]}::uuid[],false) AS id`;
      if (!row) throw new Error("Missing concurrent export");
      capturedReady.resolve();
      await releaseReader.promise;
      return row.id;
    });
    await Promise.race([capturedReady.promise, captureFirst]);
    const writeAfter = owner.$transaction(async (tx) => {
      const [pid] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      if (!pid) throw new Error("Missing writer backend");
      writerPid = pid.pid;
      nextWriterReady.resolve();
      await tx.transactionNote.create({
        data: {
          ...after,
          householdId,
          authorUserId: actor.userId,
          authorMembershipId: actor.membershipId,
          body: "First note after capture",
        },
      });
    });
    await Promise.race([nextWriterReady.promise, writeAfter]);
    try {
      await blockedBy(writerPid, readerPid);
    } finally {
      releaseReader.resolve();
    }
    const [capturedBefore] = await Promise.all([captureFirst, writeAfter]);
    expect((await service.status(actor, capturedBefore)).state).toBe(
      "INVALIDATED",
    );
  } finally {
    await owner.$executeRaw`DELETE FROM app."ExportRequest" WHERE "householdId"=${householdId}::uuid`;
    await owner.job.deleteMany({ where: { householdId } });
    await owner.account.deleteMany({ where: { householdId } });
    await owner.household.deleteMany({ where: { id: householdId } });
    const ids = [actor.userId, viewer.userId];
    await owner.sessionRegistry.deleteMany({ where: { userId: { in: ids } } });
    await owner.auditEvent.deleteMany({ where: { userId: { in: ids } } });
    await owner.user.deleteMany({ where: { id: { in: ids } } });
    await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
  }
});
