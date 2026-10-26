import { z } from "zod";
import {
  positiveVersionSchema,
  timestampSchema,
} from "./projection-primitives.js";
import {
  contributionCapacitySchema,
  contributionPlanEntrySchema,
} from "./contribution-schedules.js";
import {
  contributionBudgetViewSchema,
  contributionRawViewSchema,
  type ContributionRawView,
} from "./contribution-budget.js";

export const contributionRevisionSchema = z
  .object({
    budgetId: z.uuid(),
    householdId: z.uuid(),
    version: positiveVersionSchema,
    createdAt: timestampSchema,
    change: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("CAPACITY"),
          capacity: contributionCapacitySchema,
        })
        .strict(),
      z
        .object({
          kind: z.enum(["PLAN", "GOAL"]),
          entry: contributionPlanEntrySchema,
        })
        .strict(),
    ]),
  })
  .strict()
  .refine(
    ({ householdId, change }) =>
      change.kind === "CAPACITY" ||
      change.entry.plan.householdId === householdId,
  );
export type ContributionRevision = z.infer<typeof contributionRevisionSchema>;

function historyMatches(
  view: ContributionRawView,
  history: readonly ContributionRevision[],
): boolean {
  return history.every(
    (entry, index) =>
      entry.budgetId === view.budget.id &&
      entry.householdId === view.budget.householdId &&
      entry.version <= view.budget.version &&
      (index === 0 || history[index - 1]!.version < entry.version),
  );
}
export const contributionRawPageSchema = z
  .object({
    view: contributionRawViewSchema,
    history: z.array(contributionRevisionSchema).max(50),
    nextAfterVersion: positiveVersionSchema.nullable(),
  })
  .strict()
  .refine(
    ({ view, history, nextAfterVersion }) =>
      historyMatches(view, history) &&
      (nextAfterVersion === null ||
        (history.length === 50 &&
          history.at(-1)?.version === nextAfterVersion)),
  );
export type ContributionRawPage = z.infer<typeof contributionRawPageSchema>;

export const contributionPageSchema = z
  .object({
    view: contributionBudgetViewSchema,
    history: z.array(contributionRevisionSchema).max(50),
    nextCursor: z.string().min(1).max(4096).nullable(),
  })
  .strict()
  .refine(
    ({ view, history, nextCursor }) =>
      historyMatches(view, history) &&
      (nextCursor === null || history.length === 50),
  );
export type ContributionPage = z.infer<typeof contributionPageSchema>;
export const contributionQuerySchema = z
  .object({ cursor: z.string().min(1).max(4096).optional() })
  .strict();
const budgets = z
  .array(z.object({ id: z.uuid(), householdId: z.uuid() }).strict())
  .max(50)
  .refine((entries) =>
    entries.every(
      (entry, index) => index === 0 || entries[index - 1]!.id < entry.id,
    ),
  );
export const contributionArchiveRawListSchema = z
  .object({
    budgets,
    nextAfterId: z.uuid().nullable(),
  })
  .strict()
  .refine(
    ({ budgets: entries, nextAfterId }) =>
      nextAfterId === null ||
      (entries.length === 50 && entries.at(-1)?.id === nextAfterId),
  );
export const contributionArchiveListSchema = z
  .object({
    budgets,
    nextCursor: z.string().min(1).max(4096).nullable(),
  })
  .strict()
  .refine(
    ({ budgets: entries, nextCursor }) =>
      nextCursor === null || entries.length === 50,
  );
export type ContributionArchiveList = z.infer<
  typeof contributionArchiveListSchema
>;
