import { z } from "zod";
import { moneySchema } from "./accounts.js";
import {
  categoryLabelSchema,
  monthSchema,
  scopeAccountIdsSchema,
  scopeQuerySchema,
} from "./reporting-primitives.js";

export const budgetLineSchema = z
  .object({
    category: categoryLabelSchema,
    limit: moneySchema.refine((value) => BigInt(value.amountMinor) >= 0n),
  })
  .strict();
export const budgetUpsertSchema = z
  .object({
    accountIds: scopeAccountIdsSchema,
    lines: z
      .array(budgetLineSchema)
      .max(100)
      .refine(
        (value) =>
          new Set(value.map((line) => line.category)).size === value.length,
      ),
  })
  .strict();
export const budgetSchema = z
  .object({
    id: z.uuid(),
    scopeId: z.uuid(),
    month: monthSchema,
    accountIds: scopeAccountIdsSchema,
    currency: z.literal("GBP"),
    version: z.number().int().positive(),
    lines: z.array(budgetLineSchema).max(100),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type BudgetResponse = z.infer<typeof budgetSchema>;
export const budgetQuerySchema = z
  .object({ accountIds: scopeQuerySchema.optional() })
  .strict();
export const accountCoverageInputSchema = z
  .object({ complete: z.boolean() })
  .strict();
export const accountCoverageSchema = z
  .object({
    version: z.number().int().nonnegative(),
    complete: z.boolean(),
    reviewedAt: z.iso.datetime().nullable(),
  })
  .strict();
