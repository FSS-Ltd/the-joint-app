import { z } from "zod";
import { scopeQuerySchema } from "./reporting-primitives.js";

export const recurringCadenceSchema = z.enum(["WEEKLY", "MONTHLY"]);
export type RecurringCadence = z.infer<typeof recurringCadenceSchema>;

export const candidateConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type CandidateConfidence = z.infer<typeof candidateConfidenceSchema>;

export const candidateStatusSchema = z.enum([
  "CANDIDATE",
  "CONFIRMED",
  "DISMISSED",
]);
export type CandidateStatus = z.infer<typeof candidateStatusSchema>;

export const recurringCandidateSchema = z
  .object({
    id: z.string().min(1).max(200),
    accountId: z.uuid(),
    currency: z.literal("GBP"),
    normalisedMerchant: z.string().min(1).max(120),
    cadence: recurringCadenceSchema,
    occurrenceCount: z.number().int().min(3),
    medianAmountMinor: z.string().regex(/^\d+$/),
    meanAmountMinor: z.string().regex(/^\d+$/),
    isVariable: z.boolean(),
    firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lastDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    confidence: candidateConfidenceSchema,
    category: z.string().nullable(),
    status: candidateStatusSchema,
  })
  .strict();
export type RecurringCandidateDto = z.infer<typeof recurringCandidateSchema>;

export const recurringCostsResponseSchema = z
  .object({
    candidates: z.array(recurringCandidateSchema).max(500),
    calculatedAt: z.iso.datetime(),
    windowDays: z.literal(180),
  })
  .strict();
export type RecurringCostsResponse = z.infer<
  typeof recurringCostsResponseSchema
>;

export const recurringQuerySchema = z
  .object({ accountIds: scopeQuerySchema.optional() })
  .strict();
