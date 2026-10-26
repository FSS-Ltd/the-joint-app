import { z } from "zod";
import { contributionPlanDtoSchema } from "./goals.js";
import {
  monthEndDateSchema,
  monthEndWithinHorizon,
  positiveVersionSchema,
} from "./projection-primitives.js";

const schedule = {
  firstContributionDate: monthEndDateSchema,
  monthlyContributions: contributionPlanDtoSchema.shape.monthlyContributions,
};
export const contributionCapacitySchema = z
  .object({
    ...schedule,
    horizonMonths: z.number().int().min(1).max(600),
  })
  .strict()
  .refine(
    (value) =>
      monthEndWithinHorizon(value.firstContributionDate, value.horizonMonths) &&
      value.monthlyContributions.every(
        (step) => step.fromMonth <= value.horizonMonths,
      ),
  );
export type ContributionCapacity = z.infer<typeof contributionCapacitySchema>;

export const contributionPlanWriteSchema = z
  .object({
    ...schedule,
    expectedGoalVersion: positiveVersionSchema,
    expectedPlanVersion: z.number().int().min(0).max(2147483647),
  })
  .strict()
  .refine((value) => monthEndWithinHorizon(value.firstContributionDate, 600));
export type ContributionPlanWrite = z.infer<typeof contributionPlanWriteSchema>;

export const contributionPlanEntrySchema = z
  .object({
    goalVersion: positiveVersionSchema,
    priority: z.number().int().min(1).max(1000),
    status: z.enum(["ACTIVE", "ARCHIVED"]),
    plan: contributionPlanDtoSchema,
  })
  .strict()
  .refine(({ plan }) =>
    [plan.id, plan.goalId, plan.householdId].every(
      (id) => id === id.toLowerCase(),
    ),
  );
export type ContributionPlanEntry = z.infer<typeof contributionPlanEntrySchema>;

export const datedContributionInputSchema = z
  .object({
    capacity: contributionCapacitySchema,
    plans: z
      .array(contributionPlanEntrySchema)
      .max(50)
      .refine(
        (plans) =>
          new Set(plans.map((entry) => entry.plan.goalId)).size ===
          plans.length,
      ),
  })
  .strict();
