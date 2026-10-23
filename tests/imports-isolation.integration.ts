import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { createOrm, type Prisma } from "../packages/database/dist/client.js";
import { PrismaPg } from "../packages/database/node_modules/@prisma/adapter-pg/dist/index.js";
import { PrismaClient } from "../packages/database/dist/generated/prisma/client.js";
import {
  ScopedDatabase,
  withImportJobScope,
} from "../packages/database/dist/scoped-transaction.js";
import { JobsRepository } from "../packages/database/dist/jobs.repository.js";

const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeUrl = process.env.DATABASE_URL;
if (!ownerUrl || !runtimeUrl)
  throw new Error(
    "Import isolation requires maintenance and runtime database configuration",
  );
const owner = createOrm(ownerUrl);
const runtime = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: runtimeUrl,
    max: 1,
    connectionTimeoutMillis: 2000,
    statement_timeout: 5000,
  }),
});
const scope = new ScopedDatabase(runtime);
const householdId = randomUUID();
const otherHouseholdId = randomUUID();
function actor(household: string): AuthContext {
  return {
    userId: randomUUID(),
    membershipId: randomUUID(),
    householdId: household,
    sessionId: randomUUID(),
    requestId: randomUUID(),
    grantVersion: 0,
    aal: "aal2",
    mfaAuthenticatedAt: Date.now(),
  };
}
const alice = actor(householdId);
const bob = actor(householdId);
const outsider = actor(otherHouseholdId);
const accountId = randomUUID();
const batchId = randomUUID();
const transactionId = randomUUID();
const jobs = new JobsRepository(runtime);
const hash = "a".repeat(64);
const date = new Date("2026-10-23");
beforeAll(async () => {
  await owner.household.createMany({
    data: [{ id: householdId }, { id: otherHouseholdId }],
  });
  for (const [index, context] of [alice, bob, outsider].entries()) {
    await owner.user.create({
      data: {
        id: context.userId,
        memberships: {
          create: {
            id: context.membershipId,
            householdId: context.householdId,
            slot: index === 1 ? 2 : 1,
          },
        },
        sessions: {
          create: {
            id: context.sessionId,
            householdId: context.householdId,
            expiresAt: new Date(Date.now() + 600000),
          },
        },
      },
    });
  }
  await owner.account.create({
    data: {
      id: accountId,
      householdId,
      creatorUserId: alice.userId,
      creatorMembershipId: alice.membershipId,
      label: "Synthetic CSV isolation",
      kind: "CURRENT",
      owners: {
        create: { userId: alice.userId, membershipId: alice.membershipId },
      },
    },
  });
  await owner.importBatch.create({
    data: {
      id: batchId,
      householdId,
      accountId,
      requestedByUserId: alice.userId,
      requestedByMembershipId: alice.membershipId,
      fileChecksum: hash,
      mappingHash: hash,
      mapping: {},
      parserVersion: "test",
      previewExpiresAt: new Date(Date.now() + 600000),
      state: "COMMITTING",
      object: {
        create: {
          ciphertext: "synthetic-encrypted-placeholder",
          expiresAt: new Date(Date.now() + 600000),
        },
      },
    },
  });
  await owner.transaction.create({
    data: {
      id: transactionId,
      householdId,
      accountId,
      sourceNamespace: "CSV",
      sourceId: "synthetic-row-1",
      sourceHash: hash,
      fingerprint: hash,
      amountMinor: -150n,
      bookedDate: date,
      description: "Synthetic purchase",
      originImportBatchId: batchId,
      csvRowNumber: 1,
      revisions: {
        create: {
          actorMembershipId: alice.membershipId,
          version: 1,
          kind: "CREATED",
          data: {},
        },
      },
    },
  });
});
afterAll(async () => {
  await runtime.$disconnect();
  await owner.transaction.deleteMany({
    where: { householdId: { in: [householdId, otherHouseholdId] } },
  });
  await owner.importBatch.deleteMany({ where: { householdId } });
  await owner.account.deleteMany({ where: { householdId } });
  await owner.household.deleteMany({
    where: { id: { in: [householdId, otherHouseholdId] } },
  });
  await owner.user.deleteMany({
    where: { id: { in: [alice.userId, bob.userId, outsider.userId] } },
  });
  await owner.$disconnect();
});

