import {
  idempotencyKeySchema,
  moneySchema,
  type AggregateMoney,
  type Money,
} from "@joint/contracts";
import type { SourceMoney } from "./funding-types.js";

export interface ContributionBudgetInput {
  readonly capacity: readonly SourceMoney[];
  readonly goals: readonly {
    readonly goalId: string;
    readonly priority: number;
    readonly requested: readonly SourceMoney[];
  }[];
}
export interface ContributionBudgetAssessment {
  unfunded: boolean;
  months: {
    month: number;
    capacity: Money;
    requested: AggregateMoney;
    planned: Money;
    shortfall: AggregateMoney;
    goals: {
      goalId: string;
      requested: Money;
      planned: Money;
      shortfall: Money;
      status: "FUNDED" | "UNFUNDED";
    }[];
  }[];
}
function invalid(): never {
  throw new Error("Invalid contribution budget input");
}
function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
function minor(value: unknown): bigint {
  const parsed = moneySchema.safeParse(value);
  if (!parsed.success) return invalid();
  const amount = BigInt(parsed.data.amountMinor);
  return amount >= 0n ? amount : invalid();
}
function amountMoney(value: bigint): AggregateMoney {
  return { amountMinor: value.toString(), currency: "GBP" };
}

/** Prioritizes proposed contributions only; it neither observes nor moves money. Vectors must already share a calendar. */
export function assessContributionBudget(
  input: ContributionBudgetInput,
): ContributionBudgetAssessment {
  if (
    !isList(input.capacity) ||
    input.capacity.length < 1 ||
    input.capacity.length > 600 ||
    !isList(input.goals)
  )
    return invalid();
  const capacity = Array.from(input.capacity, minor);
  const goals = Array.from(input.goals, (goal) => {
    if (!goal || typeof goal !== "object") return invalid();
    if (
      !idempotencyKeySchema.safeParse(goal.goalId).success ||
      !Number.isInteger(goal.priority) ||
      goal.priority < 1 ||
      goal.priority > 1000 ||
      !isList(goal.requested) ||
      goal.requested.length !== capacity.length
    )
      return invalid();
    return {
      goalId: goal.goalId.toLowerCase(),
      priority: goal.priority,
      requested: Array.from(goal.requested, minor),
    };
  });
  if (new Set(goals.map((goal) => goal.goalId)).size !== goals.length)
    return invalid();
  goals.sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.goalId < b.goalId ? -1 : a.goalId > b.goalId ? 1 : 0),
  );
  const months = capacity.map((available, index) => {
    let remaining = available,
      requested = 0n;
    const rows = goals.map((goal) => {
      const amount = goal.requested[index];
      if (amount === undefined) return invalid();
      const planned = amount < remaining ? amount : remaining;
      remaining -= planned;
      requested += amount;
      const status: "FUNDED" | "UNFUNDED" =
        amount === planned ? "FUNDED" : "UNFUNDED";
      return {
        goalId: goal.goalId,
        requested: amountMoney(amount),
        planned: amountMoney(planned),
        shortfall: amountMoney(amount - planned),
        status,
      };
    });
    const planned = available - remaining;
    return {
      month: index + 1,
      capacity: amountMoney(available),
      requested: amountMoney(requested),
      planned: amountMoney(planned),
      shortfall: amountMoney(requested - planned),
      goals: rows,
    };
  });
  return {
    unfunded: months.some((month) => BigInt(month.shortfall.amountMinor) > 0n),
    months,
  };
}
