import { z } from "zod";
import { accountListQuerySchema } from "./accounts.js";
import { scopeQuerySchema } from "./reporting-primitives.js";

const id = z.uuid();
export const statusSubscriptionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("wealth"),
      householdId: id,
      accountIds: scopeQuerySchema.transform((ids) => ids.join(",")).optional(),
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
  z.object({ kind: z.literal("import"), householdId: id, id }).strict(),
  z.object({ kind: z.literal("export"), householdId: id, id }).strict(),
  z.object({ kind: z.literal("archive-export"), id }).strict(),
  z.object({ kind: z.literal("deletion"), id }).strict(),
]);
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
