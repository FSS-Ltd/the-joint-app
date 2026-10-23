import { z } from "zod";
import {
  calendarDateSchema,
  fractionSchema,
  monthEndDateSchema,
  monthEndWithinHorizon,
  nonnegativeMoneySchema,
  positiveVersionSchema,
} from "./projection-primitives.js";

const goalIdentity = {
  id: z.uuid(),
  householdId: z.uuid(),
  goalId: z.uuid(),
  version: positiveVersionSchema,
};
export const goalDtoSchema = z
  .object({
    schema: z.literal("goal"),
    schemaVersion: z.literal(1),
    id: z.uuid(),
    householdId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    status: z.enum(["ACTIVE", "ARCHIVED"]),
    beneficiary: z.literal("ADULT"),
    priority: z.number().int().min(1).max(1000),
    version: positiveVersionSchema,
    target: nonnegativeMoneySchema,
    targetDate: calendarDateSchema.nullable(),
  })
  .strict();
export type GoalDto = z.infer<typeof goalDtoSchema>;

const allocationCommon = { accountId: z.uuid(), valuationId: z.uuid() };
export const goalAllocationSchema = z.discriminatedUnion("basis", [
  z
    .object({
      basis: z.literal("FIXED"),
      ...allocationCommon,
      amount: nonnegativeMoneySchema,
    })
    .strict(),
  z
    .object({
      basis: z.literal("FRACTION"),
      ...allocationCommon,
      fraction: fractionSchema,
    })
    .strict(),
]);
export const goalAllocationSetDtoSchema = z
  .object({
    schema: z.literal("goal-allocation-set"),
    schemaVersion: z.literal(1),
    ...goalIdentity,
    allocations: z.array(goalAllocationSchema).max(50),
  })
  .strict();
export type GoalAllocationSetDto = z.infer<typeof goalAllocationSetDtoSchema>;

export const monthlyContributionSchema = z
  .object({
    fromMonth: z.number().int().min(1).max(600),
    amount: nonnegativeMoneySchema,
  })
  .strict();
export const contributionPlanDtoSchema = z
  .object({
    schema: z.literal("contribution-plan"),
    schemaVersion: z.literal(1),
    ...goalIdentity,
    firstContributionDate: monthEndDateSchema,
    monthlyContributions: z
      .array(monthlyContributionSchema)
      .min(1)
      .max(600)
      .refine(
        (entries) =>
          entries[0]?.fromMonth === 1 &&
          entries.every(
            (entry, i) =>
              i === 0 || entry.fromMonth > entries[i - 1]!.fromMonth,
          ),
      ),
  })
  .strict()
  .refine((plan) => monthEndWithinHorizon(plan.firstContributionDate, 600));
export type ContributionPlanDto = z.infer<typeof contributionPlanDtoSchema>;
