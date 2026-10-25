import { z } from "zod";

const id = z.uuid();
export const statusSubscriptionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("import"), householdId: id, id }).strict(),
  z.object({ kind: z.literal("export"), householdId: id, id }).strict(),
  z.object({ kind: z.literal("archive-export"), id }).strict(),
  z.object({ kind: z.literal("deletion"), id }).strict(),
]);
export type StatusSubscription = z.infer<typeof statusSubscriptionSchema>;
export const statusSignalSchema = z.enum([
  "change",
  "invalidate",
  "renew",
  "reconnect",
]);
export type StatusSignal = z.infer<typeof statusSignalSchema>;
export const statusSignalPayloadSchema = z.object({}).strict();
