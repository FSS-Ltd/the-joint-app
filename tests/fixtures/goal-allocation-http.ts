import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { goalDtoSchema } from "../../packages/contracts/dist/index.js";
import { createImportsHttpFixture } from "./imports-http.js";

export async function createGoalAllocationHttpFixture() {
  const f = await createImportsHttpFixture();
  try {
    const goal = await f.request(
      `${f.root}/goals`,
      "POST",
      {
        name: "Synthetic shared goal",
        status: "ACTIVE",
        beneficiary: "ADULT",
        priority: 1,
        target: { amountMinor: "100000", currency: "GBP" },
        targetDate: null,
      },
      undefined,
      { "Idempotency-Key": randomUUID() },
    );
    expect(goal.status).toBe(201);
    const goalId = goalDtoSchema.parse(await goal.json()).id;
    const account = await f.maintenance.account.findUniqueOrThrow({
      where: { id: f.accountId },
    });
    const valuationId = randomUUID();
    await f.maintenance.balanceSnapshot.create({
      data: {
        id: valuationId,
        householdId: account.householdId,
        accountId: account.id,
        authorMembershipId: account.creatorMembershipId,
        amountMinor: 50000n,
        adultAmountMinor: 50000n,
        asOfDate: new Date(new Date().toISOString().slice(0, 10)),
      },
    });
    const evidence = await f.request(
      `${f.root}/accounts/${f.accountId}/funding-evidence`,
      "POST",
      {
        valuationId,
        settledAdultMoney: { amountMinor: "50000", currency: "GBP" },
        billReserves: { amountMinor: "0", currency: "GBP" },
      },
      undefined,
      { "If-Match": '"0"', "Idempotency-Key": randomUUID() },
    );
    expect(evidence.status).toBe(201);
    const path = `${f.root}/goals/${goalId}/allocations`,
      query = `?accountIds=${f.accountId}`;
    function input(version = 0, amountMinor = "30000") {
      return {
        accountIds: [f.accountId],
        sourceVersions: [{ accountId: f.accountId, version }],
        allocations: [
          {
            basis: "FIXED",
            accountId: f.accountId,
            valuationId,
            amount: { amountMinor, currency: "GBP" },
          },
        ],
      };
    }
    return { ...f, path, query, goalId, account, valuationId, input };
  } catch (error) {
    await f.close();
    throw error;
  }
}
