import { describe, expect, it } from "vitest";
import {
  contributionCapacitySchema,
  contributionPlanWriteSchema,
} from "../packages/contracts/src/contribution-schedules.js";
import {
  contributionBudgetViewSchema,
  contributionRawViewSchema,
} from "../packages/contracts/src/contribution-budget.js";
import {
  contributionRawPageSchema,
  contributionPageSchema,
  contributionQuerySchema,
} from "../packages/contracts/src/contribution-history.js";
import {
  contributionCapacity as capacity,
  contributionEntry,
  contributionGoalA,
  contributionGoalB,
  contributionBudgetId,
  contributionHousehold,
  plannedMoney as money,
} from "./fixtures/contribution-plans.js";

import { budget, plans, raw, view } from "./fixtures/contribution-views.js";

describe("confirmed contribution boundaries", () => {
  it("accepts explicit zero capacity without manufacturing an absent budget", () => {
    expect(contributionCapacitySchema.parse(capacity)).toEqual(capacity);
    expect(
      contributionCapacitySchema.safeParse({
        ...capacity,
        monthlyContributions: [{ fromMonth: 1, amount: money("0") }],
      }).success,
    ).toBe(true);
    expect(contributionCapacitySchema.safeParse(null).success).toBe(false);
    expect(contributionRawViewSchema.parse(raw)).toEqual(raw);
    expect(contributionBudgetViewSchema.parse(view)).toEqual(view);
  });
  it("rejects unknown fields and malformed or unsupported capacity evidence", () => {
    for (const candidate of [
      { ...capacity, accountId: contributionGoalA },
      { ...capacity, income: money("50000") },
      { ...capacity, firstContributionDate: "2026-11-29" },
      { ...capacity, firstContributionDate: "2026-02-29" },
      { ...capacity, firstContributionDate: "9999-12-31", horizonMonths: 2 },
      ...[0, 601, 1.5].map((horizonMonths) => ({ ...capacity, horizonMonths })),
      ...["-1", "01", "PRIVATE_INVALID_AMOUNT", "9223372036854775808"].map(
        (amount) => ({
          ...capacity,
          monthlyContributions: [{ fromMonth: 1, amount: money(amount) }],
        }),
      ),
      {
        ...capacity,
        monthlyContributions: [
          { fromMonth: 1, amount: { amountMinor: "1", currency: "USD" } },
        ],
      },
    ])
      expect(contributionCapacitySchema.safeParse(candidate).success).toBe(
        false,
      );
  });
  it("requires a first change point and rejects gaps at origin, duplicates and out-of-window changes", () => {
    for (const entries of [
      [],
      [{ fromMonth: 2, amount: money("1") }],
      [
        { fromMonth: 1, amount: money("1") },
        { fromMonth: 1, amount: money("2") },
      ],
      [
        { fromMonth: 1, amount: money("1") },
        { fromMonth: 2, amount: money("2") },
      ],
      new Array<unknown>(1),
    ])
      expect(
        contributionCapacitySchema.safeParse({
          ...capacity,
          monthlyContributions: entries,
        }).success,
      ).toBe(false);
    const input = {
      expectedGoalVersion: 1,
      expectedPlanVersion: 0,
      firstContributionDate: capacity.firstContributionDate,
      monthlyContributions: capacity.monthlyContributions,
    };
    expect(contributionPlanWriteSchema.parse(input)).toEqual(input);
    for (const candidate of [
      { ...input, expectedGoalVersion: 0 },
      { ...input, expectedPlanVersion: -1 },
      { ...input, expectedPlanVersion: 2147483648 },
      { ...input, householdId: contributionHousehold },
    ])
      expect(contributionPlanWriteSchema.safeParse(candidate).success).toBe(
        false,
      );
  });
  it("rejects cross-tenant, duplicate and archived active-assessment entries", () => {
    expect(
      contributionRawViewSchema.safeParse({
        ...raw,
        plans: [plans[1]],
        selectedPlan: { ...plans[0], status: "ARCHIVED" },
      }).success,
    ).toBe(true);
    for (const candidate of [
      { ...raw, budget: { ...budget, householdId: contributionGoalA } },
      { ...raw, plans: [plans[0], plans[0]] },
      { ...raw, plans: [{ ...plans[0], status: "ARCHIVED" }] },
      { ...raw, selectedPlan: { ...plans[0], priority: 2 } },
      { ...raw, selectedPlan: { ...plans[0], status: "ARCHIVED" } },
      { ...raw, plans: Array.from({ length: 51 }, () => plans[0]) },
    ])
      expect(contributionRawViewSchema.safeParse(candidate).success).toBe(
        false,
      );
  });
  it("rejects invented money, shifted dates, missing goals and wrong priority order", () => {
    for (const candidate of [
      { ...view, assessment: { ...view.assessment, unfunded: false } },
      {
        ...view,
        assessment: { ...view.assessment, lastContributionDate: "2026-12-31" },
      },
      { ...view, assessment: { ...view.assessment, months: [] } },
      {
        ...view,
        assessment: {
          ...view.assessment,
          months: [{ ...view.assessment.months[0], planned: money("60000") }],
        },
      },
      {
        ...view,
        assessment: {
          ...view.assessment,
          months: [{ ...view.assessment.months[0], shortfall: money("0") }],
        },
      },
      {
        ...view,
        assessment: {
          ...view.assessment,
          months: [
            {
              ...view.assessment.months[0],
              requested: money("PRIVATE_INVALID_AMOUNT"),
            },
          ],
        },
      },
      {
        ...view,
        assessment: {
          ...view.assessment,
          months: [
            {
              ...view.assessment.months[0],
              goals: [...view.assessment.months[0]!.goals].reverse(),
            },
          ],
        },
      },
      {
        ...view,
        assessment: {
          ...view.assessment,
          unassessed: [
            {
              goalId: contributionBudgetId,
              beforeWindow: false,
              afterWindow: true,
            },
          ],
        },
      },
    ])
      expect(contributionBudgetViewSchema.safeParse(candidate).success).toBe(
        false,
      );
  });
  it("keeps immutable history bounded, ordered, within ceiling and tenant matched", () => {
    const history = [1, 2].map((version) => ({
      budgetId: contributionBudgetId,
      householdId: contributionHousehold,
      version,
      createdAt: budget.updatedAt,
      change: { kind: "CAPACITY", capacity },
    }));
    expect(
      contributionRawPageSchema.parse({
        view: raw,
        history,
        nextAfterVersion: null,
      }).history,
    ).toHaveLength(2);
    expect(
      contributionPageSchema.parse({ view, history, nextCursor: null }).history,
    ).toHaveLength(2);
    for (const candidate of [
      { view: raw, history: [...history].reverse(), nextAfterVersion: null },
      { view: raw, history: [history[0], history[0]], nextAfterVersion: null },
      {
        view: raw,
        history: [{ ...history[0], version: 3 }],
        nextAfterVersion: null,
      },
      {
        view: raw,
        history: [{ ...history[0], householdId: contributionGoalA }],
        nextAfterVersion: null,
      },
      { view: raw, history, nextAfterVersion: 2 },
    ])
      expect(contributionRawPageSchema.safeParse(candidate).success).toBe(
        false,
      );
    expect(
      contributionQuerySchema.safeParse({ cursor: "opaque" }).success,
    ).toBe(true);
    expect(contributionQuerySchema.safeParse({ afterVersion: 1 }).success).toBe(
      false,
    );
    const fullHistory = Array.from({ length: 50 }, (_, index) => ({
      budgetId: contributionBudgetId,
      householdId: contributionHousehold,
      version: index + 1,
      createdAt: budget.updatedAt,
      change: { kind: "CAPACITY", capacity },
    }));
    expect(
      contributionRawPageSchema.safeParse({
        view: { ...raw, budget: { ...budget, version: 51 } },
        history: fullHistory,
        nextAfterVersion: 50,
      }).success,
    ).toBe(true);
  });
  it("accepts exact aggregate requests above int64 while keeping each source amount bounded", () => {
    const amount = "9223372036854775807";
    const a = contributionEntry(contributionGoalA, undefined, [[1, amount]]),
      b = contributionEntry(contributionGoalB, undefined, [[1, amount]], 2);
    const large = {
      ...view,
      budget: {
        ...budget,
        capacity: {
          ...capacity,
          monthlyContributions: [{ fromMonth: 1, amount: money(amount) }],
        },
      },
      plans: [a, b],
      selectedPlan: a,
      assessment: {
        ...view.assessment,
        months: [
          {
            month: 1,
            date: "2026-11-30",
            capacity: money(amount),
            requested: money("18446744073709551614"),
            planned: money(amount),
            shortfall: money(amount),
            goals: [
              {
                goalId: contributionGoalA,
                requested: money(amount),
                planned: money(amount),
                shortfall: money("0"),
                status: "FUNDED",
              },
              {
                goalId: contributionGoalB,
                requested: money(amount),
                planned: money("0"),
                shortfall: money(amount),
                status: "UNFUNDED",
              },
            ],
          },
        ],
      },
    };
    expect(contributionBudgetViewSchema.parse(large)).toEqual(large);
  });
});