it("hides staged rows, owner previews and source objects from unscoped, TOTALS and other households", async () => {
  expect(await runtime.importBatch.count()).toBe(0);
  expect(await runtime.transaction.count()).toBe(0);
  expect(await scope.withScope(alice, (tx) => tx.transaction.count())).toBe(0);
  expect(await scope.withScope(alice, (tx) => tx.importBatch.count())).toBe(1);
  await owner.accountGrant.create({
    data: {
      householdId,
      accountId,
      membershipId: bob.membershipId,
      level: "TOTALS",
    },
  });
  expect(await scope.withScope(bob, (tx) => tx.importBatch.count())).toBe(0);
  expect(await scope.withScope(bob, (tx) => tx.importObject.count())).toBe(0);
  expect(await scope.withScope(bob, (tx) => tx.transaction.count())).toBe(0);
  expect(await scope.withScope(outsider, (tx) => tx.transaction.count())).toBe(
    0,
  );
});

it("resolves worker authority only from a live matching lease, without browser impersonation", async () => {
  const job = await jobs.enqueue({
    householdId,
    type: "csv.commit",
    resourceId: batchId,
    idempotencyKey: randomUUID(),
    payload: { offset: 0 },
  });
  const lease = await jobs.claim(
    "synthetic-import-isolation",
    ["csv.commit"],
    30000,
    job.id,
  );
  if (!lease) throw new Error("Expected synthetic lease");
  await expect(
    runtime.$transaction((tx) =>
      withImportJobScope(
        tx,
        { ...lease, leaseToken: randomUUID() },
        async () => undefined,
      ),
    ),
  ).rejects.toThrow();
  expect(
    await jobs.complete(lease, async (tx) =>
      withImportJobScope(tx, lease, async (scoped, context) => {
        expect(context.batchId).toBe(batchId);
        expect(context.userId).toBe(alice.userId);
        expect(await scoped.transaction.count()).toBe(1);
        expect(await scoped.importBatch.count()).toBe(1);
        expect(await scoped.transactionNote.count()).toBe(0);
        expect(await scoped.transactionRevision.count()).toBe(1);
      }),
    ),
  ).toBe(true);
  expect(await runtime.transaction.count()).toBe(0);
  await expect(
    scope.withScope(alice, async () => {
      throw new Error("Synthetic scope rollback");
    }),
  ).rejects.toThrow("Synthetic scope rollback");
  expect(await runtime.importBatch.count()).toBe(0);
  const unrelated = await jobs.enqueue({
    householdId: otherHouseholdId,
    type: "csv.commit",
    resourceId: batchId,
    idempotencyKey: randomUUID(),
    payload: { offset: 0 },
  });
  const unrelatedLease = await jobs.claim(
    "synthetic-invalid-household",
    ["csv.commit"],
    30000,
    unrelated.id,
  );
  if (!unrelatedLease) throw new Error("Expected unrelated fixture lease");
  await expect(
    runtime.$transaction((tx) =>
      withImportJobScope(tx, unrelatedLease, async () => undefined),
    ),
  ).rejects.toThrow();
  const wrongType = await jobs.enqueue({
    householdId,
    type: "arbitrary.handler",
    resourceId: batchId,
    idempotencyKey: randomUUID(),
    payload: {},
  });
  const wrongLease = await jobs.claim(
    "synthetic-invalid-type",
    ["arbitrary.handler"],
    30000,
    wrongType.id,
  );
  if (!wrongLease) throw new Error("Expected wrong-type fixture lease");
  await expect(
    runtime.$transaction((tx) =>
      withImportJobScope(tx, wrongLease, async () => undefined),
    ),
  ).rejects.toThrow();
  await expect(
    runtime.$transaction((tx) =>
      withImportJobScope(tx, lease, async () => undefined),
    ),
  ).rejects.toThrow();
});

