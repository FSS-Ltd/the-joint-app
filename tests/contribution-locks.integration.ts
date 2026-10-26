import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createContributionFixture } from "./fixtures/contribution-budget.js";
import { databaseErrorCode } from "../apps/api/src/database-error.js";

let f: ReturnType<typeof createContributionFixture>;
beforeEach(async () => {
  f = createContributionFixture();
  await f.setup();
});
afterEach(() => f.close());

// Observe the exact test lock boundary with at most eighty catalog probes.
async function waitForPlanLock(marker: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const [row] = await f.owner.$queryRaw<{ blocked: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${marker} AND wait_event_type='Lock') AS blocked`;
    if (row?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    "Contribution writer did not reach the expected lock boundary",
  );
}
it("rechecks session authority after a plan-row wait before revealing version state", async () => {
  await f.writeCapacity();
  await f.writePlan(1);
  const marker = randomUUID();
  let operation: Promise<unknown> | undefined, result: unknown;
  try {
    await f.owner.$transaction(async (blocker) => {
      await blocker.$executeRaw`UPDATE app."ContributionPlan" SET version=2 WHERE "goalId"=${f.goalId}::uuid`;
      operation = f.scoped
        .withScope(f.a, async (tx) => {
          await tx.$queryRaw`SELECT set_config('application_name',${marker},true)`;
          return tx.$queryRaw`SELECT app.write_contribution_plan(${f.goalId}::uuid,2,${JSON.stringify(f.planInput("1", 1))}::jsonb)`;
        })
        .catch(databaseErrorCode);
      await waitForPlanLock(marker);
      await blocker.sessionRegistry.update({
        where: { id: f.a.sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
    });
  } finally {
    if (operation) result = await operation;
  }
  expect(result).toBe("42501");
});
it("denies incomplete cohort goal rights before waiting on the goal lock", async () => {
  await f.owner.goalParticipant.delete({
    where: {
      goalId_membershipId: { goalId: f.goalId, membershipId: f.b.membershipId },
    },
  });
  await f.writeCapacity();
  await f.owner.$transaction(async (blocker) => {
    await blocker.$queryRaw`SELECT id FROM app."Goal" WHERE id=${f.goalId}::uuid FOR UPDATE`;
    await expect(
      f.scoped
        .withScope(f.a, async (tx) => {
          await tx.$executeRaw`SET LOCAL lock_timeout='100ms'`;
          return tx.$queryRaw`SELECT app.write_contribution_plan(${f.goalId}::uuid,1,${JSON.stringify(f.planInput())}::jsonb)`;
        })
        .catch(databaseErrorCode),
    ).resolves.toBe("P0002");
  });
});
it("denies narrowed goal rights before disclosing a budget-version conflict", async () => {
  await f.writeCapacity();
  await f.writePlan(1);
  await f.owner.goalParticipant.delete({
    where: {
      goalId_membershipId: { goalId: f.goalId, membershipId: f.a.membershipId },
    },
  });
  await expect(f.writeCapacity(1).catch(databaseErrorCode)).resolves.toBe(
    "P0002",
  );
});
