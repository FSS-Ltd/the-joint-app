import {
  contributionCapacity as capacity,
  contributionEntry,
  contributionGoalA,
  contributionGoalB,
  contributionBudgetId,
  contributionHousehold,
  plannedMoney as money,
} from "./contribution-plans.js";

export const plans = [
  contributionEntry(),
  contributionEntry(contributionGoalB, undefined, undefined, 2),
];
export const budget = {
  schema: "contribution-budget",
  schemaVersion: 1,
  id: contributionBudgetId,
  householdId: contributionHousehold,
  version: 2,
  updatedAt: "2026-10-26T20:00:00.000Z",
  capacity,
};
export const raw = { budget, plans, selectedPlan: plans[0] };
export const view = {
  ...raw,
  assessment: {
    unfunded: true,
    firstContributionDate: "2026-11-30",
    lastContributionDate: "2026-11-30",
    unassessed: plans.map(({ plan }) => ({
      goalId: plan.goalId,
      beforeWindow: false,
      afterWindow: true,
    })),
    months: [
      {
        month: 1,
        date: "2026-11-30",
        capacity: money("50000"),
        requested: money("60000"),
        planned: money("50000"),
        shortfall: money("10000"),
        goals: [
          {
            goalId: contributionGoalA,
            requested: money("30000"),
            planned: money("30000"),
            shortfall: money("0"),
            status: "FUNDED",
          },
          {
            goalId: contributionGoalB,
            requested: money("30000"),
            planned: money("20000"),
            shortfall: money("10000"),
            status: "UNFUNDED",
          },
        ],
      },
    ],
  },
};
