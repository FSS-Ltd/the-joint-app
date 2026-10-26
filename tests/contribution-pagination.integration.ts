import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ContributionService } from "../apps/api/src/modules/goals/contributions/contribution.service.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { createContributionFixture } from "./fixtures/contribution-budget.js";
import { contributionCapacity } from "./fixtures/contribution-plans.js";

let f: ReturnType<typeof createContributionFixture>,
  service: ContributionService;
beforeEach(async () => {
  f = createContributionFixture();
  await f.setup();
  const key = randomBytes(32).toString("base64");
  service = new ContributionService(
    f.scoped,
    f.archive,
    new IdentityVault(key, key),
  );
});
afterEach(() => f.close());

it("pages captured archive IDs with sealed continuation and current session authorization", async () => {
  const households: string[] = [],
    budgets: string[] = [];
  try {
    for (let index = 0; index < 52; index += 1) {
      const householdId = randomUUID(),
        budgetId = randomUUID(),
        membershipId = randomUUID();
      households.push(householdId);
      budgets.push(budgetId);
      await f.owner.household.create({ data: { id: householdId } });
      await f.owner.membership.create({
        data: {
          id: membershipId,
          householdId,
          userId: f.a.userId,
          status: "LEFT",
          slot: null,
        },
      });
      await f.owner.contributionBudget.create({
        data: {
          id: budgetId,
          householdId,
          participants: { create: { membershipId, cutoffVersion: 1 } },
        },
      });
      const change = JSON.stringify({
        kind: "CAPACITY",
        capacity: contributionCapacity,
      });
      await f.owner
        .$executeRaw`SELECT app.record_contribution_revision(${budgetId}::uuid,0,NULL,${change}::jsonb)`;
    }
    const first = await service.listArchive(f.a),
      cursor = first.nextCursor ?? "";
    expect(first.budgets).toHaveLength(50);
    expect(cursor).toBeTruthy();
    const next = await service.listArchive(f.a, cursor);
    expect(next.budgets).toHaveLength(2);
    expect(next.nextCursor).toBeNull();
    expect(
      [...first.budgets, ...next.budgets].map((entry) => entry.id),
    ).toEqual(budgets.sort());
    await expect(service.listArchive(f.b, cursor)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      service.historyArchive(f.a, budgets[0] ?? "", undefined, cursor),
    ).rejects.toMatchObject({ status: 400 });
    await f.owner.sessionRegistry.update({
      where: { id: f.a.sessionId },
      data: { revokedAt: new Date() },
    });
    await expect(service.listArchive(f.a, cursor)).rejects.toMatchObject({
      status: 404,
    });
  } finally {
    await f.owner.household.deleteMany({ where: { id: { in: households } } });
  }
});

it("maps the actual active-plan limit into an actionable safe conflict", async () => {
  await f.writeCapacity();
  for (let index = 0; index < 50; index += 1) {
    const goalId = randomUUID();
    await f.scoped.withScope(
      f.a,
      (tx) =>
        tx.$queryRaw`SELECT app.write_goal(${goalId}::uuid,0,${JSON.stringify(f.goalInput)}::jsonb)`,
    );
    await f.writePlan(index + 1, f.planInput("1"), goalId);
  }
  await expect(
    service.writePlan(f.a, f.goalId, 51, f.planInput(), randomUUID()),
  ).rejects.toMatchObject({
    status: 409,
    response: { error: { code: "CONTRIBUTION_PLAN_LIMIT" } },
  });
  expect((await f.readBudget()).view.budget.version).toBe(51);
});
