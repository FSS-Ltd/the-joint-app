import { z } from "zod";
import { accountListQuerySchema } from "./accounts.js";
import { scopeQuerySchema } from "./reporting-primitives.js";
import { transactionListQueryBase } from "./transactions.js";

const id = z.uuid();
export const statusSubscriptionSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("wealth"),
        householdId: id,
        accountIds: scopeQuerySchema
          .transform((ids) => ids.join(","))
          .optional(),
      })
      .strict(),
    z.object({ kind: z.literal("account"), householdId: id, id }).strict(),
    z
      .object({
        kind: z.literal("accounts"),
        householdId: id,
        ...accountListQuerySchema.shape,
      })
      .strict(),
    z
      .object({
        kind: z.literal("transactions"),
        householdId: id,
        ...transactionListQueryBase.shape,
        uncategorized: z.enum(["true", "false"]).optional(),
      })
      .strict(),
    z.object({ kind: z.literal("spending"), householdId: id }).strict(),
    z.object({ kind: z.literal("import"), householdId: id, id }).strict(),
    z.object({ kind: z.literal("export"), householdId: id, id }).strict(),
    z.object({ kind: z.literal("archive-export"), id }).strict(),
    z.object({ kind: z.literal("deletion"), id }).strict(),
  ])
  .refine(
    // Refining the union keeps every member's discriminated type intact.
    (value) =>
      value.kind !== "transactions" ||
      !(value.category !== undefined && value.uncategorized === "true"),
  );
export type StatusSubscription = z.infer<typeof statusSubscriptionSchema>;
export function statusSubscriptionQuery(selector: StatusSubscription): string {
  const parsed = statusSubscriptionSchema.parse(selector);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return query.toString();
}
export const statusSignalSchema = z.enum([
  "change",
  "invalidate",
  "renew",
  "reconnect",
]);
export type StatusSignal = z.infer<typeof statusSignalSchema>;
export const statusSignalPayloadSchema = z.object({}).strict();
