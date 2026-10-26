import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { goalDtoSchema } from "../../packages/contracts/dist/index.js";
import { createImportsHttpFixture } from "./imports-http.js";
import { contributionCapacity } from "./contribution-plans.js";

export async function createContributionHttpFixture() {
  const f = await createImportsHttpFixture();
  try {
    const response = await f.request(
      `${f.root}/goals`,
      "POST",
      {
        name: "Synthetic contribution goal",
        status: "ACTIVE",
        beneficiary: "ADULT",
        priority: 1,
        target: { amountMinor: "100000", currency: "GBP" },
        targetDate: null,
      },
      undefined,
      { "Idempotency-Key": randomUUID() },
    );
    expect(response.status).toBe(201);
    const goalId = goalDtoSchema.parse(await response.json()).id;
    return {
      ...f,
      goalId,
      capacity: contributionCapacity,
      path: `${f.root}/contribution-budget`,
      planPath: `${f.root}/goals/${goalId}/contribution-plan`,
      planInput: {
        expectedGoalVersion: 1,
        expectedPlanVersion: 0,
        firstContributionDate: "2026-11-30",
        monthlyContributions: [
          { fromMonth: 1, amount: { amountMinor: "30000", currency: "GBP" } },
        ],
      },
    };
  } catch (error) {
    await f.close();
    throw error;
  }
}
