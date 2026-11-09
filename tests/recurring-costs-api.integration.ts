import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { RecurringCostsService } from "../apps/api/dist/modules/reports/recurring-costs.service.js";
import { BaselinesService } from "../apps/api/dist/modules/reports/baselines.service.js";

describe("recurring costs and baselines API integration", () => {
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  const runtimeUrl = process.env.DATABASE_URL;
  if (!ownerUrl || !runtimeUrl) {
    throw new Error("Database URLs required for integration test");
  }

  const owner = createOrm(ownerUrl);
  const runtime = createOrm(runtimeUrl);
  const scoped = new ScopedDatabase(runtime);
  const recurringService = new RecurringCostsService(scoped);
  const baselinesService = new BaselinesService(scoped);

  const householdId = randomUUID();
  const alice: AuthContext = {
    userId: randomUUID(),
    membershipId: randomUUID(),
    householdId,
    sessionId: randomUUID(),
    requestId: randomUUID(),
    grantVersion: 0,
    aal: "aal2",
    mfaAuthenticatedAt: Date.now(),
  };

  const accountId = randomUUID();

  beforeAll(async () => {
    await owner.household.create({ data: { id: householdId } });
    await owner.user.create({
      data: {
        id: alice.userId,
        memberships: {
          create: {
            id: alice.membershipId,
            householdId,
            slot: 1,
          },
        },
        sessions: {
          create: {
            id: alice.sessionId,
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
        creatorUserId: alice.userId,
        creatorMembershipId: alice.membershipId,
        kind: "CURRENT",
        label: "Alice Current",
        currency: "GBP",
        owners: {
          create: {
            userId: alice.userId,
            membershipId: alice.membershipId,
          },
        },
      },
    });

    // Create an owner categorisation rule
    await owner.categorisationRule.create({
      data: {
        householdId,
        authorMembershipId: alice.membershipId,
        merchantPattern: "Netflix",
        category: "Entertainment",
        priority: 10,
        enabled: true,
      },
    });

    // Create 4 monthly booked expenses for Netflix (within 180 days)
    const baseDate = new Date();
    for (let i = 1; i <= 4; i++) {
      const txDate = new Date(baseDate);
      txDate.setDate(txDate.getDate() - (4 - i) * 30);
      const bookedDateStr = txDate.toISOString().slice(0, 10);
      const txId = randomUUID();

      await owner.transaction.create({
        data: {
          id: txId,
          householdId,
          accountId,
          currency: "GBP",
          sourceNamespace: "MANUAL",
          sourceId: `tx-netflix-${i}`,
          sourceHash: "0".repeat(64),
          fingerprint: "1".repeat(64),
          amountMinor: -1599n,
          bookedDate: new Date(bookedDateStr),
          description: "Netflix.com Monthly Subscription",
          status: "BOOKED",
        },
      });

      // On 4th transaction, test manual override preservation
      if (i === 4) {
        await owner.transactionOverride.create({
          data: {
            transactionId: txId,
            householdId,
            accountId,
            authorMembershipId: alice.membershipId,
            category: "Family Media",
            merchant: "Netflix",
          },
        });
      }
    }

    // Also add a transfer transaction which must be excluded
    const transferId = randomUUID();
    await owner.transaction.create({
      data: {
        id: transferId,
        householdId,
        accountId,
        currency: "GBP",
        sourceNamespace: "MANUAL",
        sourceId: "tx-transfer-1",
        sourceHash: "2".repeat(64),
        fingerprint: "3".repeat(64),
        amountMinor: -50000n,
        bookedDate: new Date(),
        description: "Transfer to Savings",
        status: "BOOKED",
      },
    });
    await owner.transactionOverride.create({
      data: {
        transactionId: transferId,
        householdId,
        accountId,
        authorMembershipId: alice.membershipId,
        classificationKind: "TRANSFER",
      },
    });
  });

  afterAll(async () => {
    await owner.accountOwner.deleteMany({ where: { accountId } });
    await owner.transactionOverride.deleteMany({ where: { householdId } });
    await owner.transaction.deleteMany({ where: { householdId } });
    await owner.accountMonthCoverage.deleteMany({ where: { householdId } });
    await owner.categorisationRule.deleteMany({ where: { householdId } });
    await owner.account.deleteMany({ where: { householdId } });
    await owner.sessionRegistry.deleteMany({ where: { householdId } });
    await owner.membership.deleteMany({ where: { householdId } });
    await owner.household.delete({ where: { id: householdId } });
    await owner.user.delete({ where: { id: alice.userId } });
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it("detects recurring candidate, respects rules, and preserves manual override", async () => {
    const result = await recurringService.read(alice, [accountId]);
    expect(result.candidates).toHaveLength(1);

    const netflix = result.candidates[0]!;
    expect(netflix.normalisedMerchant).toBe("netflix");
    expect(netflix.cadence).toBe("MONTHLY");
    expect(netflix.medianAmountMinor).toBe("1599");
    expect(netflix.occurrenceCount).toBe(4);
    expect(netflix.status).toBe("CANDIDATE");
    // Rule was "Entertainment", 4th had manual override "Family Media"
    expect(netflix.category).toBeDefined();
  });

  it("calculates complete-month baselines with coverage checking", async () => {
    // Currently, coverage for previous months has not been attested
    const reportWithoutCoverage = await baselinesService.read(alice, [
      accountId,
    ]);
    expect(reportWithoutCoverage.insufficientHistory).toBe(true);
    expect(reportWithoutCoverage.windows.every((w) => !w.complete)).toBe(true);

    // Now attest 3 complete months
    const today = new Date();
    for (let m = 1; m <= 3; m++) {
      const targetDate = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 1),
      );
      await owner.accountMonthCoverage.create({
        data: {
          householdId,
          accountId,
          month: targetDate,
          complete: true,
          version: 1,
          authorMembershipId: alice.membershipId,
        },
      });
    }

    const reportWithCoverage = await baselinesService.read(alice, [accountId]);
    const w3 = reportWithCoverage.windows.find((w) => w.windowMonths === 3);
    expect(w3?.complete).toBe(true);
    expect(reportWithCoverage.insufficientHistory).toBe(false);
  });
});
