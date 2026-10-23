import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { spendingFixture } from "./fixtures/spending-database.js";

const {
  owner,
  runtime,
  scoped,
  householdId,
  otherHouseholdId,
  alice,
  bob,
  outsider,
  accountId,
  secondAccountId,
  transactionId,
  incomingId,
  alternativeId,
  month,
  scopeHash,
} = spendingFixture();

it("serialises concurrent confirmations sharing a leg and never creates two active links", async () => {
  const results = await Promise.allSettled(
    [incomingId, alternativeId].map((toTransactionId) =>
      scoped.withScope(alice, (tx) =>
        tx.transferLink.create({
          data: {
            householdId,
            fromAccountId: accountId,
            fromTransactionId: transactionId,
            toAccountId: secondAccountId,
            toTransactionId,
          },
        }),
      ),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    1,
  );
  expect(
    await owner.transferLink.count({ where: { householdId, active: true } }),
  ).toBe(1);
  await owner.transferLink.updateMany({
    where: { householdId },
    data: { active: false },
  });
});

it("binds coverage and budget history actors and versions to their actual current records", async () => {
  await scoped.withScope(alice, (tx) =>
    tx.accountMonthCoverage.create({
      data: {
        householdId,
        accountId,
        month,
        complete: true,
        authorMembershipId: alice.membershipId,
      },
    }),
  );
  for (const actorMembershipId of [alice.membershipId, bob.membershipId]) {
    await expect(
      scoped.withScope(alice, (tx) =>
        tx.coverageRevision.create({
          data: {
            householdId,
            accountId,
            month,
            version: 2,
            complete: true,
            actorMembershipId,
          },
        }),
      ),
    ).rejects.toThrow();
  }
  const scopeId = randomUUID();
  let budgetId = "";
  await scoped.withScope(alice, async (tx) => {
    await tx.budgetScope.create({
      data: {
        id: scopeId,
        householdId,
        scopeHash: scopeHash([accountId]),
        creatorMembershipId: alice.membershipId,
      },
    });
    await tx.budgetScopeAccount.create({
      data: { householdId, scopeId, accountId },
    });
    expect(
      await tx.$queryRaw`SELECT app.publish_budget_scope(${scopeId}::uuid) AS published`,
    ).toEqual([{ published: true }]);
    budgetId = (
      await tx.budget.create({
        data: {
          householdId,
          scopeId,
          month,
          creatorMembershipId: alice.membershipId,
        },
      })
    ).id;
  });
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.budgetRevision.create({
        data: {
          householdId,
          budgetId,
          version: 2,
          actorMembershipId: alice.membershipId,
          data: {},
        },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.budgetRevision.create({
        data: {
          householdId,
          budgetId,
          version: 1,
          actorMembershipId: bob.membershipId,
          data: {},
        },
      }),
    ),
  ).rejects.toThrow();
});

it("rejects cross-tenant account links and counterfeit classification direction", async () => {
  const outsiderAccount = randomUUID();
  await owner.account.create({
    data: {
      id: outsiderAccount,
      householdId: otherHouseholdId,
      creatorUserId: outsider.userId,
      creatorMembershipId: outsider.membershipId,
      label: "Synthetic other spending",
      kind: "CURRENT",
      owners: {
        create: {
          userId: outsider.userId,
          membershipId: outsider.membershipId,
        },
      },
    },
  });
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.transactionSplit.create({
        data: {
          householdId,
          accountId: outsiderAccount,
          transactionId,
          position: 0,
          amountMinor: -50000n,
          classificationKind: "EXPENSE",
        },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.transactionOverride.create({
        data: {
          householdId,
          accountId,
          transactionId,
          authorMembershipId: alice.membershipId,
          classificationKind: "INCOME",
        },
      }),
    ),
  ).rejects.toThrow();
  await scoped.withScope(alice, (tx) =>
    tx.transactionOverride.create({
      data: {
        householdId,
        accountId,
        transactionId,
        authorMembershipId: alice.membershipId,
        classificationKind: "EXPENSE",
      },
    }),
  );
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.transaction.update({
        where: { id: transactionId },
        data: { amountMinor: 50000n },
      }),
    ),
  ).rejects.toThrow();
  await owner.account.delete({ where: { id: outsiderAccount } });
});

