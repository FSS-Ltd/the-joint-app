import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContributionFixture } from "./fixtures/contribution-budget.js";
import { contributionCapacity as capacity } from "./fixtures/contribution-plans.js";
import { databaseErrorCode } from "../apps/api/src/database-error.js";
import { assessDatedContributions } from "../packages/domain/dist/goals/index.js";

let f: ReturnType<typeof createContributionFixture>;
beforeEach(async () => {
  f = createContributionFixture();
  await f.setup();
});
afterEach(() => f.close());

describe("atomic shared contribution writes", () => {
  it("captures both adults, preserves £600 of requests against £500 and changes no source records", async () => {
    const source = async () =>
      Promise.all([
        f.owner.account.findMany({
          where: { householdId: f.hh },
          orderBy: { id: "asc" },
        }),
        f.owner.balanceSnapshot.findMany({
          where: { householdId: f.hh },
          orderBy: { id: "asc" },
        }),
        f.owner.transaction.findMany({
          where: { householdId: f.hh },
          orderBy: { id: "asc" },
        }),
      ]);
    const before = await source();
    const initial = await f.writeCapacity();
    expect(initial.budget.version).toBe(1);
    expect(initial.plans).toEqual([]);
    expect((await f.writePlan(1)).budget.version).toBe(2);
    const shared = await f.writePlan(2, f.planInput(), f.otherGoalId, f.b);
    expect(shared.budget.version).toBe(3);
    const assessment = assessDatedContributions({
      capacity: shared.budget.capacity,
      plans: shared.plans,
    });
    expect(assessment.months[0]).toMatchObject({
      requested: { amountMinor: "60000" },
      planned: { amountMinor: "50000" },
      shortfall: { amountMinor: "10000" },
    });
    expect(
      assessment.months[0]?.goals.map((goal) => goal.planned.amountMinor),
    ).toEqual(["30000", "20000"]);
    expect((await f.readBudget(f.b)).view).toEqual({
      ...shared,
      selectedPlan: null,
    });
    const participants = await f.owner.$queryRaw<
      { membershipId: string; cutoffVersion: number | null }[]
    >`
      SELECT "membershipId","cutoffVersion" FROM app."ContributionBudgetParticipant" WHERE "budgetId"=${shared.budget.id}::uuid`;
    expect(participants.map((entry) => entry.membershipId).sort()).toEqual(
      [f.a.membershipId, f.b.membershipId].sort(),
    );
    expect(participants.every((entry) => entry.cutoffVersion === null)).toBe(
      true,
    );
    expect(await source()).toEqual(before);
  });
  it("serializes competing writes and keeps the losing batch entirely unchanged", async () => {
    await f.writeCapacity();
    const results = await Promise.allSettled([
      f.writePlan(1),
      f.writePlan(1, f.planInput(), f.otherGoalId, f.b),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.flatMap((result) =>
        result.status === "rejected" ? [databaseErrorCode(result.reason)] : [],
      ),
    ).toEqual(["40001"]);
    const page = await f.readBudget();
    expect(page.view.budget.version).toBe(2);
    expect(page.view.plans).toHaveLength(1);
    expect(page.history.map((entry) => entry.version)).toEqual([1, 2]);
  });
  it("preserves plans after a capacity drop and records no unchanged intention", async () => {
    const initial = await f.writeCapacity();
    expect(await f.writeCapacity(1, capacity, f.b)).toEqual(initial);
    const plan = await f.writePlan(1);
    expect(
      await f.writePlan(2, f.planInput("30000", 1), f.goalId, f.b),
    ).toEqual(plan);
    const zero = await f.writeCapacity(2, {
      ...capacity,
      monthlyContributions: [
        { fromMonth: 1, amount: { amountMinor: "0", currency: "GBP" } },
      ],
    });
    const assessment = assessDatedContributions({
      capacity: zero.budget.capacity,
      plans: zero.plans,
    });
    expect(assessment).toMatchObject({
      unfunded: true,
      months: [
        {
          requested: { amountMinor: "30000" },
          planned: { amountMinor: "0" },
          shortfall: { amountMinor: "30000" },
        },
      ],
    });
    expect((await f.readBudget()).history).toHaveLength(3);
  });
  it("rejects stale goal/plan/budget versions without changing the immutable head", async () => {
    await f.writeCapacity();
    await f.writePlan(1);
    const before = await f.readBudget();
    for (const promise of [
      () => f.writeCapacity(1),
      () => f.writePlan(2, f.planInput("1", 0)),
      () => f.writePlan(2, { ...f.planInput("1", 1), expectedGoalVersion: 2 }),
    ])
      await expect(promise().catch(databaseErrorCode)).resolves.toBe("40001");
    expect(await f.readBudget()).toEqual(before);
  });
  it("denies nonexistent/cross-tenant goals before revealing plan state", async () => {
    const foreign = createContributionFixture();
    await foreign.setup();
    try {
      await f.writeCapacity();
      for (const goalId of [randomUUID(), foreign.goalId]) {
        await expect(
          f.writePlan(1, f.planInput(), goalId).catch(databaseErrorCode),
        ).resolves.toBe("P0002");
        await expect(
          f.readBudget(f.b, goalId).catch(databaseErrorCode),
        ).resolves.toBe("P0002");
      }
      expect((await f.readBudget()).history).toHaveLength(1);
    } finally {
      await foreign.close();
    }
  });
  it("does not attach a goal hidden from another captured budget participant", async () => {
    await f.owner.goalParticipant.delete({
      where: {
        goalId_membershipId: {
          goalId: f.goalId,
          membershipId: f.b.membershipId,
        },
      },
    });
    await f.writeCapacity();
    await expect(f.writePlan(1).catch(databaseErrorCode)).resolves.toBe(
      "P0002",
    );
    expect((await f.readBudget()).view.plans).toEqual([]);
  });
  it("blocks legacy activation without fabricating an initial budget", async () => {
    await f.owner.contributionPlan.create({
      data: {
        householdId: f.hh,
        goalId: f.goalId,
        firstContributionDate: new Date("2026-11-30"),
      },
    });
    await expect(f.writeCapacity().catch(databaseErrorCode)).resolves.toBe(
      "P0002",
    );
    const [row] = await f.owner.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) AS count FROM app."ContributionBudget" WHERE "householdId"=${f.hh}::uuid`;
    expect(row?.count).toBe(0n);
  });
  it("validates capacity and plan shapes independently in SQL", async () => {
    for (const input of [
      { ...capacity, horizonMonths: 0 },
      { ...capacity, firstContributionDate: "2026-02-29" },
      { ...capacity, horizonMonths: 601 },
      { ...capacity, extra: true },
      {
        ...capacity,
        monthlyContributions: [
          { fromMonth: 1, amount: { amountMinor: "-1", currency: "GBP" } },
        ],
      },
      {
        ...capacity,
        monthlyContributions: [
          {
            fromMonth: 1,
            amount: { amountMinor: "9223372036854775808", currency: "GBP" },
          },
        ],
      },
    ])
      await expect(
        f.writeCapacity(0, input).catch(databaseErrorCode),
      ).resolves.toBe("22023");
    await f.writeCapacity();
    for (const input of [
      { ...f.planInput(), expectedPlanVersion: -1 },
      { ...f.planInput(), expectedGoalVersion: 0 },
      { ...f.planInput(), firstContributionDate: "9999-12-31" },
      { ...f.planInput(), extra: true },
      {
        ...f.planInput(),
        monthlyContributions: [
          { fromMonth: 2, amount: { amountMinor: "1", currency: "GBP" } },
        ],
      },
    ])
      await expect(
        f.writePlan(1, input).catch(databaseErrorCode),
      ).resolves.toBe("22023");
    expect((await f.readBudget()).history).toHaveLength(1);
  });
});
