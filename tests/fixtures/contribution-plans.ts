import type { ContributionPlanEntry } from "../../packages/contracts/src/contribution-schedules.js";

export const contributionHousehold = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const contributionBudgetId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const contributionGoalA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const contributionGoalB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const plannedMoney = (amountMinor: string) => ({
  amountMinor,
  currency: "GBP" as const,
});
export function contributionEntry(
  goalId = contributionGoalA,
  firstContributionDate = "2026-11-30",
  amounts: readonly [number, string][] = [[1, "30000"]],
  priority = 1,
): ContributionPlanEntry {
  return {
    goalVersion: 1,
    priority,
    status: "ACTIVE",
    plan: {
      schema: "contribution-plan",
      schemaVersion: 1,
      id: goalId,
      householdId: contributionHousehold,
      goalId,
      version: 1,
      firstContributionDate,
      monthlyContributions: amounts.map(([fromMonth, amount]) => ({
        fromMonth,
        amount: plannedMoney(amount),
      })),
    },
  };
}
export const contributionCapacity = {
  firstContributionDate: "2026-11-30",
  horizonMonths: 1,
  monthlyContributions: [{ fromMonth: 1, amount: plannedMoney("50000") }],
};
