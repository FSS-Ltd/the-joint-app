import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { assessDatedContributions } from "../packages/domain/dist/goals/index.js";
import { createContributionFixture } from "./fixtures/contribution-budget.js";
import { databaseErrorCode } from "../apps/api/src/database-error.js";
import { purgeFixtureUser } from "./fixtures/purge-user.js";

let f: ReturnType<typeof createContributionFixture>;
beforeEach(async () => {
  f = createContributionFixture();
  await f.setup();
});
afterEach(() => f.close());
async function changeGoal(input: typeof f.goalInput, version = 1) {
  await f.scoped.withScope(
    f.b,
    (tx) =>
      tx.$queryRaw`SELECT app.write_goal(${f.goalId}::uuid,${version}::integer,${JSON.stringify(input)}::jsonb)`,
  );
}
async function seedPlans(): Promise<string> {
  const initial = await f.writeCapacity();
  await f.writePlan(1);
  return initial.budget.id;
}
describe("contribution metadata and frozen lifecycle", () => {
  it("reorders shared funding atomically with saved goal priority and advances provenance", async () => {
    await seedPlans();
    await f.writePlan(2, f.planInput(), f.otherGoalId);
    await changeGoal({ ...f.goalInput, priority: 3 });
    const page = await f.readBudget(f.b);
    expect(page.view.budget.version).toBe(4);
    expect(page.history.at(-1)?.change.kind).toBe("GOAL");
    const result = assessDatedContributions({
      capacity: page.view.budget.capacity,
      plans: page.view.plans,
    });
    expect(
      result.months[0]?.goals.map((entry) => [
        entry.goalId,
        entry.planned.amountMinor,
      ]),
    ).toEqual([
      [f.otherGoalId, "30000"],
      [f.goalId, "20000"],
    ]);
    const unchanged = await f.writePlan(
      4,
      { ...f.planInput("30000", 1), expectedGoalVersion: 2 },
      f.goalId,
      f.b,
    );
    expect(unchanged.budget.version).toBe(4);
    expect(unchanged.selectedPlan?.goalVersion).toBe(2);
  });
  it("archives an intention without deleting its history or reserving future capacity", async () => {
    await seedPlans();
    await changeGoal({ ...f.goalInput, status: "ARCHIVED" });
    const page = await f.readBudget(f.b, f.goalId);
    expect(page.view.budget.version).toBe(3);
    expect(page.view.plans).toEqual([]);
    expect(page.view.selectedPlan?.status).toBe("ARCHIVED");
    expect(page.history.map((entry) => entry.change.kind)).toEqual([
      "CAPACITY",
      "PLAN",
      "GOAL",
    ]);
    await expect(
      f
        .writePlan(3, f.planInput("1", 1), f.goalId, f.b)
        .catch(databaseErrorCode),
    ).resolves.toBe("P0002");
    await f.owner.goalParticipant.delete({
      where: {
        goalId_membershipId: {
          goalId: f.goalId,
          membershipId: f.b.membershipId,
        },
      },
    });
    await expect(f.readBudget(f.b).catch(databaseErrorCode)).resolves.toBe(
      "P0002",
    );
  });
  it("freezes history, capacity and ordering before later edits by a remaining adult", async () => {
    const id = await seedPlans();
    await f.leave();
    const frozen = await f.readArchive(id);
    await f.writePlan(2, f.planInput("10000", 1), f.goalId, f.b);
    await changeGoal({ ...f.goalInput, priority: 3 });
    expect(await f.readArchive(id)).toEqual(frozen);
    expect(frozen.view.budget.version).toBe(2);
    expect(
      frozen.view.plans[0]?.plan.monthlyContributions[0]?.amount.amountMinor,
    ).toBe("30000");
  });
  it("does not widen a captured exit cutoff through a later maintenance update", async () => {
    const id = await seedPlans();
    await f.leave();
    const retained = await f.owner.contributionBudgetParticipant.update({
      where: {
        budgetId_membershipId: { budgetId: id, membershipId: f.a.membershipId },
      },
      data: { cutoffVersion: 999 },
    });
    expect(retained.cutoffVersion).toBe(2);
  });
  it("keeps a later member outside the original budget and its version information", async () => {
    await seedPlans();
    await f.leave();
    const actor: AuthContext = {
      ...f.a,
      userId: randomUUID(),
      membershipId: randomUUID(),
      sessionId: randomUUID(),
      grantVersion: 0,
    };
    await f.owner.user.create({ data: { id: actor.userId } });
    await f.owner.membership.create({
      data: {
        id: actor.membershipId,
        userId: actor.userId,
        householdId: f.hh,
        slot: 1,
      },
    });
    await f.owner.sessionRegistry.create({
      data: {
        id: actor.sessionId,
        userId: actor.userId,
        householdId: f.hh,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    try {
      await expect(f.readBudget(actor).catch(databaseErrorCode)).resolves.toBe(
        "P0002",
      );
      await expect(
        f.writeCapacity(999, undefined, actor).catch(databaseErrorCode),
      ).resolves.toBe("P0002");
    } finally {
      await f.owner.sessionRegistry.deleteMany({
        where: { userId: actor.userId },
      });
      await f.owner.membership.delete({ where: { id: actor.membershipId } });
      await f.owner.user.delete({ where: { id: actor.userId } });
    }
  });
  it("removes exclusive plans through the actual repeated deletion lifecycle", async () => {
    const id = await seedPlans();
    await f.owner.contributionBudgetParticipant.delete({
      where: {
        budgetId_membershipId: { budgetId: id, membershipId: f.b.membershipId },
      },
    });
    await purgeFixtureUser(f.runtime, f.a);
    expect(await f.owner.contributionBudget.count({ where: { id } })).toBe(0);
    expect(
      await f.owner.contributionPlan.count({ where: { householdId: f.hh } }),
    ).toBe(0);
  });
  it("prunes unjustified later history and preserves the exact surviving frozen head", async () => {
    const id = await seedPlans();
    await f.leave();
    const frozen = await f.readArchive(id);
    await f.writePlan(2, f.planInput("10000", 1), f.goalId, f.b);
    await changeGoal({ ...f.goalInput, priority: 3 });
    await purgeFixtureUser(f.runtime, f.b);
    expect(await f.readArchive(id)).toEqual(frozen);
    const head = await f.owner.contributionBudget.findUniqueOrThrow({
      where: { id },
    });
    expect(head.version).toBe(2);
    expect(head.updatedAt.toISOString()).toBe(frozen.view.budget.updatedAt);
    expect(
      await f.owner.contributionBudgetRevision.count({
        where: { budgetId: id },
      }),
    ).toBe(2);
    await expect(
      f.owner.contributionBudgetRevision.deleteMany({
        where: { budgetId: id },
      }),
    ).rejects.toThrow();
  });
});
