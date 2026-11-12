import { z } from "zod";
import { moneySchema } from "./accounts.js";
import { bookedDateSchema } from "./financial-input.js";
import { scopeQuerySchema } from "./reporting-primitives.js";

export const csvBalanceQuerySchema = z
  .object({ accountIds: scopeQuerySchema })
  .strict();
export const csvBalanceSchema = z.discriminatedUnion("status", [
  z
    .object({
      accountId: z.uuid(),
      status: z.literal("AVAILABLE"),
      basis: z.literal("MANUAL_PLUS_LEDGER"),
      money: moneySchema,
      anchorId: z.uuid(),
      anchorDate: bookedDateSchema,
      throughDate: bookedDateSchema,
    })
    .strict(),
  z
    .object({
      accountId: z.uuid(),
      status: z.enum([
        "MISSING_ANCHOR",
        "UNSUPPORTED",
        "NO_ACTIVITY",
        "OUT_OF_RANGE",
      ]),
    })
    .strict(),
]);
export const csvBalanceListSchema = z
  .object({ items: z.array(csvBalanceSchema).max(50) })
  .strict();
export type CsvBalance = z.infer<typeof csvBalanceSchema>;
