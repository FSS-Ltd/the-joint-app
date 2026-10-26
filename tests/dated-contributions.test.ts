import { describe, expect, it } from "vitest";
import { assessDatedContributions } from "../packages/domain/src/goals/dated-contributions.js";
import {
  contributionCapacity as capacity,
  contributionEntry,
  contributionGoalA,
  contributionGoalB,
  plannedMoney as money,
} from "./fixtures/contribution-plans.js";

describe("dated shared contribution assessment", () => {
  it("shares one £500 capacity between two £300 plans without altering either request", () => {
    const input = {
      capacity,
      plans: [
        contributionEntry(),
        contributionEntry(contributionGoalB, undefined, undefined, 2),
      ],
    };
    const original = structuredClone(input);
    const result = assessDatedContributions(input);
    expect(result).toMatchObject({
      unfunded: true,
      firstContributionDate: "2026-11-30",
      lastContributionDate: "2026-11-30",
      months: [
        {
          date: "2026-11-30",
          capacity: money("50000"),
          requested: money("60000"),
          planned: money("50000"),
          shortfall: money("10000"),
          goals: [
            {
              goalId: contributionGoalA,
              planned: money("30000"),
              shortfall: money("0"),
            },
            {
              goalId: contributionGoalB,
              planned: money("20000"),
              shortfall: money("10000"),
            },
          ],
        },
      ],
      unassessed: [
        { goalId: contributionGoalA, beforeWindow: false, afterWindow: true },
        { goalId: contributionGoalB, beforeWindow: false, afterWindow: true },
      ],
    });
    expect(input).toEqual(original);
  });
  it("uses saved priorities and canonical UUID ties independently of input order", () => {
    const a = contributionEntry(),
      b = contributionEntry(contributionGoalB);
    const tied = assessDatedContributions({ capacity, plans: [b, a] });
    expect(
      tied.months[0]?.goals.map((entry) => entry.planned.amountMinor),
    ).toEqual(["30000", "20000"]);
    expect(tied).toEqual(assessDatedContributions({ capacity, plans: [a, b] }));
    const changed = assessDatedContributions({
      capacity,
      plans: [{ ...a, priority: 2 }, b],
    });
    expect(changed.months[0]?.goals[0]?.goalId).toBe(contributionGoalB);
  });
  it("carries earlier schedule changes into the window instead of restarting the plan", () => {
    const plan = contributionEntry(contributionGoalA, "2026-09-30", [
      [1, "10"],
      [3, "30"],
      [4, "40"],
    ]);
    const result = assessDatedContributions({
      capacity: { ...capacity, horizonMonths: 2 },
      plans: [plan],
    });
    expect(result.months.map((month) => month.requested.amountMinor)).toEqual([
      "30",
      "40",
    ]);
    expect(result.months.map((month) => month.date)).toEqual([
      "2026-11-30",
      "2026-12-31",
    ]);
    expect(result.unassessed).toEqual([
      { goalId: contributionGoalA, beforeWindow: true, afterWindow: true },
    ]);
  });
  it("retains a later start and reports requests beyond the confirmed window as unassessed", () => {
    const plan = contributionEntry(contributionGoalA, "2027-01-31", [
      [1, "70"],
    ]);
    const input = {
      capacity: { ...capacity, horizonMonths: 2 },
      plans: [plan],
    };
    expect(assessDatedContributions(input)).toMatchObject({
      unfunded: false,
      lastContributionDate: "2026-12-31",
      unassessed: [
        { goalId: contributionGoalA, beforeWindow: false, afterWindow: true },
      ],
    });
    expect(
      assessDatedContributions(input).months.map(
        (month) => month.requested.amountMinor,
      ),
    ).toEqual(["0", "0"]);
    const expanded = assessDatedContributions({
      ...input,
      capacity: { ...capacity, horizonMonths: 3 },
    });
    expect(expanded.months.map((month) => month.requested.amountMinor)).toEqual(
      ["0", "0", "70"],
    );
    expect(plan.plan.firstContributionDate).toBe("2027-01-31");
  });
  it("distinguishes ceased earlier requests from zero-only and continuing schedules", () => {
    const result = assessDatedContributions({
      capacity,
      plans: [
        contributionEntry(contributionGoalA, "2026-09-30", [
          [1, "10"],
          [3, "0"],
        ]),
        contributionEntry(contributionGoalB, "2026-09-30", [[1, "0"]]),
      ],
    });
    expect(result.months[0]?.requested).toEqual(money("0"));
    expect(result.unassessed).toEqual([
      { goalId: contributionGoalA, beforeWindow: true, afterWindow: false },
    ]);
  });
  it("aligns capacity changes and leap February using calendar dates", () => {
    const result = assessDatedContributions({
      capacity: {
        firstContributionDate: "2023-11-30",
        horizonMonths: 4,
        monthlyContributions: [
          [1, "50"],
          [2, "20"],
          [4, "0"],
        ].map(([fromMonth, amount]) => ({
          fromMonth: Number(fromMonth),
          amount: money(String(amount)),
        })),
      },
      plans: [contributionEntry(contributionGoalA, "2023-11-30", [[1, "30"]])],
    });
    expect(result.months.map((month) => month.date)).toEqual([
      "2023-11-30",
      "2023-12-31",
      "2024-01-31",
      "2024-02-29",
    ]);
    expect(result.months.map((month) => month.planned.amountMinor)).toEqual([
      "30",
      "20",
      "20",
      "0",
    ]);
    expect(result.months.map((month) => month.shortfall.amountMinor)).toEqual([
      "0",
      "10",
      "10",
      "30",
    ]);
  });
  it("preserves deficits after zero capacity and excludes archived requests", () => {
    const zero = {
      ...capacity,
      monthlyContributions: [{ fromMonth: 1, amount: money("0") }],
    };
    const plan = contributionEntry();
    expect(
      assessDatedContributions({ capacity: zero, plans: [plan] }).months[0],
    ).toMatchObject({
      requested: money("30000"),
      planned: money("0"),
      shortfall: money("30000"),
    });
    const archived = assessDatedContributions({
      capacity: zero,
      plans: [{ ...plan, status: "ARCHIVED" }],
    });
    expect(archived).toMatchObject({ unfunded: false, unassessed: [] });
    expect(archived.months[0]?.goals).toEqual([]);
    expect(
      assessDatedContributions({ capacity, plans: [] }).months[0]?.requested,
    ).toEqual(money("0"));
  });
  it.each([
    ["0001-01-31", "0001-02-28"],
    ["0004-01-31", "0004-02-29"],
    ["1900-01-31", "1900-02-28"],
    ["2000-01-31", "2000-02-29"],
    ["2100-01-31", "2100-02-28"],
    ["2400-01-31", "2400-02-29"],
  ])(
    "respects Gregorian February from %s",
    (firstContributionDate, lastContributionDate) => {
      const result = assessDatedContributions({
        capacity: { ...capacity, firstContributionDate, horizonMonths: 2 },
        plans: [],
      });
      expect(result.lastContributionDate).toBe(lastContributionDate);
      expect(result.months.map((month) => month.date)).toEqual([
        firstContributionDate,
        lastContributionDate,
      ]);
    },
  );
  it("keeps aggregate requests above int64 exact across a 600-month window", () => {
    const largest = "9223372036854775807";
    const result = assessDatedContributions({
      capacity: {
        ...capacity,
        horizonMonths: 600,
        monthlyContributions: [{ fromMonth: 1, amount: money(largest) }],
      },
      plans: [
        contributionEntry(contributionGoalA, undefined, [[1, largest]]),
        contributionEntry(contributionGoalB, undefined, [[1, largest]]),
      ],
    });
    expect(result.months).toHaveLength(600);
    expect(result.lastContributionDate).toBe("2076-10-31");
    expect(result.months[599]).toMatchObject({
      requested: money("18446744073709551614"),
      planned: money(largest),
      shortfall: money(largest),
    });
  });
  it("fails invalid evidence safely instead of treating it as zero", () => {
    const valid = { capacity, plans: [contributionEntry()] };
    for (const input of [
      { ...valid, capacity: null },
      { ...valid, plans: new Array<unknown>(1) },
      { ...valid, plans: [valid.plans[0], valid.plans[0]] },
      {
        ...valid,
        capacity: {
          ...capacity,
          monthlyContributions: [
            { fromMonth: 1, amount: money("PRIVATE_INVALID_AMOUNT") },
          ],
        },
      },
      {
        ...valid,
        capacity: {
          ...capacity,
          monthlyContributions: [
            { fromMonth: 1, amount: { amountMinor: "1", currency: "USD" } },
          ],
        },
      },
    ])
      expect(() =>
        Reflect.apply(assessDatedContributions, undefined, [input]),
      ).toThrow(/^Invalid dated contribution input$/);
  });
});
