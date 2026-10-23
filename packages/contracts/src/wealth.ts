import { z } from "zod";
import {
  aggregateMoneySchema,
  scopeQuerySchema,
} from "./reporting-primitives.js";
import {
  calendarDateSchema,
  positiveVersionSchema,
  valuationReferenceSchema,
} from "./projection-primitives.js";

export const wealthSummaryDtoSchema = z
  .object({
    schema: z.literal("wealth-summary"),
    schemaVersion: z.literal(1),
    householdId: z.uuid(),
    scope: z
      .object({
        kind: z.literal("VISIBLE"),
        accountIds: z.array(z.uuid()).max(50),
        sources: z
          .array(
            z
              .object({
                accountId: z.uuid(),
                totalsVersion: positiveVersionSchema,
                valuationId: z.uuid().nullable(),
              })
              .strict(),
          )
          .max(50),
        grantVersion: z.number().int().nonnegative().max(2147483647),
      })
      .strict(),
    completeness: z.enum(["COMPLETE", "PARTIAL"]),
    excludedReasons: z
      .array(
        z.enum([
          "NO_ACCOUNTS",
          "MISSING_VALUATION",
          "STALE_VALUATION",
          "UNSUPPORTED_CURRENCY",
          "UNKNOWN_ADULT_PORTION",
          "INCOMPLETE_VALUATION",
          "FUTURE_VALUATION",
          "INVALID_VALUATION",
        ]),
      )
      .max(50),
    valuations: z.array(valuationReferenceSchema).max(50),
    asOfDate: calendarDateSchema,
    calculatedAt: z.iso.datetime(),
    adultNetWorth: aggregateMoneySchema.nullable(),
    liquidAdultAssets: aggregateMoneySchema.nullable(),
  })
  .strict()
  .refine((summary) => {
    const scopedAccounts = new Set(
      summary.scope.accountIds.map((id) => id.toLowerCase()),
    );
    if (scopedAccounts.size !== summary.scope.accountIds.length) return false;
    const sourceIds = summary.scope.sources.map((source) =>
      source.accountId.toLowerCase(),
    );
    const ids = summary.scope.accountIds.map((id) => id.toLowerCase());
    if (
      sourceIds.length !== ids.length ||
      ids.some(
        (id, index) =>
          id !== sourceIds[index] ||
          (index > 0 && id <= (ids[index - 1] ?? "")),
      )
    )
      return false;
    const valuedAccounts = new Set<string>();
    const valuationIds = new Set<string>();
    for (const valuation of summary.valuations) {
      const accountId = valuation.accountId.toLowerCase();
      const valuationId = valuation.valuationId.toLowerCase();
      if (
        !scopedAccounts.has(accountId) ||
        valuedAccounts.has(accountId) ||
        valuationIds.has(valuationId)
      )
        return false;
      const source = summary.scope.sources.find(
        (item) => item.accountId.toLowerCase() === accountId,
      );
      if (source?.valuationId?.toLowerCase() !== valuationId) return false;
      valuedAccounts.add(accountId);
      valuationIds.add(valuationId);
    }
    return summary.scope.sources.every(
      (source) =>
        source.valuationId === null ||
        valuedAccounts.has(source.accountId.toLowerCase()),
    );
  });
export type WealthSummaryDto = z.infer<typeof wealthSummaryDtoSchema>;

export const wealthQuerySchema = z
  .object({ accountIds: scopeQuerySchema.optional() })
  .strict();
