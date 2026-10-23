import { z } from "zod";
import { financialTextSchema, bookedDateSchema } from "./financial-input.js";
import { moneySchema } from "./accounts.js";

const descriptionSchema = financialTextSchema.trim().min(1).max(500);
export const transactionCreateSchema = z
  .object({
    accountId: z.uuid(),
    bookedDate: bookedDateSchema,
    money: moneySchema,
    description: descriptionSchema,
  })
  .strict();
export const transactionPatchSchema = transactionCreateSchema.omit({
  accountId: true,
});
export const transactionAnnotationSchema = z
  .object({
    category: financialTextSchema.trim().min(1).max(80).nullable().optional(),
    merchant: financialTextSchema.trim().min(1).max(120).nullable().optional(),
    note: financialTextSchema.trim().min(1).max(2000).nullable().optional(),
    noteVersion: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.category !== undefined ||
      value.merchant !== undefined ||
      value.note !== undefined,
  )
  .refine(
    (value) => (value.note !== undefined) === (value.noteVersion !== undefined),
  );
export const transactionSchema = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    bookedDate: bookedDateSchema,
    money: moneySchema,
    description: descriptionSchema,
    source: z.enum(["CSV", "MANUAL"]),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    category: z.string().nullable(),
    merchant: z.string().nullable(),
    note: z
      .object({
        body: z.string().nullable(),
        version: z.number().int().nonnegative(),
      })
      .strict(),
    permissions: z
      .object({
        canCorrect: z.boolean(),
        canClassify: z.boolean(),
        canNote: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type TransactionResponse = z.infer<typeof transactionSchema>;
export const transactionListSchema = z
  .object({
    items: z.array(transactionSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const transactionListQuerySchema = z
  .object({
    accountId: z.uuid(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
