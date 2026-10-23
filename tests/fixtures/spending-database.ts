import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll } from "vitest";
import type { AuthContext } from "../../packages/contracts/dist/index.js";
import { createOrm } from "../../packages/database/dist/client.js";
import { ScopedDatabase } from "../../packages/database/dist/scoped-transaction.js";

export function spendingFixture() {
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  const runtimeUrl = process.env.DATABASE_URL;
  if (!ownerUrl || !runtimeUrl)
    throw new Error(
      "Spending isolation requires maintenance and runtime configuration",
    );
  const owner = createOrm(ownerUrl);
  const runtime = createOrm(runtimeUrl);
  const scoped = new ScopedDatabase(runtime);
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
  const secondAccountId = randomUUID();
  const transactionId = randomUUID();
  const incomingId = randomUUID();
  const alternativeId = randomUUID();
  const month = new Date("2026-01-01");
  function scopeHash(accountIds: string[]): string {
    return createHash("sha256")
      .update([...accountIds].sort().join(","))
      .digest("hex");
  }
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
    for (const id of [accountId, secondAccountId]) {
      await owner.account.create({
        data: {
          id,
          householdId,
          creatorUserId: alice.userId,
          creatorMembershipId: alice.membershipId,
          label: "Synthetic spending",
          kind: "CURRENT",
          owners: {
            create: { userId: alice.userId, membershipId: alice.membershipId },
          },
          grants: {
            create: { membershipId: bob.membershipId, level: "TRANSACTIONS" },
          },
        },
      });
    }
    for (const [id, account, amountMinor] of [
      [transactionId, accountId, -50000n],
      [incomingId, secondAccountId, 50000n],
      [alternativeId, secondAccountId, 50000n],
    ] as const) {
      await owner.transaction.create({
        data: {
          id,
          householdId,
          accountId: account,
          sourceNamespace: "MANUAL",
          sourceId: randomUUID(),
          sourceHash: "a".repeat(64),
          fingerprint: "b".repeat(64),
          amountMinor,
          bookedDate: month,
          description: "Synthetic transaction",
        },
      });
    }
  });
  afterAll(async () => {
    await runtime.$disconnect();
    await owner.transferLink.deleteMany({ where: { householdId } });
    await owner.transaction.deleteMany({ where: { householdId } });
    await owner.budgetScope.deleteMany({ where: { householdId } });
    await owner.account.deleteMany({ where: { householdId } });
    await owner.household.deleteMany({
      where: { id: { in: [householdId, otherHouseholdId] } },
    });
    await owner.user.deleteMany({
      where: { id: { in: [alice.userId, bob.userId, outsider.userId] } },
    });
    await owner.$disconnect();
  });

  return {
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
  };
}
