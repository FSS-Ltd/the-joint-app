import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ArchiveDatabase } from "../packages/database/dist/archive-transaction.js";
import { DataVault } from "../packages/database/dist/data-vault.js";
import { JobsRepository } from "../packages/database/dist/jobs.repository.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { ExportService } from "../apps/api/src/modules/exports/export.service.js";
import { createExportHandlers } from "../apps/worker/src/handlers/export.handler.js";
import { createFixtureOwner, fixtureTimestamp } from "./fixtures/database.js";

const owner = createFixtureOwner();
if (!process.env.DATABASE_URL)
  throw new Error("Export tests require local runtime configuration");
const runtime = createOrm(process.env.DATABASE_URL);
const scoped = new ScopedDatabase(runtime);
const key = randomBytes(32).toString("base64");
const service = new ExportService(
  scoped,
  new ArchiveDatabase(runtime),
  new DataVault(key),
);
const jobs = new JobsRepository(runtime);
const handler = createExportHandlers(key)["csv.export"];
const householdId = randomUUID(),
  accountId = randomUUID();
const actor: AuthContext = {
  userId: randomUUID(),
  membershipId: randomUUID(),
  householdId,
  sessionId: randomUUID(),
  requestId: randomUUID(),
  grantVersion: 0,
  aal: "aal2",
  mfaAuthenticatedAt: Date.now(),
};
const viewer: AuthContext = {
  ...actor,
  userId: randomUUID(),
  membershipId: randomUUID(),
  sessionId: randomUUID(),
};
beforeAll(async () => {
  await owner.household.create({ data: { id: householdId } });
  for (const [index, context] of [actor, viewer].entries()) {
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
  }
  await owner.account.create({
    data: {
      id: accountId,
      householdId,
      creatorUserId: actor.userId,
      creatorMembershipId: actor.membershipId,
      kind: "CURRENT",
      label: "=Synthetic account",
      owners: {
        create: { userId: actor.userId, membershipId: actor.membershipId },
      },
      grants: {
        create: { membershipId: viewer.membershipId, level: "TRANSACTIONS" },
      },
    },
  });
  await owner.balanceSnapshot.create({
    data: {
      householdId,
      accountId,
      authorMembershipId: actor.membershipId,
      amountMinor: 9007199254740993n,
      adultAmountMinor: 700000n,
      asOfDate: new Date("2026-10-01"),
    },
  });
  await owner.transaction.createMany({
    data: Array.from({ length: 501 }, (_, index) => ({
      id: randomUUID(),
      householdId,
      accountId,
      sourceNamespace: "MANUAL",
      sourceId: randomUUID(),
      sourceHash: "a".repeat(64),
      fingerprint: "b".repeat(64),
      amountMinor: BigInt(index === 0 ? "-9007199254740993" : index),
      bookedDate: new Date("2026-10-01"),
      description:
        index === 0 ? '=PRIVATE_SENTINEL_©\nquote"' : `Synthetic ${index}`,
    })),
  });
  const transactions = await owner.transaction.findMany({
    where: { accountId },
    select: { id: true },
  });
  await owner.transactionRevision.createMany({
    data: transactions.map((transaction) => ({
      householdId,
      accountId,
      transactionId: transaction.id,
      actorMembershipId: actor.membershipId,
      kind: "CREATED",
      version: 1,
      data: {
        bookedDate: "2026-10-01",
        money: { amountMinor: "-9007199254740993", currency: "GBP" },
        description: "Original source history",
      },
    })),
  });
  const transaction = await owner.transaction.findFirstOrThrow({
    where: { accountId },
  });
  await owner.transactionNote.createMany({
    data: [actor, viewer].map((context, index) => ({
      householdId,
      accountId,
      transactionId: transaction.id,
      authorUserId: context.userId,
      authorMembershipId: context.membershipId,
      body: index === 0 ? "Own note" : "Other author note sentinel",
    })),
  });
  await owner.transactionRevision.create({
    data: {
      householdId,
      accountId,
      transactionId: transaction.id,
      actorMembershipId: actor.membershipId,
      kind: "TRANSFER_CONFIRM",
      version: 2,
      data: {
        toAccountId: randomUUID(),
        secret: "Hidden counterpart sentinel",
        before: { classificationKind: null },
        after: { classificationKind: "TRANSFER" },
      },
    },
  });
});
afterAll(async () => {
  await runtime.$disconnect();
  await owner.$executeRaw`DELETE FROM app."ExportRequest" WHERE "householdId"=${householdId}::uuid`;
  await owner.transaction.deleteMany({ where: { householdId } });
  await owner.account.deleteMany({ where: { householdId } });
  await owner.job.deleteMany({ where: { householdId } });
  await owner.household.delete({ where: { id: householdId } });
  await owner.sessionRegistry.deleteMany({
    where: { userId: { in: [actor.userId, viewer.userId] } },
  });
  await owner.user.deleteMany({
    where: { id: { in: [actor.userId, viewer.userId] } },
  });
  await owner.$disconnect();
});
async function request(context = actor) {
  return service.requestExport(
    { ...context, mfaAuthenticatedAt: await fixtureTimestamp(owner) },
    { accountIds: [accountId] },
  );
}
async function processExport(id: string) {
  for (let count = 0; count < 20; count++) {
    const [job] = await owner.$queryRaw<
      { id: string }[]
    >`SELECT id FROM app."Job" WHERE "resourceId"=${id}::uuid AND type='csv.export' AND state='QUEUED' ORDER BY "createdAt",id LIMIT 1`;
    if (!job) return;
    const lease = await jobs.claim("export-test", ["csv.export"], 5000, job.id);
    expect(lease).not.toBeNull();
    if (!lease || !handler) throw new Error("Export lease missing");
    expect(await jobs.complete(lease, (tx) => handler(lease, tx))).toBe(true);
  }
  throw new Error("Export processing exceeded bounded test budget");
}
async function text(id: string, context = actor) {
  const chunks = await service.download(
    { ...context, mfaAuthenticatedAt: await fixtureTimestamp(owner) },
    id,
  );
  let result = "";
  for await (const bytes of chunks) result += Buffer.from(bytes).toString();
  return result;
}
it("exports all 501 transactions across bounded encrypted pages, exact amounts and only own notes", async () => {
  const result = await request();
  await processExport(result.id);
  expect((await service.status(actor, result.id)).state).toBe("READY");
  const csv = await text(result.id);
  expect(csv.match(/"TRANSACTION"/g)).toHaveLength(501);
  expect(csv.match(/"REVISION"/g)).toHaveLength(502);
  expect(csv).toContain("Original source history");
  expect(csv).toContain('""after"": {""classificationKind"": ""TRANSFER""}');
  expect(csv).toContain('""effectiveKind"": ""EXPENSE""');
  expect(csv).toContain('"-9007199254740993"');
  expect(csv).toContain('"9007199254740993"');
  expect(csv).toContain("'=PRIVATE_SENTINEL_©");
  expect(csv).toContain("Own note");
  expect(csv).not.toContain("Other author note sentinel");
  expect(csv).not.toContain("Hidden counterpart sentinel");
  const chunks = await owner.$queryRaw<
    { ciphertext: string }[]
  >`SELECT ciphertext FROM app."ExportChunk" WHERE "exportId"=${result.id}::uuid ORDER BY sequence`;
  expect(chunks.length).toBeGreaterThan(1);
  for (const [sequence, chunk] of chunks.entries()) {
    expect(chunk.ciphertext).not.toContain("Synthetic");
    const decoded = Buffer.from(
      new DataVault(key).open(
        chunk.ciphertext,
        `export:${result.id}:chunk:${sequence}`,
      ),
    ).toString();
    expect(
      decoded.match(/"(?:ACCOUNT|BALANCE|TRANSACTION|REVISION|SPLIT|NOTE)"/g)
        ?.length ?? 0,
    ).toBeLessThanOrEqual(500);
  }
});
it("freezes a grant version and never reactivates after revoke then restore", async () => {
  const result = await request(viewer);
  await owner.accountGrant.update({
    where: {
      accountId_membershipId: { accountId, membershipId: viewer.membershipId },
    },
    data: { level: "NONE", version: { increment: 1 } },
  });
  await owner.accountGrant.update({
    where: {
      accountId_membershipId: { accountId, membershipId: viewer.membershipId },
    },
    data: { level: "TRANSACTIONS", version: { increment: 1 } },
  });
  await processExport(result.id);
  expect((await service.status(viewer, result.id)).state).toBe("INVALIDATED");
  await expect(text(result.id, viewer)).rejects.toThrow();
  expect(
    await owner.$queryRaw`SELECT 1 FROM app."ExportChunk" WHERE "exportId"=${result.id}::uuid`,
  ).toEqual([]);
});
it("TOTALS exports include metadata and balances without transaction details", async () => {
  await owner.accountGrant.update({
    where: {
      accountId_membershipId: { accountId, membershipId: viewer.membershipId },
    },
    data: { level: "TOTALS", version: { increment: 1 } },
  });
  const result = await request(viewer);
  await processExport(result.id);
  const csv = await text(result.id, viewer);
  expect(csv).toContain('"ACCOUNT"');
  expect(csv).toContain('"BALANCE"');
  expect(csv).toContain('""adultAmountMinor"": ""700000""');
  expect(csv).not.toContain('"TRANSACTION"');
  expect(csv).not.toContain('"NOTE"');
  expect(csv).not.toContain("PRIVATE_SENTINEL");
});
it("stops an open stream on source revocation and rejects resumed requests", async () => {
  await owner.accountGrant.update({
    where: {
      accountId_membershipId: { accountId, membershipId: viewer.membershipId },
    },
    data: { level: "TRANSACTIONS", version: { increment: 1 } },
  });
  const result = await request(viewer);
  await processExport(result.id);
  const stream = await service.download(viewer, result.id);
  expect((await stream.next()).done).toBe(false);
  await owner.accountGrant.update({
    where: {
      accountId_membershipId: { accountId, membershipId: viewer.membershipId },
    },
    data: { level: "NONE", version: { increment: 1 } },
  });
  expect(
    await stream.next().then(
      () => false,
      () => true,
    ),
  ).toBe(true);
  await expect(
    service.download(viewer, result.id, "bytes=1-"),
  ).rejects.toThrow();
});
it("binds download to the requesting live session and rejects expired objects and Range", async () => {
  const result = await request();
  await processExport(result.id);
  const sessionId = randomUUID();
  await owner.sessionRegistry.create({
    data: {
      id: sessionId,
      userId: actor.userId,
      householdId,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await expect(
    service.download({ ...actor, sessionId }, result.id),
  ).rejects.toThrow();
  await expect(
    service.download(actor, result.id, "bytes=0-1"),
  ).rejects.toMatchObject({ status: 416 });
  await owner.$executeRaw`UPDATE app."ExportRequest" SET "downloadExpiresAt"=clock_timestamp()-interval '1 second' WHERE id=${result.id}::uuid`;
  await expect(text(result.id)).rejects.toThrow();
  await owner.$executeRaw`UPDATE app."ExportRequest" SET "expiresAt"=clock_timestamp()-interval '1 second' WHERE id=${result.id}::uuid`;
  expect((await service.status(actor, result.id)).state).toBe("EXPIRED");
  await runtime.$queryRaw`SELECT app.expire_export_objects()`;
  expect(
    await owner.$queryRaw`SELECT 1 FROM app."ExportChunk" WHERE "exportId"=${result.id}::uuid`,
  ).toEqual([]);
});
it("rejects stale or future MFA and direct runtime table or internal function access", async () => {
  for (const timestamp of [Date.now() - 300001, Date.now() + 60000])
    await expect(
      service.requestExport(
        { ...actor, mfaAuthenticatedAt: timestamp },
        { accountIds: [accountId] },
      ),
    ).rejects.toThrow();
  await expect(
    runtime.$queryRaw`SELECT * FROM app."ExportChunk"`,
  ).rejects.toThrow();
  await expect(
    runtime.$queryRaw`SELECT * FROM app.export_records(${randomUUID()}::uuid,'')`,
  ).rejects.toThrow();
  await expect(
    runtime.$queryRaw`SELECT * FROM app.export_job_page(${randomUUID()}::uuid,${randomUUID()}::uuid)`,
  ).rejects.toThrow();
});
it("rechecks before the first byte and never revives after session revoke then restore", async () => {
  const result = await request();
  await processExport(result.id);
  const stream = await service.download(actor, result.id);
  await owner.sessionRegistry.update({
    where: { id: actor.sessionId },
    data: { revokedAt: new Date() },
  });
  await owner.sessionRegistry.update({
    where: { id: actor.sessionId },
    data: { revokedAt: null },
  });
  expect(
    await stream.next().then(
      () => false,
      () => true,
    ),
  ).toBe(true);
  expect((await service.status(actor, result.id)).state).toBe("INVALIDATED");
});
it("cancels on socket abort without yielding a buffered first chunk", async () => {
  const result = await request();
  await processExport(result.id);
  const controller = new AbortController();
  const stream = await service.download(
    actor,
    result.id,
    undefined,
    controller.signal,
  );
  controller.abort();
  expect((await stream.next()).done).toBe(true);
});
it("rejects an inaccessible source atomically with a uniform unavailable response", async () => {
  const before = await owner.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*) FROM app."ExportRequest" WHERE "userId"=${actor.userId}::uuid`;
  await expect(
    service.requestExport(actor, { accountIds: [accountId, randomUUID()] }),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    await owner.$queryRaw`SELECT count(*) FROM app."ExportRequest" WHERE "userId"=${actor.userId}::uuid`,
  ).toEqual(before);
});
it("invalidates the complete object when one selected source is deleted", async () => {
  const secondId = randomUUID();
  await owner.account.create({
    data: {
      id: secondId,
      householdId,
      creatorUserId: actor.userId,
      creatorMembershipId: actor.membershipId,
      kind: "SAVINGS",
      label: "Synthetic deleted source",
      owners: {
        create: { userId: actor.userId, membershipId: actor.membershipId },
      },
    },
  });
  const result = await service.requestExport(actor, {
    accountIds: [accountId, secondId],
  });
  await processExport(result.id);
  await owner.account.delete({ where: { id: secondId } });
  expect((await service.status(actor, result.id)).state).toBe("INVALIDATED");
  await expect(text(result.id)).rejects.toThrow();
});
it("rejects stale leases and exposes an exhausted job as failed", async () => {
  const result = await request();
  const [job] = await owner.$queryRaw<
    { id: string }[]
  >`SELECT id FROM app."Job" WHERE "resourceId"=${result.id}::uuid`;
  if (!job || !handler) throw new Error("Export job missing");
  const stale = await jobs.claim(
    "stale-export-test",
    ["csv.export"],
    5000,
    job.id,
  );
  if (!stale) throw new Error("Export lease missing");
  await owner.job.update({
    where: { id: job.id },
    data: { leaseUntil: new Date(Date.now() - 1000) },
  });
  const next = await jobs.claim(
    "fresh-export-test",
    ["csv.export"],
    5000,
    job.id,
  );
  if (!next) throw new Error("Export retry lease missing");
  expect(await jobs.complete(stale, (tx) => handler(stale, tx))).toBe(false);
  await owner.job.update({
    where: { id: job.id },
    data: {
      state: "FAILED",
      leaseToken: null,
      leaseUntil: null,
      leaseOwner: null,
    },
  });
  expect((await service.status(actor, result.id)).state).toBe("FAILED");
});
it("includes valid nil UUID source and revision records without initial-cursor truncation", async () => {
  const nil = "00000000-0000-0000-0000-000000000000";
  await owner.transaction.create({
    data: {
      id: nil,
      householdId,
      accountId,
      sourceNamespace: "MANUAL",
      sourceId: randomUUID(),
      sourceHash: "e".repeat(64),
      fingerprint: "f".repeat(64),
      amountMinor: 1n,
      bookedDate: new Date("2026-10-01"),
      description: "Synthetic nil source",
    },
  });
  await owner.transactionRevision.create({
    data: {
      id: nil,
      householdId,
      accountId,
      transactionId: nil,
      actorMembershipId: actor.membershipId,
      kind: "CREATED",
      version: 1,
      data: { description: "Synthetic nil history" },
    },
  });
  try {
    const result = await request();
    await processExport(result.id);
    const output = await text(result.id);
    expect(output).toContain("Synthetic nil source");
    expect(output).toContain("Synthetic nil history");
  } finally {
    await owner.transaction.delete({ where: { id: nil } });
  }
});
it("rejects an MFA proof that expires between streamed chunks instead of truncating CSV", async () => {
  const result = await request();
  await processExport(result.id);
  const context = {
    ...actor,
    mfaAuthenticatedAt: await fixtureTimestamp(owner),
  };
  const stream = await service.download(context, result.id);
  expect((await stream.next()).done).toBe(false);
  context.mfaAuthenticatedAt = (await fixtureTimestamp(owner)) - 300001;
  await expect(stream.next()).rejects.toThrow();
  expect((await service.status(actor, result.id)).state).toBe("READY");
});
it("rejects a missing stored chunk instead of returning successful partial CSV", async () => {
  const result = await request();
  await processExport(result.id);
  const stream = await service.download(actor, result.id);
  expect((await stream.next()).done).toBe(false);
  await owner.exportChunk.delete({
    where: { exportId_sequence: { exportId: result.id, sequence: 1 } },
  });
  await expect(stream.next()).rejects.toThrow();
});
it("archive exports require recorded archived ownership, never a former grant", async () => {
  await owner.accountOwner.update({
    where: { accountId_userId: { accountId, userId: actor.userId } },
    data: { status: "ARCHIVED" },
  });
  await owner.membership.updateMany({
    where: { householdId },
    data: { status: "LEFT", slot: null },
  });
  await owner.sessionRegistry.updateMany({
    where: { userId: { in: [actor.userId, viewer.userId] } },
    data: { householdId: null },
  });
  const context = {
    userId: actor.userId,
    sessionId: actor.sessionId,
    aal: "aal2" as const,
    mfaAuthenticatedAt: await fixtureTimestamp(owner),
    requestId: randomUUID(),
  };
  const result = await service.requestArchiveExport(context, {
    accountIds: [accountId],
  });
  await processExport(result.id);
  expect((await service.archiveStatus(context, result.id)).state).toBe("READY");
  const stream = await service.downloadArchive(context, result.id);
  let output = "";
  for await (const chunk of stream) output += Buffer.from(chunk).toString();
  expect(output.match(/"TRANSACTION"/g)).toHaveLength(501);
  expect(output).not.toContain("Other author note sentinel");
  expect(output).toContain('""adultAmountMinor"": ""700000""');
  await expect(
    service.requestArchiveExport(
      { ...context, userId: viewer.userId, sessionId: viewer.sessionId },
      { accountIds: [accountId] },
    ),
  ).rejects.toThrow();
});
