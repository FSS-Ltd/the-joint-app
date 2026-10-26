import { z } from "zod";
import { aggregateMoneySchema } from "./reporting-primitives.js";
import {
  monthEndAtOffset,
  monthEndDateSchema,
  nonnegativeMoneySchema,
} from "./projection-primitives.js";

const aggregate = aggregateMoneySchema.refine(
  (value) => !value.amountMinor.startsWith("-"),
);
const goal = z
  .object({
    goalId: z.uuid(),
    requested: nonnegativeMoneySchema,
    planned: nonnegativeMoneySchema,
    shortfall: nonnegativeMoneySchema,
    status: z.enum(["FUNDED", "UNFUNDED"]),
  })
  .strict();
const month = z
  .object({
    month: z.number().int().min(1).max(600),
    date: monthEndDateSchema,
    capacity: nonnegativeMoneySchema,
    requested: aggregate,
    planned: nonnegativeMoneySchema,
    shortfall: aggregate,
    goals: z.array(goal).max(50),
  })
  .strict();

function conserved(value: z.infer<typeof month>): boolean {
  const values = [
    value.capacity,
    value.requested,
    value.planned,
    value.shortfall,
    ...value.goals.flatMap((entry) => [
      entry.requested,
      entry.planned,
      entry.shortfall,
    ]),
  ];
  if (!values.every((money) => /^(0|[1-9]\d{0,39})$/.test(money.amountMinor)))
    return false;
  let requested = 0n,
    planned = 0n,
    shortfall = 0n;
  for (const entry of value.goals) {
    const r = BigInt(entry.requested.amountMinor),
      p = BigInt(entry.planned.amountMinor),
      s = BigInt(entry.shortfall.amountMinor);
    if (r !== p + s || (s === 0n) !== (entry.status === "FUNDED")) return false;
    requested += r;
    planned += p;
    shortfall += s;
  }
  return (
    new Set(value.goals.map((entry) => entry.goalId)).size ===
      value.goals.length &&
    requested === BigInt(value.requested.amountMinor) &&
    planned === BigInt(value.planned.amountMinor) &&
    shortfall === BigInt(value.shortfall.amountMinor) &&
    planned <= BigInt(value.capacity.amountMinor)
  );
}
export const datedContributionAssessmentSchema = z
  .object({
    unfunded: z.boolean(),
    firstContributionDate: monthEndDateSchema,
    lastContributionDate: monthEndDateSchema,
    months: z.array(month).min(1).max(600),
    unassessed: z
      .array(
        z
          .object({
            goalId: z.uuid(),
            beforeWindow: z.boolean(),
            afterWindow: z.boolean(),
          })
          .strict()
          .refine((value) => value.beforeWindow || value.afterWindow),
      )
      .max(50),
  })
  .strict()
  .refine(
    (value) =>
      value.lastContributionDate ===
        monthEndAtOffset(
          value.firstContributionDate,
          value.months.length - 1,
        ) &&
      value.months.every(
        (entry, index) =>
          entry.month === index + 1 &&
          entry.date === monthEndAtOffset(value.firstContributionDate, index) &&
          conserved(entry),
      ) &&
      value.unfunded ===
        value.months.some((entry) => entry.shortfall.amountMinor !== "0") &&
      new Set(value.unassessed.map((entry) => entry.goalId)).size ===
        value.unassessed.length,
  );
export type DatedContributionAssessment = z.infer<
  typeof datedContributionAssessmentSchema
>;
