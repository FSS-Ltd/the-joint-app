import { z } from "zod";
import { goalAllocationSchema } from "./goals.js";
import {
  calendarDateSchema,
  positiveVersionSchema,
  timestampSchema,
} from "./projection-primitives.js";
import { allocationPositionSchema } from "./goal-allocation-position.js";
import {
  allocationAccountIdsSchema,
  allocationSourceVersionsSchema,
  allocationControlledScopeSchema,
  matchesAllocationSources,
} from "./goal-allocation-scope.js";

const allocations = z
  .array(goalAllocationSchema)
  .max(50)
  .refine(
    (entries) =>
      new Set(entries.map((entry) => entry.accountId.toLowerCase())).size ===
      entries.length,
  );
export const goalAllocationWriteSchema = z
  .object({
    accountIds: allocationAccountIdsSchema,
    sourceVersions: allocationSourceVersionsSchema,
    allocations,
  })
  .strict()
  .refine(
    (value) =>
      matchesAllocationSources(value.accountIds, value.sourceVersions) &&
      value.allocations.every((entry) =>
        value.accountIds.some(
          (id) => id.toLowerCase() === entry.accountId.toLowerCase(),
        ),
      ),
  );
export type GoalAllocationWrite = z.infer<typeof goalAllocationWriteSchema>;

export const goalAllocationSetDtoSchema = z
  .object({
    schema: z.literal("goal-allocation-set"),
    schemaVersion: z.literal(2),
    householdId: z.uuid(),
    goalId: z.uuid(),
    version: positiveVersionSchema,
    scope: allocationControlledScopeSchema,
    allocations,
    positions: z.array(allocationPositionSchema).min(1).max(50),
    asOfDate: calendarDateSchema,
    calculatedAt: timestampSchema,
  })
  .strict()
  .refine((value) => {
    if (!matchesAllocationSources(value.scope.accountIds, value.positions))
      return false;
    const selected = new Set(value.scope.accountIds);
    if (
      !value.allocations.every(
        (entry) =>
          selected.has(entry.accountId) &&
          entry.valuationId === entry.valuationId.toLowerCase(),
      )
    )
      return false;
    return value.positions.every((position, index) => {
      if (position.accountId !== value.scope.accountIds[index]) return false;
      const entry = value.allocations.find(
        (allocation) => allocation.accountId === position.accountId,
      );
      if (position.status === "UNAVAILABLE") return true;
      return entry
        ? entry.basis !== "FIXED" ||
            entry.amount.amountMinor === position.allocated.amountMinor
        : position.allocated.amountMinor === "0";
    });
  });
export type GoalAllocationSetDto = z.infer<typeof goalAllocationSetDtoSchema>;

export const goalAllocationRevisionSchema = z
  .object({
    householdId: z.uuid(),
    accountId: z.uuid(),
    goalId: z.uuid(),
    version: positiveVersionSchema,
    allocation: goalAllocationSchema.nullable(),
    createdAt: timestampSchema,
  })
  .strict()
  .refine(
    (entry) =>
      entry.allocation === null ||
      (entry.allocation.accountId === entry.accountId &&
        entry.allocation.valuationId ===
          entry.allocation.valuationId.toLowerCase()),
  );
export type GoalAllocationRevision = z.infer<
  typeof goalAllocationRevisionSchema
>;

function validHistory(
  view: GoalAllocationSetDto,
  history: readonly GoalAllocationRevision[],
): boolean {
  const versions = new Map(
    view.scope.sources.map((source) => [source.accountId, source.version]),
  );
  return history.every((entry, index) => {
    const ceiling = versions.get(entry.accountId),
      previous = history[index - 1];
    return (
      entry.householdId === view.householdId &&
      entry.goalId === view.goalId &&
      ceiling !== undefined &&
      entry.version <= ceiling &&
      (!previous ||
        previous.accountId < entry.accountId ||
        (previous.accountId === entry.accountId &&
          previous.version < entry.version))
    );
  });
}
const page = {
  view: goalAllocationSetDtoSchema,
  history: z.array(goalAllocationRevisionSchema).max(50),
};
export const goalAllocationPageSchema = z
  .object({
    ...page,
    nextCursor: z.string().min(1).max(4096).nullable(),
  })
  .strict()
  .refine(
    (value) =>
      validHistory(value.view, value.history) &&
      (value.nextCursor === null || value.history.length === 50),
  );
export type GoalAllocationPage = z.infer<typeof goalAllocationPageSchema>;

export const allocationHistoryCursorSchema = z
  .object({ accountId: z.uuid(), version: positiveVersionSchema })
  .strict();
export const goalAllocationRawPageSchema = z
  .object({
    ...page,
    nextAfter: allocationHistoryCursorSchema.nullable(),
  })
  .strict()
  .refine((value) => {
    const last = value.history.at(-1);
    return (
      validHistory(value.view, value.history) &&
      (value.nextAfter === null ||
        (value.history.length === 50 &&
          value.nextAfter.accountId === last?.accountId &&
          value.nextAfter.version === last.version))
    );
  });
export type GoalAllocationRawPage = z.infer<typeof goalAllocationRawPageSchema>;
