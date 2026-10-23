import { z } from "zod";

export const exportScopeSchema = z.strictObject({
  accountIds: z
    .array(z.uuid())
    .min(1)
    .max(50)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Account IDs must be unique",
    ),
});
export type ExportScope = z.infer<typeof exportScopeSchema>;
export const exportStateSchema = z.enum([
  "QUEUED",
  "PROCESSING",
  "READY",
  "INVALIDATED",
  "EXPIRED",
  "FAILED",
]);
export const exportStatusSchema = z.strictObject({
  id: z.uuid(),
  state: exportStateSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  downloadExpiresAt: z.iso.datetime().nullable(),
});
export type ExportStatus = z.infer<typeof exportStatusSchema>;
