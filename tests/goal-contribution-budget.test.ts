import { describe, expect, it } from "vitest";
import { assessContributionBudget } from "../packages/domain/src/goals/contribution-budget.js";
import type { ContributionBudgetInput } from "../packages/domain/src/goals/contribution-budget.js";
const goal1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  goal2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const money = (amountMinor: string) => ({
  amountMinor,
  currency: "GBP" as const,
});
const base: ContributionBudgetInput = {
  capacity: [money("50000")],
  goals: [
    { goalId: goal1, priority: 1, requested: [money("30000")] },
    { goalId: goal2, priority: 2, requested: [money("30000")] },
  ],
};
describe("finite shared planned contribution budget", () => {
  it("shares £500 across two £300 requests and preserves the unfunded intention", () => {
    const original = structuredClone(base),
      result = assessContributionBudget(base);
    expect(result).toEqual({
      unfunded: true,
      months: [
        {
          month: 1,
          capacity: money("50000"),
          requested: money("60000"),
          planned: money("50000"),
          shortfall: money("10000"),
          goals: [
            {
              goalId: goal1,
              requested: money("30000"),
              planned: money("30000"),
              shortfall: money("0"),
              status: "FUNDED",
            },
            {
              goalId: goal2,
              requested: money("30000"),
              planned: money("20000"),
              shortfall: money("10000"),
              status: "UNFUNDED",
            },
          ],
        },
      ],
    });
    expect(base).toEqual(original);
  });
  it("uses persisted priorities and stable UUID ties rather than input order", () => {
    const swapped = {
      ...base,
      goals: base.goals.map((g) => ({
        ...g,
        priority: g.priority === 1 ? 2 : 1,
      })),
    };
    expect(assessContributionBudget(swapped).months[0]?.goals[0]?.goalId).toBe(
      goal2,
    );
    const tied = {
      ...base,
      goals: base.goals.map((g) => ({ ...g, priority: 1 })),
    };
    expect(assessContributionBudget(tied)).toEqual(
      assessContributionBudget({ ...tied, goals: [...tied.goals].reverse() }),
    );
    expect(assessContributionBudget(tied).months[0]?.goals[0]?.goalId).toBe(
      goal1,
    );
  });
  it("handles empty, zero and changing requests without inventing transactions", () => {
    expect(
      assessContributionBudget({ capacity: [money("0")], goals: [] }),
    ).toEqual({
      unfunded: false,
      months: [
        {
          month: 1,
          capacity: money("0"),
          requested: money("0"),
          planned: money("0"),
          shortfall: money("0"),
          goals: [],
        },
      ],
    });
    const result = assessContributionBudget({
      capacity: [money("0"), money("100"), money("50")],
      goals: [
        {
          goalId: goal1,
          priority: 1,
          requested: [money("0"), money("80"), money("100")],
        },
      ],
    });
    expect(result.months.map((m) => m.planned.amountMinor)).toEqual([
      "0",
      "80",
      "50",
    ]);
    expect(result.months.map((m) => m.shortfall.amountMinor)).toEqual([
      "0",
      "0",
      "50",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/observed|transaction|balance/i);
  });
  it("keeps aggregate requests beyond int64 exact and conserves every minor unit", () => {
    const amount = "9223372036854775807";
    const result = assessContributionBudget({
      capacity: [money(amount)],
      goals: base.goals.map((g) => ({ ...g, requested: [money(amount)] })),
    });
    expect(result.months[0]).toMatchObject({
      requested: money("18446744073709551614"),
      planned: money(amount),
      shortfall: money(amount),
    });
  });
  it("evaluates 600 months deterministically with conservation of value", () => {
    const input = {
      capacity: Array.from({ length: 600 }, (_, i) => money(String(i % 7))),
      goals: base.goals.map((g) => ({
        ...g,
        requested: Array.from({ length: 600 }, (_, i) =>
          money(String((i + g.priority) % 5)),
        ),
      })),
    };
    const result = assessContributionBudget(input);
    expect(result.months).toHaveLength(600);
    expect(result).toEqual(
      assessContributionBudget({ ...input, goals: [...input.goals].reverse() }),
    );
    for (const month of result.months) {
      expect(BigInt(month.planned.amountMinor)).toBeLessThanOrEqual(
        BigInt(month.capacity.amountMinor),
      );
      expect(
        BigInt(month.planned.amountMinor) + BigInt(month.shortfall.amountMinor),
      ).toBe(BigInt(month.requested.amountMinor));
      for (const goal of month.goals)
        expect(
          BigInt(goal.planned.amountMinor) + BigInt(goal.shortfall.amountMinor),
        ).toBe(BigInt(goal.requested.amountMinor));
    }
  });
  it("rejects invalid horizons, priorities and duplicate canonical identities safely", () => {
    for (const input of [
      { ...base, capacity: [] },
      { ...base, capacity: Array.from({ length: 601 }, () => money("0")) },
      { ...base, goals: [{ goalId: goal1, priority: 1, requested: [] }] },
      ...[0, 1001, 1.5, NaN].map((priority) => ({
        ...base,
        goals: [{ goalId: goal1, priority, requested: [money("1")] }],
      })),
      {
        ...base,
        goals: [
          { goalId: "SECRET_BAD_ID", priority: 1, requested: [money("1")] },
        ],
      },
      {
        ...base,
        goals: [
          { goalId: goal1, priority: 1, requested: [money("1")] },
          { goalId: goal1.toUpperCase(), priority: 2, requested: [money("1")] },
        ],
      },
    ])
      expect(() => assessContributionBudget(input)).toThrow(
        /^Invalid contribution budget input$/,
      );
  });
  it("rejects negative, unsupported or malformed money without logging input values", () => {
    for (const value of [
      money("-1"),
      money("PRIVATE_BAD_AMOUNT"),
      money("9223372036854775808"),
      { amountMinor: "1", currency: "USD" },
    ]) {
      expect(() =>
        assessContributionBudget({ ...base, capacity: [value] }),
      ).toThrow(/^Invalid contribution budget input$/);
      expect(() =>
        assessContributionBudget({
          ...base,
          goals: [{ goalId: goal1, priority: 1, requested: [value] }],
        }),
      ).toThrow(/^Invalid contribution budget input$/);
    }
  });
});