it("fences batched job writes by account, batch, actor, operation and current commit state", async () => {
  const otherBatchId = randomUUID();
  const otherTransactionId = randomUUID();
  const positiveTransactionId = randomUUID();
  await owner.importBatch.create({
    data: {
      id: otherBatchId,
      householdId,
      accountId,
      requestedByUserId: alice.userId,
      requestedByMembershipId: alice.membershipId,
      fileChecksum: "b".repeat(64),
      mappingHash: hash,
      mapping: {},
      parserVersion: "test",
      state: "COMMITTING",
      previewExpiresAt: new Date(Date.now() + 600000),
    },
  });
  function sourceRow(
    originImportBatchId: string,
  ): Prisma.TransactionCreateManyInput {
    return {
      id: randomUUID(),
      householdId,
      accountId,
      sourceNamespace: "CSV",
      sourceId: randomUUID(),
      sourceHash: hash,
      fingerprint: hash,
      amountMinor: -100n,
      bookedDate: date,
      description: "Synthetic write-policy row",
      originImportBatchId,
      csvRowNumber: 2,
    };
  }
  function revisionRow(
    transactionId: string,
  ): Prisma.TransactionRevisionCreateManyInput {
    return {
      id: randomUUID(),
      householdId,
      accountId,
      transactionId,
      actorMembershipId: alice.membershipId,
      kind: "CREATED",
      version: 1,
      data: {},
    };
  }
  await owner.transaction.create({
    data: { ...sourceRow(otherBatchId), id: otherTransactionId },
  });
  const job = await jobs.enqueue({
    householdId,
    type: "csv.commit",
    resourceId: batchId,
    idempotencyKey: randomUUID(),
    payload: { offset: 0 },
  });
  const lease = await jobs.claim(
    "synthetic-write-policy",
    ["csv.commit"],
    30000,
    job.id,
  );
  if (!lease) throw new Error("Expected synthetic write-policy lease");
  const insertSource = (data: Prisma.TransactionCreateManyInput) =>
    runtime.$transaction((tx) =>
      withImportJobScope(tx, lease, (jobTx) =>
        jobTx.transaction.createMany({ data: [data] }),
      ),
    );
  const insertRevision = (data: Prisma.TransactionRevisionCreateManyInput) =>
    runtime.$transaction((tx) =>
      withImportJobScope(tx, lease, (jobTx) =>
        jobTx.transactionRevision.createMany({ data: [data] }),
      ),
    );
  try {
    await expect(insertSource(sourceRow(otherBatchId))).rejects.toThrow(
      /row-level security/,
    );
    await expect(
      insertRevision(revisionRow(otherTransactionId)),
    ).rejects.toThrow(/row-level security/);
    await expect(
      insertRevision({
        ...revisionRow(transactionId),
        actorMembershipId: bob.membershipId,
      }),
    ).rejects.toThrow(/row-level security/);
    await expect(
      insertRevision({
        ...revisionRow(transactionId),
        kind: "CLASSIFICATION",
        version: 2,
      }),
    ).rejects.toThrow(/row-level security/);
    await expect(
      insertSource({
        ...sourceRow(batchId),
        sourceNamespace: "MANUAL",
        originImportBatchId: null,
        csvRowNumber: null,
      }),
    ).rejects.toThrow(/row-level security/);
    // The same actual lease may stage its own source and initial revision.
    expect(
      (await insertSource({ ...sourceRow(batchId), id: positiveTransactionId }))
        .count,
    ).toBe(1);
    expect(
      (await insertRevision(revisionRow(positiveTransactionId))).count,
    ).toBe(1);
    for (const state of [
      "COMMITTED",
      "ROLLED_BACK",
      "FAILED",
      "EXPIRED",
      "READY",
    ] as const) {
      await owner.importBatch.update({
        where: { id: batchId },
        data: { state },
      });
      await expect(insertSource(sourceRow(batchId))).rejects.toThrow(
        /row-level security/,
      );
      await expect(
        insertRevision(revisionRow(positiveTransactionId)),
      ).rejects.toThrow(/row-level security/);
    }
    await owner.importBatch.update({
      where: { id: batchId },
      data: { state: "COMMITTING" },
    });
    const previewJob = await jobs.enqueue({
      householdId,
      type: "csv.preview",
      resourceId: batchId,
      idempotencyKey: randomUUID(),
      payload: {},
    });
    const previewLease = await jobs.claim(
      "synthetic-preview-write",
      ["csv.preview"],
      30000,
      previewJob.id,
    );
    if (!previewLease) throw new Error("Expected synthetic preview lease");
    await expect(
      runtime.$transaction((tx) =>
        withImportJobScope(tx, previewLease, (jobTx) =>
          jobTx.transaction.createMany({ data: [sourceRow(batchId)] }),
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  } finally {
    await owner.importBatch.update({
      where: { id: batchId },
      data: { state: "COMMITTING" },
    });
    await owner.transaction.deleteMany({
      where: { id: { in: [otherTransactionId, positiveTransactionId] } },
    });
    await owner.importBatch.delete({ where: { id: otherBatchId } });
  }
});

it("keeps 50,000 staged rows hidden and publishes them within the real runtime statement bound", async () => {
  await owner.$executeRaw`INSERT INTO app."Transaction" (id, "householdId", "accountId", currency, "sourceNamespace", "sourceId", "sourceHash", fingerprint, "amountMinor", "bookedDate", description, status, "originImportBatchId", "csvRowNumber", version, "createdAt", "updatedAt")
    SELECT gen_random_uuid(), ${householdId}::uuid, ${accountId}::uuid, 'GBP', 'CSV', 'capacity:' || ordinal::text,
      ${hash}, ${hash}, -150, ${date}::date, 'Synthetic capacity purchase', 'BOOKED', ${batchId}::uuid, ordinal, 1, clock_timestamp(), clock_timestamp()
    FROM generate_series(2, 50000) ordinal`;
  try {
    expect(
      await scope.withScope(alice, (tx) =>
        tx.transaction.count({ where: { originImportBatchId: batchId } }),
      ),
    ).toBe(0);
    await owner.importBatch.update({
      where: { id: batchId },
      data: { state: "COMMITTED" },
    });
    expect(
      await scope.withScope(alice, (tx) =>
        tx.transaction.count({ where: { originImportBatchId: batchId } }),
      ),
    ).toBe(50000);
    expect(
      await scope.withScope(bob, (tx) =>
        tx.transaction.count({ where: { originImportBatchId: batchId } }),
      ),
    ).toBe(0);
    await owner.accountGrant.update({
      where: {
        accountId_membershipId: { accountId, membershipId: bob.membershipId },
      },
      data: { level: "TRANSACTIONS" },
    });
    expect(
      await scope.withScope(bob, (tx) =>
        tx.transaction.count({ where: { originImportBatchId: batchId } }),
      ),
    ).toBe(50000);
    await owner.accountGrant.update({
      where: {
        accountId_membershipId: { accountId, membershipId: bob.membershipId },
      },
      data: { level: "NONE" },
    });
    expect(
      await scope.withScope(bob, (tx) =>
        tx.transaction.count({ where: { originImportBatchId: batchId } }),
      ),
    ).toBe(0);
  } finally {
    await owner.transaction.deleteMany({
      where: { originImportBatchId: batchId, id: { not: transactionId } },
    });
    await owner.importBatch.update({
      where: { id: batchId },
      data: { state: "COMMITTING" },
    });
    await owner.accountGrant.update({
      where: {
        accountId_membershipId: { accountId, membershipId: bob.membershipId },
      },
      data: { level: "TOTALS" },
    });
  }
});

it("allows atomic runtime manual creation with immutable initial revision", async () => {
  const manualId = randomUUID();
  await scope.withScope(alice, async (tx) => {
    const row = await tx.transaction.create({
      data: {
        id: manualId,
        householdId,
        accountId,
        sourceNamespace: "MANUAL",
        sourceId: randomUUID(),
        sourceHash: hash,
        fingerprint: hash,
        amountMinor: -300n,
        bookedDate: date,
        description: "Synthetic manual purchase",
      },
    });
    expect(row.id).toBe(manualId);
    await tx.transaction.update({
      where: { id: manualId },
      data: { fingerprint: "b".repeat(64), amountMinor: -400n, version: 2 },
    });
    await tx.transactionRevision.create({
      data: {
        householdId,
        accountId,
        transactionId: manualId,
        actorMembershipId: alice.membershipId,
        version: 1,
        kind: "CREATED",
        data: {},
      },
    });
  });
  await owner.transaction.delete({ where: { id: manualId } });
});

it("publishes committed rows only at TRANSACTIONS and keeps each author's note private", async () => {
  await owner.importBatch.update({
    where: { id: batchId },
    data: { state: "COMMITTED" },
  });
  expect(await scope.withScope(bob, (tx) => tx.transaction.count())).toBe(0);
  await owner.accountGrant.update({
    where: {
      accountId_membershipId: { accountId, membershipId: bob.membershipId },
    },
    data: { level: "TRANSACTIONS" },
  });
  expect(await scope.withScope(bob, (tx) => tx.transaction.count())).toBe(1);
  await scope.withScope(alice, (tx) =>
    tx.transactionNote.create({
      data: {
        householdId,
        accountId,
        transactionId,
        authorUserId: alice.userId,
        authorMembershipId: alice.membershipId,
        body: "Synthetic owner-only note",
      },
    }),
  );
  expect(await scope.withScope(bob, (tx) => tx.transactionNote.count())).toBe(
    0,
  );
  await scope.withScope(bob, (tx) =>
    tx.transactionNote.create({
      data: {
        householdId,
        accountId,
        transactionId,
        authorUserId: bob.userId,
        authorMembershipId: bob.membershipId,
        body: "Synthetic viewer-only note",
      },
    }),
  );
  expect(await scope.withScope(alice, (tx) => tx.transactionNote.count())).toBe(
    1,
  );
  expect(await scope.withScope(bob, (tx) => tx.transactionNote.count())).toBe(
    1,
  );
  await expect(
    scope.withScope(bob, (tx) =>
      tx.transactionOverride.create({
        data: {
          householdId,
          accountId,
          transactionId,
          authorMembershipId: bob.membershipId,
          category: "Synthetic",
        },
      }),
    ),
  ).rejects.toThrow();
  const pristine = await scope.withScope(
    alice,
    (tx) =>
      tx.$queryRaw<
        { pristine: boolean }[]
      >`SELECT app.import_is_pristine(${batchId}::uuid) AS pristine`,
  );
  expect(pristine[0]?.pristine).toBe(false);
  const hidden = await scope.withScope(
    bob,
    (tx) =>
      tx.$queryRaw<
        { pristine: boolean }[]
      >`SELECT app.import_is_pristine(${batchId}::uuid) AS pristine`,
  );
  expect(hidden[0]?.pristine).toBe(false);
  await expect(
    scope.withScope(alice, (tx) =>
      tx.transaction.update({
        where: { id: transactionId },
        data: { amountMinor: 999n },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scope.withScope(alice, (tx) =>
      tx.transaction.update({
        where: { id: transactionId },
        data: { fingerprint: "b".repeat(64) },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scope.withScope(alice, (tx) =>
      tx.transaction.delete({ where: { id: transactionId } }),
    ),
  ).rejects.toThrow();
  await expect(
    scope.withScope(alice, (tx) =>
      tx.transactionRevision.updateMany({ data: { kind: "CLASSIFICATION" } }),
    ),
  ).rejects.toThrow();
});

it("rechecks live revocation and confines maintenance to expired ciphertext", async () => {
  await owner.accountGrant.update({
    where: {
      accountId_membershipId: { accountId, membershipId: bob.membershipId },
    },
    data: { level: "NONE" },
  });
  expect(await scope.withScope(bob, (tx) => tx.transaction.count())).toBe(0);
  await owner.importObject.update({
    where: { batchId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await runtime.$queryRaw`SELECT app.expire_import_objects(100)`;
  expect(
    (await owner.importObject.findUniqueOrThrow({ where: { batchId } }))
      .ciphertext,
  ).toBeNull();
  expect(await owner.transaction.count({ where: { id: transactionId } })).toBe(
    1,
  );
  await owner.sessionRegistry.update({
    where: { id: alice.sessionId },
    data: { revokedAt: new Date() },
  });
  await expect(
    scope.withScope(alice, (tx) => tx.importBatch.count()),
  ).rejects.toThrow("Authorization scope is no longer valid");
});
