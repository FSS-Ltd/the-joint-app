import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { spendingFixture } from "./fixtures/spending-database.js";

const {
  owner,
  runtime,
  scoped,
  householdId,
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
let publishedScopeId: string;
let budgetId: string;

it("requires the new tables to enforce row-level security under the runtime role", async () => {
  const rows = await runtime.$queryRaw<
    { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
  >`
    SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app'
    AND c.relname IN ('TransactionSplit','TransferLink','AccountMonthCoverage','CoverageRevision','BudgetScope','BudgetScopeAccount','Budget','BudgetLine','BudgetRevision')`;
  expect(rows).toHaveLength(9);
  expect(
    rows.every((row) => row.relrowsecurity && row.relforcerowsecurity),
  ).toBe(true);
  expect(await runtime.$queryRaw`SELECT * FROM app."BudgetScope"`).toEqual([]);
});
it("publishes a nonempty exact scope only after validating every current account permission and hash", async () => {
  const emptyId = randomUUID();
  await scoped.withScope(alice, async (tx) => {
    await tx.budgetScope.create({
      data: {
        id: emptyId,
        householdId,
        scopeHash: "0".repeat(64),
        creatorMembershipId: alice.membershipId,
      },
    });
    expect(
      await tx.$queryRaw`SELECT app.publish_budget_scope(${emptyId}::uuid) AS published`,
    ).toEqual([{ published: false }]);
    await expect(
      tx.budget.create({
        data: {
          householdId,
          scopeId: emptyId,
          month,
          creatorMembershipId: alice.membershipId,
        },
      }),
    ).rejects.toThrow();
  });
  // The failed financial attachment rolls back its construction transaction.
  publishedScopeId = randomUUID();
  await scoped.withScope(alice, async (tx) => {
    await tx.budgetScope.create({
      data: {
        id: publishedScopeId,
        householdId,
        scopeHash: scopeHash([accountId, secondAccountId]),
        creatorMembershipId: alice.membershipId,
      },
    });
    await tx.budgetScopeAccount.createMany({
      data: [accountId, secondAccountId].map((id) => ({
        householdId,
        scopeId: publishedScopeId,
        accountId: id,
      })),
    });
    expect(
      await tx.$queryRaw`SELECT app.publish_budget_scope(${publishedScopeId}::uuid) AS published`,
    ).toEqual([{ published: true }]);
    const budget = await tx.budget.create({
      data: {
        householdId,
        scopeId: publishedScopeId,
        month,
        creatorMembershipId: alice.membershipId,
      },
    });
    budgetId = budget.id;
    await tx.budgetLine.create({
      data: { householdId, budgetId, category: "", amountMinor: 10000n },
    });
  });
});
it("lets a detail-granted adult edit shared planning while denying source ownership and immutable scope mutations", async () => {
  expect(
    await scoped.withScope(bob, (tx) =>
      tx.budget.count({ where: { id: budgetId } }),
    ),
  ).toBe(1);
  await scoped.withScope(bob, async (tx) => {
    await tx.budget.update({ where: { id: budgetId }, data: { version: 2 } });
    await tx.budgetRevision.create({
      data: {
        householdId,
        budgetId,
        actorMembershipId: bob.membershipId,
        version: 2,
        data: { lines: [] },
      },
    });
  });
  await expect(
    scoped.withScope(bob, (tx) =>
      tx.transactionSplit.create({
        data: {
          householdId,
          accountId,
          transactionId,
          position: 0,
          category: null,
          amountMinor: -50000n,
          classificationKind: "EXPENSE",
        },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.budgetScopeAccount.create({
        data: {
          householdId,
          scopeId: publishedScopeId,
          accountId: randomUUID(),
        },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.budgetScope.update({
        where: { id: publishedScopeId },
        data: { ready: false },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(bob, (tx) =>
      tx.budgetRevision.updateMany({ data: { version: 9 } }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(bob, (tx) =>
      tx.budgetLine.create({
        data: { householdId, budgetId, category: "Invalid", amountMinor: -1n },
      }),
    ),
  ).rejects.toThrow();
});
it("hides the entire budget and every scope link after one permission is downgraded, including from its creator", async () => {
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
    await scoped.withScope(bob, (tx) =>
      tx.budget.count({ where: { id: budgetId } }),
    ),
  ).toBe(0);
  expect(
    await scoped.withScope(bob, (tx) =>
      tx.budgetScopeAccount.count({ where: { scopeId: publishedScopeId } }),
    ),
  ).toBe(0);
  expect(await scoped.withScope(outsider, (tx) => tx.budget.count())).toBe(0);
  await expect(
    scoped.withScope(bob, (tx) =>
      tx.budget.update({ where: { id: budgetId }, data: { version: 3 } }),
    ),
  ).rejects.toThrow();
  await owner.accountGrant.update({
    where: {
      accountId_membershipId: {
        accountId: secondAccountId,
        membershipId: bob.membershipId,
      },
    },
    data: { level: "TRANSACTIONS" },
  });
  await owner.accountOwner.update({
    where: {
      accountId_userId: { accountId: secondAccountId, userId: alice.userId },
    },
    data: { status: "ARCHIVED" },
  });
  expect(
    await scoped.withScope(alice, (tx) =>
      tx.budget.count({ where: { id: budgetId } }),
    ),
  ).toBe(0);
  await owner.accountOwner.update({
    where: {
      accountId_userId: { accountId: secondAccountId, userId: alice.userId },
    },
    data: { status: "ACTIVE" },
  });
});
it("requires owner coverage, rejects current completion and keeps revisions immutable", async () => {
  await expect(
    scoped.withScope(bob, (tx) =>
      tx.accountMonthCoverage.create({
        data: {
          householdId,
          accountId,
          month,
          complete: true,
          authorMembershipId: bob.membershipId,
        },
      }),
    ),
  ).rejects.toThrow();
  await scoped.withScope(alice, async (tx) => {
    await tx.accountMonthCoverage.create({
      data: {
        householdId,
        accountId,
        month,
        complete: true,
        authorMembershipId: alice.membershipId,
      },
    });
    await tx.coverageRevision.create({
      data: {
        householdId,
        accountId,
        month,
        complete: true,
        version: 1,
        actorMembershipId: alice.membershipId,
      },
    });
  });
  expect(
    await scoped.withScope(bob, (tx) => tx.accountMonthCoverage.count()),
  ).toBe(1);
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.coverageRevision.updateMany({ data: { complete: false } }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.accountMonthCoverage.create({
        data: {
          householdId,
          accountId,
          month: new Date("2099-01-01"),
          complete: true,
          authorMembershipId: alice.membershipId,
        },
      }),
    ),
  ).rejects.toThrow();
});
it("requires two exact signed split components, prevents source correction and permits atomic clearing", async () => {
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.transactionSplit.create({
        data: {
          householdId,
          accountId,
          transactionId,
          position: 0,
          amountMinor: -10000n,
          classificationKind: "EXPENSE",
        },
      }),
    ),
  ).rejects.toThrow(/reconcile/);
  await scoped.withScope(alice, (tx) =>
    tx.transactionSplit.createMany({
      data: [
        {
          householdId,
          accountId,
          transactionId,
          position: 0,
          amountMinor: -60000n,
          classificationKind: "EXPENSE",
        },
        {
          householdId,
          accountId,
          transactionId,
          position: 1,
          amountMinor: 10000n,
          classificationKind: "REFUND",
        },
      ],
    }),
  );
  expect(await scoped.withScope(bob, (tx) => tx.transactionSplit.count())).toBe(
    2,
  );
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.transaction.update({
        where: { id: transactionId },
        data: { amountMinor: -40000n },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.transactionSplit.updateMany({ data: { amountMinor: -25000n } }),
    ),
  ).rejects.toThrow();
  await scoped.withScope(alice, (tx) =>
    tx.transactionSplit.deleteMany({ where: { transactionId } }),
  );
  expect(
    await scoped.withScope(alice, (tx) => tx.transactionSplit.count()),
  ).toBe(0);
});
it("permits only an owner of both exact opposite legs to confirm and hides counterpart records from viewers", async () => {
  const data = {
    householdId,
    fromAccountId: accountId,
    fromTransactionId: transactionId,
    toAccountId: secondAccountId,
    toTransactionId: incomingId,
  };
  await expect(
    scoped.withScope(bob, (tx) => tx.transferLink.create({ data })),
  ).rejects.toThrow();
  const link = await scoped.withScope(alice, (tx) =>
    tx.transferLink.create({ data }),
  );
  expect(await scoped.withScope(bob, (tx) => tx.transferLink.count())).toBe(0);
  expect(
    await scoped.withScope(
      bob,
      (tx) =>
        tx.$queryRaw`SELECT app.transaction_paired(${transactionId}::uuid) AS paired`,
    ),
  ).toEqual([{ paired: true }]);
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.transferLink.create({
        data: { ...data, toTransactionId: alternativeId },
      }),
    ),
  ).rejects.toThrow(/eligible/);
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.transactionOverride.create({
        data: {
          householdId,
          accountId,
          transactionId,
          authorMembershipId: alice.membershipId,
          classificationKind: "EXPENSE",
        },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scoped.withScope(alice, (tx) =>
      tx.transaction.update({
        where: { id: transactionId },
        data: { amountMinor: -40000n },
      }),
    ),
  ).rejects.toThrow();
  await scoped.withScope(alice, (tx) =>
    tx.transferLink.update({
      where: { id: link.id },
      data: { active: false, version: 2 },
    }),
  );
});
