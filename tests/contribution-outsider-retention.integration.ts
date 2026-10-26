import { afterEach, beforeEach, expect, it } from "vitest";
import { createLateContributionFixture } from "./fixtures/contribution-late-member.js";
import { purgeFixtureUser } from "./fixtures/purge-user.js";
import { randomUUID } from "node:crypto";

let f: ReturnType<typeof createLateContributionFixture>, budgetId: string;
beforeEach(async () => {
  f = createLateContributionFixture();
  budgetId = await f.setup();
});
afterEach(() => f.close());

async function reprioritize(): Promise<void> {
  await f.scoped.withScope(
    f.b,
    (tx) =>
      tx.$queryRaw`SELECT app.write_goal(${f.goalId}::uuid,1,${JSON.stringify({ ...f.goalInput, priority: 3 })}::jsonb)`,
  );
}
it("prunes a deleted non-budget goal participant's later changes to the exact frozen head", async () => {
  expect(
    await f.owner.contributionBudgetParticipant.count({
      where: { budgetId, membershipId: f.b.membershipId },
    }),
  ).toBe(0);
  await f.leave();
  const before = await f.readArchive(budgetId);
  await reprioritize();
  expect(
    (
      await f.owner.contributionBudget.findUniqueOrThrow({
        where: { id: budgetId },
      })
    ).version,
  ).toBe(3);
  await purgeFixtureUser(f.runtime, f.b);
  const head = await f.owner.contributionBudget.findUniqueOrThrow({
    where: { id: budgetId },
  });
  expect(head.version).toBe(2);
  expect(head.updatedAt.toISOString()).toBe(before.view.budget.updatedAt);
  expect(
    await f.owner.contributionBudgetRevision.count({ where: { budgetId } }),
  ).toBe(2);
  expect(await f.readArchive(budgetId)).toEqual(before);
  expect(
    (await f.owner.goal.findUniqueOrThrow({ where: { id: f.goalId } })).version,
  ).toBe(1);
});
it("preserves the same shared metadata when an active captured participant independently retains it", async () => {
  await reprioritize();
  const before = await f.readBudget();
  await purgeFixtureUser(f.runtime, f.b);
  f.a.sessionId = randomUUID();
  await f.owner.sessionRegistry.create({
    data: {
      id: f.a.sessionId,
      userId: f.a.userId,
      householdId: f.hh,
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  f.a.grantVersion = (
    await f.owner.membership.findUniqueOrThrow({
      where: { id: f.a.membershipId },
    })
  ).grantVersion;
  expect(await f.readBudget()).toEqual(before);
  expect(before.view.budget.version).toBe(3);
});
