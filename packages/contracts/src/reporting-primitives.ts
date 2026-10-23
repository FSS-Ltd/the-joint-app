import { z } from "zod";
import { financialTextSchema } from "./financial-input.js";

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)
  .refine(
    (value) => value.slice(0, 4) !== "0000" && value.slice(0, 4) !== "9999",
  );
export const scopeAccountIdsSchema = z
  .array(z.uuid().transform((value) => value.toLowerCase()))
  .min(1)
  .max(50)
  .refine((value) => new Set(value).size === value.length)
  .transform((value) => [...value].sort());
export const scopeQuerySchema = z
  .string()
  .min(1)
  .max(1849)
  .transform((value) => value.split(","))
  .pipe(scopeAccountIdsSchema);
export const aggregateMinorSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,39}|-[1-9]\d{0,39})$/);
export const aggregateMoneySchema = z
  .object({ amountMinor: aggregateMinorSchema, currency: z.literal("GBP") })
  .strict();
export type AggregateMoney = z.infer<typeof aggregateMoneySchema>;
export const categoryLabelSchema = financialTextSchema
  .trim()
  .min(1)
  .max(80)
  .nullable();
export const coverageReasonSchema = z.enum([
  "MISSING_HISTORY",
  "OPEN_PERIOD",
  "UNREVIEWED",
  "UNCLASSIFIED",
  "UNKNOWN_DEBT_SERVICE",
  "NO_ACCOUNTS",
]);
export type CoverageReason = z.infer<typeof coverageReasonSchema>;
