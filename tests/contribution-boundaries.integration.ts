import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { databaseErrorCode } from "../apps/api/src/database-error.js";
import { createContributionFixture } from "./fixtures/contribution-budget.js";
import { contributionCapacity as capacity } from "./fixtures/contribution-plans.js";

let f: ReturnType<typeof createContributionFixture>;
beforeEach(async () => {
  f = createContributionFixture();
  await f.setup();
});
afterEach(() => f.close());

it("bounds active requests to fifty and releases a slot only when a goal is archived", async () => {
  await f.writeCapacity();
  const goals = [f.goalId, f.otherGoalId];
  for (let index = 2; index < 51; index += 1) {
    const id = randomUUID();
    await f.scoped.withScope(
      f.a,
      (tx) =>
        tx.$queryRaw`SELECT app.write_goal(${id}::uuid,0,${JSON.stringify(f.goalInput)}::jsonb)`,
    );
    goals.push(id);
  }
  for (const [index, id] of goals.slice(0, 50).entries())
    await f.writePlan(index + 1, f.planInput("1"), id);
  const before = await f.readBudget();
  await expect(
    f.writePlan(51, f.planInput("1"), goals[50]).catch(databaseErrorCode),
  ).resolves.toBe("P0001");
  expect(await f.readBudget()).toEqual(before);
  const archived = { ...f.goalInput, status: "ARCHIVED" };
  await f.scoped.withScope(
    f.a,
    (tx) =>
      tx.$queryRaw`SELECT app.write_goal(${f.goalId}::uuid,1,${JSON.stringify(archived)}::jsonb)`,
  );
  const result = await f.writePlan(52, f.planInput("1"), goals[50]);
  expect(result.budget.version).toBe(53);
  expect(result.plans).toHaveLength(50);
  const history = await f.readBudget(f.b, f.goalId);
  expect(history.view.selectedPlan?.status).toBe("ARCHIVED");
  expect(history.history.map((revision) => revision.version)).toEqual([
    1, 2, 52,
  ]);
});

it("rejects malformed SQL change points without creating partial capacity or history", async () => {
  const amount = { amountMinor: "1", currency: "GBP" };
  const invalid = [
    null,
    [],
    [{ fromMonth: 2, amount }],
    [
      { fromMonth: 1, amount },
      { fromMonth: 1, amount },
    ],
    [
      { fromMonth: 1, amount },
      { fromMonth: 3, amount },
      { fromMonth: 2, amount },
    ],
    [{ fromMonth: 1.5, amount }],
    [{ fromMonth: "1", amount }],
    [{ fromMonth: 1, amount: { ...amount, currency: "EUR" } }],
    [{ fromMonth: 1, amount: { ...amount, amountMinor: "01" } }],
    [{ fromMonth: 1, amount: { ...amount, amountMinor: "1.5" } }],
    [{ fromMonth: 1, amount: { ...amount, amountMinor: 1 } }],
    [{ fromMonth: 1, amount: { ...amount, extra: true } }],
    [{ fromMonth: 1, amount, extra: true }],
    [
      { fromMonth: 1, amount },
      { fromMonth: 601, amount },
    ],
  ];
  for (const monthlyContributions of invalid)
    await expect(
      f
        .writeCapacity(0, { ...capacity, monthlyContributions })
        .catch(databaseErrorCode),
    ).resolves.toBe("22023");
  await expect(
    f
      .writeCapacity(0, {
        ...capacity,
        horizonMonths: 1,
        monthlyContributions: [
          { fromMonth: 1, amount },
          { fromMonth: 2, amount },
        ],
      })
      .catch(databaseErrorCode),
  ).resolves.toBe("22023");
  expect(
    await f.owner.contributionBudget.count({ where: { householdId: f.hh } }),
  ).toBe(0);
  await f.writeCapacity();
  for (const monthlyContributions of invalid)
    await expect(
      f
        .writePlan(1, { ...f.planInput(), monthlyContributions })
        .catch(databaseErrorCode),
    ).resolves.toBe("22023");
  expect((await f.readBudget()).history).toHaveLength(1);
});
