import { z } from "zod";
import { aggregateMoneySchema } from "./reporting-primitives.js";
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
        datasetVersion: positiveVersionSchema,
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
        ]),
      )
      .max(50),
    valuations: z.array(valuationReferenceSchema).max(50),
    asOfDate: calendarDateSchema,
    adultNetWorth: aggregateMoneySchema,
    liquidAdultAssets: aggregateMoneySchema,
  })
  .strict()
  .refine((summary) => {
    const scopedAccounts = new Set(
      summary.scope.accountIds.map((id) => id.toLowerCase()),
    );
    if (scopedAccounts.size !== summary.scope.accountIds.length) return false;
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
      valuedAccounts.add(accountId);
      valuationIds.add(valuationId);
    }
    return true;
  });
export type WealthSummaryDto = z.infer<typeof wealthSummaryDtoSchema>;
