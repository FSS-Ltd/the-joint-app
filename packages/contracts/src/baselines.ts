import { z } from "zod";
import {
  scopeAccountIdsSchema,
  scopeQuerySchema,
} from "./reporting-primitives.js";

export const baselineWindowSizeSchema = z.union([
  z.literal(3),
  z.literal(6),
  z.literal(12),
]);
export type BaselineWindowSize = z.infer<typeof baselineWindowSizeSchema>;

export const monthBaselineWindowSchema = z
  .object({
    windowMonths: baselineWindowSizeSchema,
    complete: z.boolean(),
    months: z.array(z.string().regex(/^\d{4}-\d{2}$/)).max(12),
    meanSpendingMinor: z.string().regex(/^\d+$/),
    medianSpendingMinor: z.string().regex(/^\d+$/),
    meanIncomeMinor: z.string().regex(/^\d+$/),
    medianIncomeMinor: z.string().regex(/^\d+$/),
    percentile25IncomeMinor: z.string().regex(/^\d+$/).nullable(),
    currency: z.literal("GBP"),
    isVariableIncome: z.boolean(),
    insufficientHistory: z.boolean(),
  })
  .strict();
export type MonthBaselineWindowDto = z.infer<typeof monthBaselineWindowSchema>;

export const baselinesReportSchema = z
  .object({
    calculatedAt: z.iso.datetime(),
    windows: z.array(monthBaselineWindowSchema).max(3),
    proposedBaselineSpendingMinor: z.string().regex(/^\d+$/).nullable(),
    proposedBaselineIncomeMinor: z.string().regex(/^\d+$/).nullable(),
    requiresIncomeConfirmation: z.boolean(),
    insufficientHistory: z.boolean(),
    scopeAccountIds: scopeAccountIdsSchema,
  })
  .strict();
export type BaselinesReport = z.infer<typeof baselinesReportSchema>;

export const baselinesQuerySchema = z
  .object({ accountIds: scopeQuerySchema.optional() })
  .strict();
