import { z } from "zod";
import {
  positiveVersionSchema,
  timestampSchema,
} from "./projection-primitives.js";
import {
  contributionCapacitySchema,
  contributionPlanEntrySchema,
} from "./contribution-schedules.js";
import { datedContributionAssessmentSchema } from "./contribution-assessment.js";

export const contributionBudgetDtoSchema = z
  .object({
    schema: z.literal("contribution-budget"),
    schemaVersion: z.literal(1),
    id: z.uuid(),
    householdId: z.uuid(),
    version: positiveVersionSchema,
    updatedAt: timestampSchema,
    capacity: contributionCapacitySchema,
  })
  .strict();
export type ContributionBudgetDto = z.infer<typeof contributionBudgetDtoSchema>;

export const contributionRawViewSchema = z
  .object({
    budget: contributionBudgetDtoSchema,
    plans: z.array(contributionPlanEntrySchema).max(50),
    selectedPlan: contributionPlanEntrySchema.nullable(),
  })
  .strict()
  .refine(
    ({ budget, plans, selectedPlan }) =>
      plans.every(
        (entry) =>
          entry.status === "ACTIVE" &&
          entry.plan.householdId === budget.householdId,
      ) &&
      new Set(plans.map((entry) => entry.plan.goalId)).size === plans.length &&
      (selectedPlan === null ||
        (selectedPlan.plan.householdId === budget.householdId &&
          (selectedPlan.status === "ARCHIVED"
            ? !plans.some(
                (entry) => entry.plan.goalId === selectedPlan.plan.goalId,
              )
            : plans.some(
                (entry) =>
                  JSON.stringify(entry) === JSON.stringify(selectedPlan),
              )))),
  );
export type ContributionRawView = z.infer<typeof contributionRawViewSchema>;

export const contributionBudgetViewSchema = contributionRawViewSchema
  .safeExtend({
    assessment: datedContributionAssessmentSchema,
  })
  .refine(({ budget, plans, assessment }) => {
    const ordered = [...plans].sort(
      (a, b) =>
        a.priority - b.priority ||
        (a.plan.goalId < b.plan.goalId
          ? -1
          : a.plan.goalId > b.plan.goalId
            ? 1
            : 0),
    );
    return (
      assessment.firstContributionDate ===
        budget.capacity.firstContributionDate &&
      assessment.months.length === budget.capacity.horizonMonths &&
      assessment.months.every(
        (month) =>
          month.goals.length === ordered.length &&
          month.goals.every(
            (entry, index) => entry.goalId === ordered[index]?.plan.goalId,
          ),
      ) &&
      assessment.unassessed.every((entry) =>
        plans.some((plan) => plan.plan.goalId === entry.goalId),
      )
    );
  });
export type ContributionBudgetView = z.infer<
  typeof contributionBudgetViewSchema
>;
