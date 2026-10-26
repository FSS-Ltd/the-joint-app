import {
  datedContributionInputSchema,
  datedContributionAssessmentSchema,
  monthEndAtOffset,
  type ContributionCapacity,
  type ContributionPlanEntry,
  type DatedContributionAssessment,
  type Money,
} from "@joint/contracts";
import { assessContributionBudget } from "./contribution-budget.js";

export interface DatedContributionInput {
  readonly capacity: ContributionCapacity;
  readonly plans: readonly ContributionPlanEntry[];
}
type Schedule = Pick<
  ContributionCapacity,
  "firstContributionDate" | "monthlyContributions"
>;

function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}
function alignedAmounts(
  schedule: Schedule,
  firstMonth: number,
  count: number,
): Money[] {
  const origin = monthIndex(schedule.firstContributionDate),
    steps = schedule.monthlyContributions;
  let index = -1;
  return Array.from({ length: count }, (_, offset) => {
    let next = steps[index + 1];
    while (next && origin + next.fromMonth - 1 <= firstMonth + offset) {
      index += 1;
      next = steps[index + 1];
    }
    return steps[index]?.amount ?? { amountMinor: "0", currency: "GBP" };
  });
}
function outsideWindow(
  entry: ContributionPlanEntry,
  first: number,
  last: number,
) {
  const origin = monthIndex(entry.plan.firstContributionDate),
    steps = entry.plan.monthlyContributions;
  let beforeWindow = false,
    afterWindow = false;
  for (const [index, step] of steps.entries()) {
    if (step.amount.amountMinor === "0") continue;
    const start = origin + step.fromMonth - 1,
      next = steps[index + 1],
      end = next ? origin + next.fromMonth - 2 : Infinity;
    beforeWindow ||= start < first;
    afterWindow ||= end > last;
  }
  return { goalId: entry.plan.goalId, beforeWindow, afterWindow };
}

/** Assesses only confirmed capacity dates. It neither observes nor moves money. */
export function assessDatedContributions(
  input: DatedContributionInput,
): DatedContributionAssessment {
  const parsed = datedContributionInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid dated contribution input");
  const { capacity, plans } = parsed.data,
    first = monthIndex(capacity.firstContributionDate),
    last = first + capacity.horizonMonths - 1,
    active = plans
      .filter((entry) => entry.status === "ACTIVE")
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          (a.plan.goalId < b.plan.goalId
            ? -1
            : a.plan.goalId > b.plan.goalId
              ? 1
              : 0),
      );
  const assessment = assessContributionBudget({
    capacity: alignedAmounts(capacity, first, capacity.horizonMonths),
    goals: active.map((entry) => ({
      goalId: entry.plan.goalId,
      priority: entry.priority,
      requested: alignedAmounts(entry.plan, first, capacity.horizonMonths),
    })),
  });
  return datedContributionAssessmentSchema.parse({
    ...assessment,
    firstContributionDate: capacity.firstContributionDate,
    lastContributionDate: monthEndAtOffset(
      capacity.firstContributionDate,
      capacity.horizonMonths - 1,
    ),
    months: assessment.months.map((month, index) => ({
      ...month,
      date: monthEndAtOffset(capacity.firstContributionDate, index),
    })),
    unassessed: active
      .map((entry) => outsideWindow(entry, first, last))
      .filter((entry) => entry.beforeWindow || entry.afterWindow),
  });
}