it("returns only requested visible paired leg IDs after mixed-scope revocation, never counterpart data", async () => {
  const link = await scoped.withScope(alice, (tx) =>
    tx.transferLink.create({
      data: {
        householdId,
        fromAccountId: accountId,
        fromTransactionId: transactionId,
        toAccountId: secondAccountId,
        toTransactionId: incomingId,
      },
    }),
  );
  const ids = [transactionId, incomingId, randomUUID()];
  expect(
    await scoped.withScope(
      bob,
      (tx) => tx.$queryRaw<{ id: string }[]>`
    SELECT app.paired_transaction_ids(${ids}::uuid[]) AS id`,
    ),
  ).toEqual(
    expect.arrayContaining([{ id: transactionId }, { id: incomingId }]),
  );
  await owner.accountGrant.update({
    where: {
      accountId_membershipId: {
        accountId: secondAccountId,
        membershipId: bob.membershipId,
      },
    },
    data: { level: "TOTALS" },
  });
  expect(
    await scoped.withScope(
      bob,
      (tx) => tx.$queryRaw`
    SELECT app.paired_transaction_ids(${ids}::uuid[]) AS id`,
    ),
  ).toEqual([{ id: transactionId }]);
  expect(
    await scoped.withScope(
      outsider,
      (tx) => tx.$queryRaw`
    SELECT app.paired_transaction_ids(${ids}::uuid[]) AS id`,
    ),
  ).toEqual([]);
  await owner.accountGrant.update({
    where: {
      accountId_membershipId: { accountId, membershipId: bob.membershipId },
    },
    data: { level: "NONE" },
  });
  expect(
    await scoped.withScope(
      bob,
      (tx) => tx.$queryRaw`
    SELECT app.paired_transaction_ids(${ids}::uuid[]) AS id`,
    ),
  ).toEqual([]);
  const oversized = Array.from({ length: 201 }, () => transactionId);
  expect(
    await scoped.withScope(
      alice,
      (tx) => tx.$queryRaw`
    SELECT app.paired_transaction_ids(${oversized}::uuid[]) AS id`,
    ),
  ).toEqual([]);
  await owner.transferLink.update({
    where: { id: link.id },
    data: { active: false },
  });
});

it("removes unpublished imported legs from transfer flags without exposing another account", async () => {
  const batchId = randomUUID();
  const importedId = randomUUID();
  const hash = "e".repeat(64);
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
      parserVersion: "synthetic",
      state: "READY",
      previewExpiresAt: new Date(Date.now() + 600000),
    },
  });
  await owner.transaction.create({
    data: {
      id: importedId,
      householdId,
      accountId,
      sourceNamespace: "CSV",
      sourceId: randomUUID(),
      sourceHash: hash,
      fingerprint: hash,
      amountMinor: -50000n,
      bookedDate: month,
      description: "Synthetic published transfer",
      originImportBatchId: batchId,
      csvRowNumber: 1,
    },
  });
  await expect(
    owner.transferLink.create({
      data: {
        householdId,
        fromAccountId: accountId,
        fromTransactionId: importedId,
        toAccountId: secondAccountId,
        toTransactionId: incomingId,
      },
    }),
  ).rejects.toThrow(/eligible/);
  await owner.importBatch.update({
    where: { id: batchId },
    data: { state: "COMMITTED" },
  });
  await scoped.withScope(alice, (tx) =>
    tx.transferLink.create({
      data: {
        householdId,
        fromAccountId: accountId,
        fromTransactionId: importedId,
        toAccountId: secondAccountId,
        toTransactionId: incomingId,
      },
    }),
  );
  const ids = [importedId];
  expect(
    await scoped.withScope(
      alice,
      (tx) =>
        tx.$queryRaw`SELECT app.paired_transaction_ids(${ids}::uuid[]) AS id`,
    ),
  ).toEqual([{ id: importedId }]);
  expect(
    await runtime.$queryRaw`SELECT app.paired_transaction_ids(${ids}::uuid[]) AS id`,
  ).toEqual([]);
  await owner.importBatch.update({
    where: { id: batchId },
    data: { state: "ROLLED_BACK" },
  });
  expect(
    await scoped.withScope(
      alice,
      (tx) =>
        tx.$queryRaw`SELECT app.paired_transaction_ids(${ids}::uuid[]) AS id`,
    ),
  ).toEqual([]);
});
