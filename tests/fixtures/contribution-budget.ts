import { randomUUID } from "node:crypto";
import { createFundingEvidenceFixture } from "./funding-evidence.js";

export function createContributionFixture() {
  const f = createFundingEvidenceFixture();
  const goalId = randomUUID(),
    otherGoalId = randomUUID();
  const goalInput = {
    name: "Synthetic contribution goal",
    status: "ACTIVE",
    beneficiary: "ADULT",
    priority: 1,
    target: { amountMinor: "100000", currency: "GBP" },
    targetDate: null,
  };
  async function setup(): Promise<void> {
    await f.setup();
    for (const [index, id] of [goalId, otherGoalId].entries()) {
      const input = { ...goalInput, priority: index + 1 };
      await f.scoped.withScope(
        f.a,
        (tx) =>
          tx.$queryRaw`SELECT app.write_goal(${id}::uuid,0,${JSON.stringify(input)}::jsonb)`,
      );
    }
  }
  return { ...f, goalId, otherGoalId, goalInput, setup };
}
