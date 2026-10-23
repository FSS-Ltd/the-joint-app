import { z } from "zod";
import { moneySchema } from "./accounts.js";
import { categoryLabelSchema } from "./reporting-primitives.js";

export const classificationKindSchema = z.enum([
  "EXPENSE",
  "INCOME",
  "REFUND",
  "TRANSFER",
  "DEBT_PAYMENT",
  "PRINCIPAL",
  "CONTRIBUTION",
  "UNCLASSIFIED",
]);
export type ClassificationKind = z.infer<typeof classificationKindSchema>;
export const splitInputSchema = z
  .object({
    category: categoryLabelSchema,
    money: moneySchema,
    classificationKind: classificationKindSchema,
  })
  .strict();
export const transactionSplitsSchema = z
  .object({
    lines: z
      .array(splitInputSchema)
      .max(20)
      .refine((value) => value.length === 0 || value.length >= 2),
  })
  .strict();
export const splitSchema = splitInputSchema
  .extend({ id: z.uuid(), position: z.number().int().nonnegative() })
  .strict();
export const transactionTransferSchema = z
  .object({
    confirmed: z.boolean(),
    id: z.uuid().nullable(),
    canRemove: z.boolean(),
  })
  .strict();
