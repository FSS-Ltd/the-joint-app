import { z } from "zod";
import { accountKindSchema } from "./accounts.js";
import { bookedDateSchema } from "./financial-input.js";
import { budgetSchema, accountCoverageSchema } from "./budgets.js";
import {
  aggregateMoneySchema,
  categoryLabelSchema,
  coverageReasonSchema,
  monthSchema,
  scopeQuerySchema,
} from "./reporting-primitives.js";

const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const spendCategorySchema = z
  .object({
    category: categoryLabelSchema,
    grouped: z.boolean(),
    spending: aggregateMoneySchema,
    count: countSchema,
  })
  .strict();
export const spendSummarySchema = z
  .object({
    spending: aggregateMoneySchema,
    income: aggregateMoneySchema,
    transferIn: aggregateMoneySchema,
    transferOut: aggregateMoneySchema,
    debtServiceOut: aggregateMoneySchema,
    debtSettlementIn: aggregateMoneySchema,
    principalIn: aggregateMoneySchema,
    principalOut: aggregateMoneySchema,
    contributionIn: aggregateMoneySchema,
    contributionOut: aggregateMoneySchema,
    unclassifiedIn: aggregateMoneySchema,
    unclassifiedOut: aggregateMoneySchema,
    netCash: aggregateMoneySchema,
    categories: z.array(spendCategorySchema),
    unreviewedCount: countSchema,
    unclassifiedCount: countSchema,
    unknownDebtCount: countSchema,
    consumptionComplete: z.boolean(),
  })
  .strict();
export type SpendSummary = z.infer<typeof spendSummarySchema>;
export const reportAccountSchema = z
  .object({
    id: z.uuid(),
    label: z.string(),
    kind: accountKindSchema,
    ownership: z.enum(["OWNED", "SHARED"]),
    version: z.number().int().positive(),
    coverage: accountCoverageSchema,
  })
  .strict();
export const spendingQuerySchema = z
  .object({ month: monthSchema, accountIds: scopeQuerySchema.optional() })
  .strict();
export const categoryQuerySchema = z
  .object({ accountIds: scopeQuerySchema.optional() })
  .strict();
export const categoriesSchema = z
  .object({ items: z.array(categoryLabelSchema).max(200) })
  .strict();
export const spendingReportSchema = z
  .object({
    month: monthSchema,
    startDate: bookedDateSchema,
    endDateExclusive: bookedDateSchema,
    scopeKey: z.string().regex(/^[a-f0-9]{64}$/),
    permissionKey: z.string().regex(/^[a-f0-9]{64}$/),
    calculatedAt: z.iso.datetime(),
    scope: z.array(reportAccountSchema).max(50),
    coverage: z
      .object({
        complete: z.boolean(),
        closedPeriod: z.boolean(),
        reasons: z.array(coverageReasonSchema),
        missingAccountIds: z.array(z.uuid()).max(50),
      })
      .strict(),
    summary: spendSummarySchema.nullable(),
    trend: z
      .array(
        z
          .object({
            month: monthSchema,
            spending: aggregateMoneySchema,
            income: aggregateMoneySchema,
            netCash: aggregateMoneySchema,
            complete: z.boolean(),
            closedPeriod: z.boolean(),
          })
          .strict(),
      )
      .max(6),
    comparison: z
      .object({ previousMonth: monthSchema, change: aggregateMoneySchema })
      .strict()
      .nullable(),
    budget: budgetSchema.nullable(),
    provenance: z
      .object({
        source: z.literal("CSV_MANUAL"),
        latestRecordDate: bookedDateSchema.nullable(),
        sourceRowCount: countSchema,
      })
      .strict(),
  })
  .strict();
export type SpendingReport = z.infer<typeof spendingReportSchema>;
