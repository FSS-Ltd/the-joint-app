import { z } from "zod";

export const leaveHouseholdSchema = z.strictObject({
  confirmation: z.literal("LEAVE_HOUSEHOLD"),
  requestId: z.uuid(),
});
export const leaveHouseholdResponseSchema = z.strictObject({
  left: z.literal(true),
});
export const deletionRequestSchema = z.strictObject({
  confirmation: z.literal("DELETE_MY_ACCOUNT"),
  requestId: z.uuid(),
});
export const deletionStateSchema = z.enum([
  "PENDING",
  "PROVIDER_PENDING",
  "COMPLETED",
]);
export const deletionReceiptSchema = z.strictObject({
  id: z.uuid(),
  state: deletionStateSchema,
  statusToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.iso.datetime(),
});
export const deletionPublicReceiptSchema = deletionReceiptSchema.omit({
  statusToken: true,
});
export const deletionStatusSchema = z.strictObject({
  id: z.uuid(),
  state: deletionStateSchema,
  requestedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type DeletionReceipt = z.infer<typeof deletionReceiptSchema>;
export type DeletionStatus = z.infer<typeof deletionStatusSchema>;
export const privacyEnvironmentSchema = z.object({
  PRIVACY_JOURNAL_PATH: z
    .string()
    .min(1)
    .max(4096)
    .refine((value) => value.startsWith("/") && !value.includes("\0")),
});
export const privacyWorkerEnvironmentSchema = z.object({
  PRIVACY_AUTH_URL: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }),
  PRIVACY_AUTH_ADMIN_KEY: z.string().min(20).max(4096).regex(/^\S+$/),
});
