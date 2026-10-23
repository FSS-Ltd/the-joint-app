import { z } from "zod";
import { transactionSchema } from "./transactions.js";

export const transferConfirmSchema = z
  .object({
    fromTransactionId: z.uuid(),
    toTransactionId: z.uuid(),
    fromVersion: z.number().int().positive(),
    toVersion: z.number().int().positive(),
  })
  .strict()
  .refine((value) => value.fromTransactionId !== value.toTransactionId);
export const transferRemoveSchema = z
  .object({
    fromVersion: z.number().int().positive(),
    toVersion: z.number().int().positive(),
  })
  .strict();
export const transferResultSchema = z
  .object({ id: z.uuid(), from: transactionSchema, to: transactionSchema })
  .strict();
