import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { normalizedCsvRowSchema } from "../packages/contracts/dist/index.js";
import type {
  AuthContext,
  CsvMapping,
} from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { DataVault } from "../packages/database/dist/data-vault.js";
import {
  JobsRepository,
  type JobLease,
} from "../packages/database/dist/jobs.repository.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { createImportHandlers } from "../apps/worker/src/imports/handlers.js";
import { maintainImports } from "../apps/worker/src/import-maintenance.js";
import { createFixtureOwner } from "./fixtures/database.js";

const owner = createFixtureOwner();
if (!process.env.DATABASE_URL)
  throw new Error("Import tests require local runtime configuration");
const runtime = createOrm(process.env.DATABASE_URL);
const scoped = new ScopedDatabase(runtime);
const jobs = new JobsRepository(runtime);
const key = randomBytes(32).toString("base64");
const vault = new DataVault(key);
const handlers = createImportHandlers(key);
const householdId = randomUUID();
const accountId = randomUUID();
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
const mapping: CsvMapping = {
  date: 0,
  description: 1,
  amount: 2,
  debit: null,
  credit: null,
  currency: null,
  sourceId: null,
  dateFormat: "ISO",
  decimalSeparator: "DOT",
  amountMode: "SIGNED",
  positiveIs: "INFLOW",
};
beforeAll(async () => {
  await owner.household.create({ data: { id: householdId } });
  await owner.user.create({
    data: {
      id: actor.userId,
      memberships: { create: { id: actor.membershipId, householdId, slot: 1 } },
      sessions: {
        create: {
          id: actor.sessionId,
          householdId,
          expiresAt: new Date(Date.now() + 60 * 60_000),
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
      label: "Synthetic worker account",
      owners: {
        create: { userId: actor.userId, membershipId: actor.membershipId },
      },
    },
  });
});
afterAll(async () => {
  await runtime.$disconnect();
  await owner.transaction.deleteMany({ where: { householdId } });
  await owner.importBatch.deleteMany({ where: { householdId } });
  await owner.account.deleteMany({ where: { householdId } });
  await owner.household.delete({ where: { id: householdId } });
  await owner.user.delete({ where: { id: actor.userId } });
  await owner.$disconnect();
});
async function batchFor(
  csv: string,
  suppliedMapping = mapping,
): Promise<{ batchId: string; jobId: string }> {
  const batchId = randomUUID();
  const fileChecksum = createHash("sha256").update(csv).digest("hex");
  await owner.importBatch.create({
    data: {
      id: batchId,
      householdId,
      accountId,
      requestedByUserId: actor.userId,
      requestedByMembershipId: actor.membershipId,
      fileChecksum,
      mappingHash: createHash("sha256")
        .update(JSON.stringify(suppliedMapping))
        .digest("hex"),
      mapping: suppliedMapping,
      parserVersion: "1",
      previewExpiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      object: {
        create: {
          ciphertext: vault.seal(
            Buffer.from(csv),
            `import:${householdId}:${accountId}:${batchId}`,
          ),
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        },
      },
    },
  });
  const job = await jobs.enqueue({
    householdId,
    type: "csv.preview",
    resourceId: batchId,
    idempotencyKey: randomUUID(),
    payload: {},
  });
  return { batchId, jobId: job.id };
}
async function leaseFor(jobId: string, type: string): Promise<JobLease> {
  const lease = await jobs.claim(
    "synthetic-import-worker",
    [type],
    5000,
    jobId,
  );
  if (!lease) throw new Error("Expected live import lease");
  return lease;
}
async function execute(jobId: string, type: string): Promise<void> {
  const lease = await leaseFor(jobId, type);
  const handler = handlers[type];
  if (!handler) throw new Error("Missing import handler");
  const started = performance.now();
  try {
    expect(await jobs.complete(lease, (tx) => handler(lease, tx))).toBe(true);
  } catch (error) {
    throw new Error(
      `Synthetic ${type} verification failed after ${Math.round(performance.now() - started)}ms`,
      { cause: error },
    );
  }
}
async function beginCommit(batchId: string): Promise<string> {
  await owner.importBatch.update({
    where: { id: batchId },
    data: {
      state: "COMMITTING",
      processedRows: 0,
      committedRows: 0,
      skippedRows: 0,
    },
  });
  return (
    await jobs.enqueue({
      householdId,
      type: "csv.commit",
      resourceId: batchId,
      idempotencyKey: `${batchId}:commit:0`,
      payload: { offset: 0 },
    })
  ).id;
}
async function continuation(batchId: string): Promise<string> {
  return (
    await owner.job.findFirstOrThrow({
      where: { resourceId: batchId, type: "csv.commit", state: "QUEUED" },
      orderBy: { createdAt: "asc" },
    })
  ).id;
}
async function visibleCount(batchId: string): Promise<number> {
  return scoped.withScope(actor, (tx) =>
    tx.transaction.count({ where: { originImportBatchId: batchId } }),
  );
}

it("fences failed and stale chunks, keeps staged rows invisible and publishes equal legitimate purchases once", async () => {
  const csv = `date,description,amount\n${Array.from({ length: 1001 }, () => "2026-01-02,Synthetic equal purchase,-1.25").join("\n")}`;
  const { batchId, jobId } = await batchFor(csv);
  await execute(jobId, "csv.preview");
  const preview = await owner.importBatch.findUniqueOrThrow({
    where: { id: batchId },
  });
  expect(preview.state).toBe("READY");
  expect(preview.validRows).toBe(1001);
  expect(preview.duplicateRows).toBe(0);
  const firstJob = await beginCommit(batchId);
  const crashed = await leaseFor(firstJob, "csv.commit");
  const handler = handlers["csv.commit"];
  if (!handler) throw new Error("Missing import handler");
  await expect(
    jobs.complete(crashed, async (tx) => {
      await handler(crashed, tx);
      throw new Error("Synthetic crash before commit");
    }),
  ).rejects.toThrow("Synthetic crash");
  expect(
    await owner.transaction.count({ where: { originImportBatchId: batchId } }),
  ).toBe(0);
  expect(
    (await owner.importBatch.findUniqueOrThrow({ where: { id: batchId } }))
      .processedRows,
  ).toBe(0);
  expect(await jobs.fail(crashed, 0)).toBe(true);
  await execute(firstJob, "csv.commit");
  expect(
    await jobs.complete(crashed, async () => {
      throw new Error("Stale worker must not run");
    }),
  ).toBe(false);
  expect(
    await owner.transaction.count({ where: { originImportBatchId: batchId } }),
  ).toBe(500);
  expect(await visibleCount(batchId)).toBe(0);
  await execute(await continuation(batchId), "csv.commit");
  expect(await visibleCount(batchId)).toBe(0);
  await execute(await continuation(batchId), "csv.commit");
  expect(await visibleCount(batchId)).toBe(1001);
  expect(
    await owner.transactionRevision.count({
      where: { transaction: { originImportBatchId: batchId } },
    }),
  ).toBe(1001);
  expect(
    (await owner.importBatch.findUniqueOrThrow({ where: { id: batchId } }))
      .committedRows,
  ).toBe(1001);
  expect(
    await owner.outboxEvent.count({
      where: {
        type: "csv.committed",
        payload: { path: ["batchId"], equals: batchId },
      },
    }),
  ).toBe(1);
}, 60_000);

it("restores the same rows without extending original retention, and honours early deletion", async () => {
  const { batchId, jobId } = await batchFor(
    "date,description,amount\n2026-02-03,Synthetic restore,12.34",
  );
  await execute(jobId, "csv.preview");
  await execute(await beginCommit(batchId), "csv.commit");
  const original = await owner.importObject.findUniqueOrThrow({
    where: { batchId },
  });
  const row = await owner.transaction.findFirstOrThrow({
    where: { originImportBatchId: batchId },
  });
  await owner.importBatch.update({
    where: { id: batchId },
    data: { state: "ROLLED_BACK", rolledBackAt: new Date() },
  });
  expect(await visibleCount(batchId)).toBe(0);
  await owner.importObject.update({
    where: { batchId },
    data: { ciphertext: null, deletedAt: new Date() },
  });
  const restore = await jobs.enqueue({
    householdId,
    type: "csv.restore",
    resourceId: batchId,
    idempotencyKey: randomUUID(),
    payload: {},
  });
  await execute(restore.id, "csv.restore");
  expect(await visibleCount(batchId)).toBe(1);
  expect(
    (
      await owner.transaction.findFirstOrThrow({
        where: { originImportBatchId: batchId },
      })
    ).id,
  ).toBe(row.id);
  expect(
    await owner.transactionRevision.count({ where: { transactionId: row.id } }),
  ).toBe(1);
  const restored = await owner.importObject.findUniqueOrThrow({
    where: { batchId },
  });
  expect(restored.expiresAt).toEqual(original.expiresAt);
  expect(restored.ciphertext).toBeNull();
  expect(
    await owner.auditEvent.count({
      where: { householdId, action: "IMPORT_RESTORED" },
    }),
  ).toBe(1);
  expect(
    await owner.outboxEvent.count({
      where: {
        type: "csv.restored",
        payload: { path: ["batchId"], equals: batchId },
      },
    }),
  ).toBe(1);
});

it("revalidates live ownership per chunk and reconciles exhausted jobs without exposing their error", async () => {
  const { batchId, jobId } = await batchFor(
    "date,description,amount\n2026-03-04,Synthetic revoke,1.00",
  );
  await execute(jobId, "csv.preview");
  const commitId = await beginCommit(batchId);
  await owner.job.update({ where: { id: commitId }, data: { maxAttempts: 1 } });
  await owner.accountOwner.update({
    where: { accountId_userId: { accountId, userId: actor.userId } },
    data: { status: "ARCHIVED" },
  });
  const lease = await leaseFor(commitId, "csv.commit");
  try {
    const handler = handlers["csv.commit"];
    if (!handler) throw new Error("Missing import handler");
    await expect(
      jobs.complete(lease, (tx) => handler(lease, tx)),
    ).rejects.toThrow();
    expect(await jobs.fail(lease, 0)).toBe(true);
    await maintainImports(runtime);
    const batch = await owner.importBatch.findUniqueOrThrow({
      where: { id: batchId },
    });
    expect(batch.state).toBe("FAILED");
    expect(batch.failureCode).toMatch(/^[A-Z_]+$/);
    expect(
      await owner.transaction.count({
        where: { originImportBatchId: batchId },
      }),
    ).toBe(0);
  } finally {
    await owner.accountOwner.update({
      where: { accountId_userId: { accountId, userId: actor.userId } },
      data: { status: "ACTIVE" },
    });
  }
});

it("processes the full 50,000-row path in fenced 500-row chunks without early publication", async () => {
  const started = performance.now();
  const csv = `date,description,amount\n${Array.from({ length: 50_000 }, (_, index) => `2026-04-05,Synthetic capacity ${index},-0.01`).join("\n")}`;
  const { batchId, jobId } = await batchFor(csv);
  await execute(jobId, "csv.preview");
  expect(
    (await owner.importBatch.findUniqueOrThrow({ where: { id: batchId } }))
      .validRows,
  ).toBe(50_000);
  let next = await beginCommit(batchId);
  for (let chunk = 0; chunk < 100; chunk++) {
    await execute(next, "csv.commit");
    if (chunk === 0 || chunk === 98)
      expect(await visibleCount(batchId)).toBe(0);
    if (chunk < 99) next = await continuation(batchId);
  }
  expect(await visibleCount(batchId)).toBe(50_000);
  const result = await owner.importBatch.findUniqueOrThrow({
    where: { id: batchId },
  });
  expect(result.state).toBe("COMMITTED");
  expect(result.processedRows).toBe(50_000);
  expect(result.committedRows).toBe(50_000);
  expect(
    await owner.job.count({
      where: { resourceId: batchId, type: "csv.commit", state: "SUCCEEDED" },
    }),
  ).toBe(100);
  expect(performance.now() - started).toBeLessThan(180_000);
}, 180_000);

it("persists stable-ID duplicate/conflict outcomes and keeps weak overlap decisions explicit", async () => {
  const explicitMapping = { ...mapping, sourceId: 3 };
  const original = await batchFor(
    "date,description,amount,source\n2026-05-06,Synthetic provider purchase,-2.50,provider-1",
    explicitMapping,
  );
  await execute(original.jobId, "csv.preview");
  await execute(await beginCommit(original.batchId), "csv.commit");
  const repeated = await batchFor(
    "date,description,amount,source\n2026-05-06,Synthetic provider purchase,-2.50,provider-1\n2026-05-06,Synthetic provider purchase,-9.99,provider-1",
    explicitMapping,
  );
  await execute(repeated.jobId, "csv.preview");
  const repeatedBatch = await owner.importBatch.findUniqueOrThrow({
    where: { id: repeated.batchId },
  });
  expect(repeatedBatch.duplicateRows).toBe(1);
  expect(repeatedBatch.rejectedRows).toBe(1);
  const repeatedRows = Array.isArray(repeatedBatch.preview)
    ? repeatedBatch.preview.map((row) => normalizedCsvRowSchema.parse(row))
    : [];
  expect(repeatedRows[0]).toMatchObject({
    status: "VALID",
    duplicate: true,
    decision: "SKIP",
  });
  expect(repeatedRows[1]).toEqual({
    rowNumber: 2,
    status: "REJECTED",
    reason: "SOURCE_CONFLICT",
  });
  const weak = await batchFor(
    "date,description,amount\n2026-05-06,Synthetic provider purchase,-2.50",
  );
  await execute(weak.jobId, "csv.preview");
  const weakBatch = await owner.importBatch.findUniqueOrThrow({
    where: { id: weak.batchId },
  });
  expect(weakBatch.overlapRows).toBe(1);
  expect(weakBatch.duplicateRows).toBe(0);
  await owner.importBatch.update({
    where: { id: weak.batchId },
    data: { decisions: { "1": "KEEP" } },
    select: { id: true },
  });
  await execute(await beginCommit(weak.batchId), "csv.commit");
  expect(await visibleCount(weak.batchId)).toBe(1);
  expect(await visibleCount(original.batchId)).toBe(1);
}, 60_000);

it("fails corrupted retained bytes safely and expires originals through bounded maintenance", async () => {
  const corrupted = await batchFor(
    "date,description,amount\n2026-06-07,Synthetic retained original,1.00",
  );
  await owner.importObject.update({
    where: { batchId: corrupted.batchId },
    data: {
      ciphertext: vault.seal(
        Buffer.from("different synthetic bytes"),
        `import:${householdId}:${accountId}:${corrupted.batchId}`,
      ),
    },
    select: { batchId: true },
  });
  await execute(corrupted.jobId, "csv.preview");
  const failed = await owner.importBatch.findUniqueOrThrow({
    where: { id: corrupted.batchId },
  });
  expect(failed.state).toBe("FAILED");
  expect(failed.failureCode).toBe("CSV_UNAVAILABLE");
  expect(
    await owner.transaction.count({
      where: { originImportBatchId: corrupted.batchId },
    }),
  ).toBe(0);
  const expired = await batchFor(
    "date,description,amount\n2026-07-08,Synthetic expiry,2.00",
  );
  await owner.importBatch.update({
    where: { id: expired.batchId },
    data: { previewExpiresAt: new Date(Date.now() - 1000) },
    select: { id: true },
  });
  await owner.importObject.update({
    where: { batchId: expired.batchId },
    data: { expiresAt: new Date(Date.now() - 1000) },
    select: { batchId: true },
  });
  await maintainImports(runtime);
  const retained = await owner.importObject.findUniqueOrThrow({
    where: { batchId: expired.batchId },
  });
  expect(retained.ciphertext).toBeNull();
  expect(retained.deletedAt).not.toBeNull();
  expect(
    (
      await owner.importBatch.findUniqueOrThrow({
        where: { id: expired.batchId },
      })
    ).state,
  ).toBe("EXPIRED");
  expect(
    (await owner.job.findUniqueOrThrow({ where: { id: expired.jobId } })).state,
  ).toBe("CANCELLED");
});

it("refuses to restore an import that has never been published", async () => {
  const { batchId } = await batchFor(
    "date,description,amount\n2026-08-09,Synthetic unpublished restore,3.00",
  );
  await owner.importBatch.update({
    where: { id: batchId },
    data: { state: "COMMITTING" },
    select: { id: true },
  });
  const job = await jobs.enqueue({
    householdId,
    type: "csv.restore",
    resourceId: batchId,
    idempotencyKey: randomUUID(),
    payload: {},
  });
  const lease = await leaseFor(job.id, "csv.restore");
  const handler = handlers["csv.restore"];
  if (!handler) throw new Error("Missing restore handler");
  await expect(
    jobs.complete(lease, (tx) => handler(lease, tx)),
  ).rejects.toThrow("Import restore unavailable");
  expect(
    (await owner.importBatch.findUniqueOrThrow({ where: { id: batchId } }))
      .state,
  ).toBe("COMMITTING");
  expect(
    await owner.transaction.count({ where: { originImportBatchId: batchId } }),
  ).toBe(0);
});
